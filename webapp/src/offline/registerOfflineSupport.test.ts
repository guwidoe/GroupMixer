import { describe, expect, it, vi } from 'vitest';
import { registerOfflineSupportWithDeps } from './registerOfflineSupport';

function createStorageMock() {
  const values = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

describe('registerOfflineSupportWithDeps', () => {
  it('registers the service worker immediately in production', async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const register = vi.fn().mockResolvedValue({ update });
    const serviceWorkerAddEventListener = vi.fn();
    const storage = createStorageMock();

    registerOfflineSupportWithDeps({
      isProd: true,
      serviceWorker: {
        controller: null,
        register,
        addEventListener: serviceWorkerAddEventListener,
      },
      windowLike: {
        addEventListener: vi.fn(),
        setInterval: vi.fn(),
        location: { reload: vi.fn() } as unknown as Window['location'],
      },
      sessionStorageLike: storage as never,
      consoleLike: { warn: vi.fn() },
    });

    await Promise.resolve();

    expect(register).toHaveBeenCalledWith('/service-worker.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    expect(update).toHaveBeenCalled();
  });

  it('reloads once when a new controller takes over an existing session', () => {
    let controllerChangeHandler: (() => void) | undefined;
    const reload = vi.fn();
    const storage = createStorageMock();

    registerOfflineSupportWithDeps({
      isProd: true,
      serviceWorker: {
        controller: {},
        register: vi.fn().mockResolvedValue({ update: vi.fn().mockResolvedValue(undefined) }),
        addEventListener: vi.fn((event: string, handler: () => void) => {
          if (event === 'controllerchange') {
            controllerChangeHandler = handler;
          }
        }),
      },
      windowLike: {
        addEventListener: vi.fn(),
        setInterval: vi.fn(),
        location: { reload } as unknown as Window['location'],
      },
      sessionStorageLike: storage as never,
      consoleLike: { warn: vi.fn() },
    });

    controllerChangeHandler?.();
    controllerChangeHandler?.();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith('groupmixer.offline.reload-on-controllerchange', '1');
  });

  it('does nothing outside production', () => {
    const register = vi.fn();

    registerOfflineSupportWithDeps({
      isProd: false,
      serviceWorker: {
        controller: null,
        register,
        addEventListener: vi.fn(),
      },
      windowLike: {
        addEventListener: vi.fn(),
        setInterval: vi.fn(),
        location: { reload: vi.fn() } as unknown as Window['location'],
      },
      sessionStorageLike: createStorageMock() as never,
      consoleLike: { warn: vi.fn() },
    });

    expect(register).not.toHaveBeenCalled();
  });
});

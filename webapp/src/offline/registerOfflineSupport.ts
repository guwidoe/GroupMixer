interface ServiceWorkerContainerLike {
  controller: unknown;
  register: (scriptURL: string | URL, options?: RegistrationOptions) => Promise<ServiceWorkerRegistrationLike>;
  addEventListener: (type: 'controllerchange', listener: EventListenerOrEventListenerObject) => void;
}

interface ServiceWorkerRegistrationLike {
  update: () => Promise<void>;
}

interface OfflineSupportDeps {
  isProd: boolean;
  serviceWorker?: ServiceWorkerContainerLike;
  windowLike: Pick<Window, 'addEventListener' | 'setInterval' | 'location'>;
  sessionStorageLike: Pick<Storage, 'getItem' | 'setItem'>;
  consoleLike?: Pick<Console, 'warn'>;
}

const RELOAD_MARKER = 'groupmixer.offline.reload-on-controllerchange';

export function shouldEnableOfflineSupport(): boolean {
  return import.meta.env.PROD && typeof window !== 'undefined' && 'serviceWorker' in navigator;
}

export function registerOfflineSupportWithDeps({
  isProd,
  serviceWorker,
  windowLike,
  sessionStorageLike,
  consoleLike = console,
}: OfflineSupportDeps): void {
  if (!isProd || !serviceWorker) {
    return;
  }

  const hadController = Boolean(serviceWorker.controller);
  let reloadTriggered = false;

  serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloadTriggered) {
      return;
    }

    if (sessionStorageLike.getItem(RELOAD_MARKER) === '1') {
      return;
    }

    reloadTriggered = true;
    sessionStorageLike.setItem(RELOAD_MARKER, '1');
    windowLike.location.reload();
  });

  const register = async () => {
    try {
      const registration = await serviceWorker.register('/service-worker.js', {
        scope: '/',
        updateViaCache: 'none',
      });

      await registration.update().catch(() => undefined);
      windowLike.setInterval(() => {
        void registration.update().catch(() => undefined);
      }, 60_000);
    } catch (error) {
      consoleLike.warn('Offline support registration failed:', error);
    }
  };

  void register();
}

export function registerOfflineSupport(): void {
  registerOfflineSupportWithDeps({
    isProd: import.meta.env.PROD,
    serviceWorker: typeof navigator !== 'undefined' ? (navigator.serviceWorker as ServiceWorkerContainerLike) : undefined,
    windowLike: window,
    sessionStorageLike: window.sessionStorage,
  });
}

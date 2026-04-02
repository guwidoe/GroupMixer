import { describe, expect, it } from 'vitest';
import { RuntimeCancelledError, RuntimeError, isRuntimeCancelledError } from './runtime';

describe('runtime errors', () => {
  it('identifies the typed runtime cancellation error', () => {
    const error = new RuntimeCancelledError();

    expect(error.code).toBe('runtime_cancelled');
    expect(error.name).toBe('RuntimeCancelledError');
    expect(isRuntimeCancelledError(error)).toBe(true);
  });

  it('treats runtime_error values with runtime_cancelled code as cancellation', () => {
    const error = new RuntimeError('cancelled', { code: 'runtime_cancelled' });

    expect(isRuntimeCancelledError(error)).toBe(true);
  });

  it('does not misclassify unrelated runtime errors as cancellation', () => {
    const error = new RuntimeError('boom');

    expect(isRuntimeCancelledError(error)).toBe(false);
  });
});

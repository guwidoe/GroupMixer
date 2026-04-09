import { describe, expect, it } from 'vitest';
import {
  createProgressMailboxBuffer,
  createProgressMailboxReader,
  createProgressMailboxWriter,
  getProgressMailboxByteLength,
  getRuntimeProgressMailboxSupport,
  mailboxSnapshotToProgressUpdate,
} from './progressMailbox';

describe('progressMailbox', () => {
  it('allocates the expected shared buffer size', () => {
    const buffer = createProgressMailboxBuffer();

    expect(buffer).toBeInstanceOf(SharedArrayBuffer);
    expect(buffer.byteLength).toBe(getProgressMailboxByteLength());
  });

  it('writes and reads scalar progress snapshots consistently', () => {
    const buffer = createProgressMailboxBuffer();
    const writer = createProgressMailboxWriter(buffer);
    const reader = createProgressMailboxReader(buffer);

    writer.reset();
    writer.writeProgress({
      iteration: 12,
      max_iterations: 100,
      elapsed_seconds: 1.25,
      current_score: 9,
      best_score: 7,
      no_improvement_count: 4,
      effective_seed: 42,
    });

    const readResult = reader.read();
    expect(readResult).not.toBeNull();
    expect(readResult?.snapshot).toEqual(
      expect.objectContaining({
        status: 'running',
        iteration: 12,
        max_iterations: 100,
        elapsed_seconds: 1.25,
        current_score: 9,
        best_score: 7,
        no_improvement_count: 4,
        effective_seed: 42,
      }),
    );

    const progress = mailboxSnapshotToProgressUpdate(readResult!.snapshot);
    expect(progress).toEqual(
      expect.objectContaining({
        iteration: 12,
        elapsed_seconds: 1.25,
        best_score: 7,
        effective_seed: 42,
      }),
    );
  });

  it('tracks terminal status and stop reasons separately from scalar fields', () => {
    const buffer = createProgressMailboxBuffer();
    const writer = createProgressMailboxWriter(buffer);
    const reader = createProgressMailboxReader(buffer);

    writer.reset();
    writer.writeProgress({ iteration: 99, best_score: 3 });
    writer.setStatus('completed', { stopReason: 'max_iterations_reached' });

    expect(reader.read()?.snapshot).toEqual(
      expect.objectContaining({
        status: 'completed',
        stop_reason: 'max_iterations_reached',
        iteration: 99,
        best_score: 3,
      }),
    );
  });

  it('reports explicit unsupported-environment reasons when COI prerequisites are missing', () => {
    const withoutSab = getRuntimeProgressMailboxSupport({
      SharedArrayBuffer: undefined,
      crossOriginIsolated: true,
    } as unknown as typeof globalThis);
    expect(withoutSab.supported).toBe(false);
    expect(withoutSab.unavailableReason).toMatch(/SharedArrayBuffer is unavailable/i);

    const withoutCoi = getRuntimeProgressMailboxSupport({
      SharedArrayBuffer,
      crossOriginIsolated: false,
    } as unknown as typeof globalThis);
    expect(withoutCoi.supported).toBe(false);
    expect(withoutCoi.unavailableReason).toMatch(/crossOriginIsolated is false/i);
  });
});

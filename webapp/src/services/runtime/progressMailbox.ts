export interface RuntimeProgressMailboxSupport {
  transport: 'shared-mailbox';
  supported: boolean;
  requiresCrossOriginIsolation: true;
  crossOriginIsolated: boolean;
  sharedArrayBufferAvailable: boolean;
  unavailableReason?: string;
}

function hasSharedArrayBuffer(globalLike: typeof globalThis): boolean {
  return typeof globalLike.SharedArrayBuffer === 'function';
}

function hasCrossOriginIsolation(globalLike: typeof globalThis): boolean {
  return globalLike.crossOriginIsolated === true;
}

export function getRuntimeProgressMailboxSupport(
  globalLike: typeof globalThis = globalThis,
): RuntimeProgressMailboxSupport {
  const sharedArrayBufferAvailable = hasSharedArrayBuffer(globalLike);
  const crossOriginIsolated = hasCrossOriginIsolation(globalLike);
  const supported = sharedArrayBufferAvailable && crossOriginIsolated;

  let unavailableReason: string | undefined;
  if (!sharedArrayBufferAvailable) {
    unavailableReason = 'SharedArrayBuffer is unavailable in this environment.';
  } else if (!crossOriginIsolated) {
    unavailableReason = 'crossOriginIsolated is false; Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy are required.';
  }

  return {
    transport: 'shared-mailbox',
    supported,
    requiresCrossOriginIsolation: true,
    crossOriginIsolated,
    sharedArrayBufferAvailable,
    unavailableReason,
  };
}

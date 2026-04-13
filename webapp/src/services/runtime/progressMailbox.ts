import type { StopReason, ProgressUpdate } from '../wasm/types';

export interface RuntimeProgressMailboxSupport {
  transport: 'shared-mailbox';
  supported: boolean;
  requiresCrossOriginIsolation: true;
  crossOriginIsolated: boolean;
  sharedArrayBufferAvailable: boolean;
  unavailableReason?: string;
}

export type ProgressMailboxStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'failed';

export interface ProgressMailboxSnapshot {
  sequence: number;
  status: ProgressMailboxStatus;
  stop_reason?: StopReason;
  iteration: number;
  max_iterations: number;
  temperature: number;
  current_score: number;
  best_score: number;
  current_contacts: number;
  best_contacts: number;
  repetition_penalty: number;
  elapsed_seconds: number;
  no_improvement_count: number;
  clique_swaps_tried: number;
  clique_swaps_accepted: number;
  clique_swaps_rejected: number;
  transfers_tried: number;
  transfers_accepted: number;
  transfers_rejected: number;
  swaps_tried: number;
  swaps_accepted: number;
  swaps_rejected: number;
  overall_acceptance_rate: number;
  recent_acceptance_rate: number;
  avg_attempted_move_delta: number;
  avg_accepted_move_delta: number;
  biggest_accepted_increase: number;
  biggest_attempted_increase: number;
  current_repetition_penalty: number;
  current_balance_penalty: number;
  current_constraint_penalty: number;
  best_repetition_penalty: number;
  best_balance_penalty: number;
  best_constraint_penalty: number;
  reheats_performed: number;
  iterations_since_last_reheat: number;
  local_optima_escapes: number;
  avg_time_per_iteration_ms: number;
  cooling_progress: number;
  clique_swap_success_rate: number;
  transfer_success_rate: number;
  swap_success_rate: number;
  score_variance: number;
  search_efficiency: number;
  effective_seed?: number;
}

const NUMERIC_FIELDS = [
  'iteration',
  'max_iterations',
  'temperature',
  'current_score',
  'best_score',
  'current_contacts',
  'best_contacts',
  'repetition_penalty',
  'elapsed_seconds',
  'no_improvement_count',
  'clique_swaps_tried',
  'clique_swaps_accepted',
  'clique_swaps_rejected',
  'transfers_tried',
  'transfers_accepted',
  'transfers_rejected',
  'swaps_tried',
  'swaps_accepted',
  'swaps_rejected',
  'overall_acceptance_rate',
  'recent_acceptance_rate',
  'avg_attempted_move_delta',
  'avg_accepted_move_delta',
  'biggest_accepted_increase',
  'biggest_attempted_increase',
  'current_repetition_penalty',
  'current_balance_penalty',
  'current_constraint_penalty',
  'best_repetition_penalty',
  'best_balance_penalty',
  'best_constraint_penalty',
  'reheats_performed',
  'iterations_since_last_reheat',
  'local_optima_escapes',
  'avg_time_per_iteration_ms',
  'cooling_progress',
  'clique_swap_success_rate',
  'transfer_success_rate',
  'swap_success_rate',
  'score_variance',
  'search_efficiency',
  'effective_seed',
] as const satisfies ReadonlyArray<keyof Omit<ProgressMailboxSnapshot, 'sequence' | 'status' | 'stop_reason'>>;

type NumericField = (typeof NUMERIC_FIELDS)[number];

enum MailboxHeaderIndex {
  Sequence = 0,
  StatusCode = 1,
  StopReasonCode = 2,
  Flags = 3,
}

const HEADER_INT_COUNT = 4;
const HEADER_BYTES = HEADER_INT_COUNT * Int32Array.BYTES_PER_ELEMENT;
const FLOAT_BYTES = Float64Array.BYTES_PER_ELEMENT;
const TOTAL_BYTES = HEADER_BYTES + NUMERIC_FIELDS.length * FLOAT_BYTES;
const HAS_EFFECTIVE_SEED_FLAG = 1 << 0;

const STATUS_TO_CODE: Record<ProgressMailboxStatus, number> = {
  idle: 0,
  running: 1,
  completed: 2,
  cancelled: 3,
  failed: 4,
};

const CODE_TO_STATUS: Record<number, ProgressMailboxStatus> = {
  0: 'idle',
  1: 'running',
  2: 'completed',
  3: 'cancelled',
  4: 'failed',
};

const STOP_REASON_TO_CODE: Record<StopReason, number> = {
  max_iterations_reached: 1,
  time_limit_reached: 2,
  no_improvement_limit_reached: 3,
  progress_callback_requested_stop: 4,
  optimal_score_reached: 5,
};

const CODE_TO_STOP_REASON: Record<number, StopReason | undefined> = {
  0: undefined,
  1: 'max_iterations_reached',
  2: 'time_limit_reached',
  3: 'no_improvement_limit_reached',
  4: 'progress_callback_requested_stop',
  5: 'optimal_score_reached',
};

const FIELD_OFFSETS: Record<NumericField, number> = NUMERIC_FIELDS.reduce((offsets, field, index) => {
  offsets[field] = HEADER_BYTES + index * FLOAT_BYTES;
  return offsets;
}, {} as Record<NumericField, number>);

function hasSharedArrayBuffer(globalLike: typeof globalThis): boolean {
  return typeof globalLike.SharedArrayBuffer === 'function';
}

function hasCrossOriginIsolation(globalLike: typeof globalThis): boolean {
  return globalLike.crossOriginIsolated === true;
}

function createViews(buffer: SharedArrayBuffer) {
  if (buffer.byteLength < TOTAL_BYTES) {
    throw new Error(`Progress mailbox buffer too small: expected ${TOTAL_BYTES} bytes, got ${buffer.byteLength}`);
  }

  return {
    headers: new Int32Array(buffer, 0, HEADER_INT_COUNT),
    dataView: new DataView(buffer),
  };
}

function codeToStatus(code: number): ProgressMailboxStatus {
  return CODE_TO_STATUS[code] ?? 'idle';
}

function stopReasonToCode(stopReason?: StopReason): number {
  return stopReason ? STOP_REASON_TO_CODE[stopReason] ?? 0 : 0;
}

function codeToStopReason(code: number): StopReason | undefined {
  return CODE_TO_STOP_REASON[code];
}

function zeroNumericFields(dataView: DataView): void {
  for (const field of NUMERIC_FIELDS) {
    dataView.setFloat64(FIELD_OFFSETS[field], 0, true);
  }
}

function writeNumericFields(dataView: DataView, snapshot: Partial<ProgressMailboxSnapshot>): number {
  let flags = 0;

  for (const field of NUMERIC_FIELDS) {
    const raw = snapshot[field];
    const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
    dataView.setFloat64(FIELD_OFFSETS[field], value, true);

    if (field === 'effective_seed' && typeof raw === 'number' && Number.isFinite(raw)) {
      flags |= HAS_EFFECTIVE_SEED_FLAG;
    }
  }

  return flags;
}

function beginWrite(headers: Int32Array): void {
  Atomics.add(headers, MailboxHeaderIndex.Sequence, 1);
}

function endWrite(headers: Int32Array): void {
  Atomics.add(headers, MailboxHeaderIndex.Sequence, 1);
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

export function createProgressMailboxBuffer(): SharedArrayBuffer {
  return new SharedArrayBuffer(TOTAL_BYTES);
}

export function getProgressMailboxByteLength(): number {
  return TOTAL_BYTES;
}

export interface ProgressMailboxWriter {
  reset(): void;
  writeProgress(snapshot: Partial<ProgressMailboxSnapshot>): void;
  setStatus(status: ProgressMailboxStatus, options?: { stopReason?: StopReason }): void;
}

export interface ProgressMailboxReadResult {
  sequence: number;
  snapshot: ProgressMailboxSnapshot;
}

export interface ProgressMailboxReader {
  read(): ProgressMailboxReadResult | null;
}

export function createProgressMailboxWriter(buffer: SharedArrayBuffer): ProgressMailboxWriter {
  const { headers, dataView } = createViews(buffer);

  return {
    reset() {
      beginWrite(headers);
      headers[MailboxHeaderIndex.StatusCode] = STATUS_TO_CODE.idle;
      headers[MailboxHeaderIndex.StopReasonCode] = 0;
      headers[MailboxHeaderIndex.Flags] = 0;
      zeroNumericFields(dataView);
      endWrite(headers);
    },
    writeProgress(snapshot) {
      beginWrite(headers);
      headers[MailboxHeaderIndex.StatusCode] = STATUS_TO_CODE.running;
      headers[MailboxHeaderIndex.StopReasonCode] = stopReasonToCode(snapshot.stop_reason);
      headers[MailboxHeaderIndex.Flags] = writeNumericFields(dataView, snapshot);
      endWrite(headers);
    },
    setStatus(status, options) {
      beginWrite(headers);
      headers[MailboxHeaderIndex.StatusCode] = STATUS_TO_CODE[status];
      headers[MailboxHeaderIndex.StopReasonCode] = stopReasonToCode(options?.stopReason);
      endWrite(headers);
    },
  };
}

export function createProgressMailboxReader(buffer: SharedArrayBuffer): ProgressMailboxReader {
  const { headers, dataView } = createViews(buffer);

  return {
    read() {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const startSequence = Atomics.load(headers, MailboxHeaderIndex.Sequence);
        if (startSequence % 2 !== 0) {
          continue;
        }

        const status = codeToStatus(Atomics.load(headers, MailboxHeaderIndex.StatusCode));
        const stopReason = codeToStopReason(Atomics.load(headers, MailboxHeaderIndex.StopReasonCode));
        const flags = Atomics.load(headers, MailboxHeaderIndex.Flags);

        const snapshot = {
          sequence: startSequence,
          status,
          stop_reason: stopReason,
        } as ProgressMailboxSnapshot;

        for (const field of NUMERIC_FIELDS) {
          const value = dataView.getFloat64(FIELD_OFFSETS[field], true);
          if (field === 'effective_seed') {
            if ((flags & HAS_EFFECTIVE_SEED_FLAG) !== 0) {
              snapshot.effective_seed = value;
            }
          } else {
            snapshot[field] = value as never;
          }
        }

        const endSequence = Atomics.load(headers, MailboxHeaderIndex.Sequence);
        if (startSequence === endSequence && endSequence % 2 === 0) {
          snapshot.sequence = endSequence;
          return {
            sequence: endSequence,
            snapshot,
          };
        }
      }

      return null;
    },
  };
}

export function mailboxSnapshotToProgressUpdate(snapshot: ProgressMailboxSnapshot): ProgressUpdate {
  const progress: ProgressUpdate = {
    iteration: snapshot.iteration,
    max_iterations: snapshot.max_iterations,
    temperature: snapshot.temperature,
    current_score: snapshot.current_score,
    best_score: snapshot.best_score,
    current_contacts: snapshot.current_contacts,
    best_contacts: snapshot.best_contacts,
    repetition_penalty: snapshot.repetition_penalty,
    elapsed_seconds: snapshot.elapsed_seconds,
    no_improvement_count: snapshot.no_improvement_count,
    clique_swaps_tried: snapshot.clique_swaps_tried,
    clique_swaps_accepted: snapshot.clique_swaps_accepted,
    clique_swaps_rejected: snapshot.clique_swaps_rejected,
    transfers_tried: snapshot.transfers_tried,
    transfers_accepted: snapshot.transfers_accepted,
    transfers_rejected: snapshot.transfers_rejected,
    swaps_tried: snapshot.swaps_tried,
    swaps_accepted: snapshot.swaps_accepted,
    swaps_rejected: snapshot.swaps_rejected,
    overall_acceptance_rate: snapshot.overall_acceptance_rate,
    recent_acceptance_rate: snapshot.recent_acceptance_rate,
    avg_attempted_move_delta: snapshot.avg_attempted_move_delta,
    avg_accepted_move_delta: snapshot.avg_accepted_move_delta,
    biggest_accepted_increase: snapshot.biggest_accepted_increase,
    biggest_attempted_increase: snapshot.biggest_attempted_increase,
    current_repetition_penalty: snapshot.current_repetition_penalty,
    current_balance_penalty: snapshot.current_balance_penalty,
    current_constraint_penalty: snapshot.current_constraint_penalty,
    best_repetition_penalty: snapshot.best_repetition_penalty,
    best_balance_penalty: snapshot.best_balance_penalty,
    best_constraint_penalty: snapshot.best_constraint_penalty,
    reheats_performed: snapshot.reheats_performed,
    iterations_since_last_reheat: snapshot.iterations_since_last_reheat,
    local_optima_escapes: snapshot.local_optima_escapes,
    avg_time_per_iteration_ms: snapshot.avg_time_per_iteration_ms,
    cooling_progress: snapshot.cooling_progress,
    clique_swap_success_rate: snapshot.clique_swap_success_rate,
    transfer_success_rate: snapshot.transfer_success_rate,
    swap_success_rate: snapshot.swap_success_rate,
    score_variance: snapshot.score_variance,
    search_efficiency: snapshot.search_efficiency,
  };

  if (typeof snapshot.effective_seed === 'number') {
    progress.effective_seed = snapshot.effective_seed;
  }

  if (snapshot.stop_reason) {
    progress.stop_reason = snapshot.stop_reason;
  }

  return progress;
}

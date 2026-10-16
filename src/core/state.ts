export const BOOTSTRAP_STATE_SCHEMA = 'resort-bootstrap-state/v1' as const;
export const NORMAL_WAVE_NEEDS = ['reception', 'food'] as const;
export type NormalWaveNeedId = (typeof NORMAL_WAVE_NEEDS)[number];
export type NormalWavePhase = 'awaiting' | 'incoming' | 'draining' | 'complete';
export const NORMAL_WAVE_PROOF_WORKER_ID = 'worker-1' as const;
export type NormalWaveWorkerId = typeof NORMAL_WAVE_PROOF_WORKER_ID;
export type NeedCounts = Readonly<Record<NormalWaveNeedId, number>>;

export interface NormalWaveProofTuning {
  readonly totalDemand: number;
  readonly releasePerTick: number;
  readonly baseServiceCapacity: NeedCounts;
  readonly queuePressurePerLostStar: number;
}

// Deterministic proof fixture only; these values are not product requirements.
export const NORMAL_WAVE_PROOF_TUNING: NormalWaveProofTuning = {
  totalDemand: 6,
  releasePerTick: 2,
  baseServiceCapacity: { reception: 1, food: 1 },
  queuePressurePerLostStar: 4
};

export interface WorkerReassignmentImpact {
  readonly workerId: NormalWaveWorkerId;
  readonly from: NormalWaveNeedId;
  readonly to: NormalWaveNeedId;
  readonly simulationTick: number;
  readonly fromCapacityBefore: number;
  readonly fromCapacityAfter: number;
  readonly toCapacityBefore: number;
  readonly toCapacityAfter: number;
  readonly targetQueueAtChange: number;
}

export interface NormalWaveResult {
  readonly rating: number;
  readonly totalQueuePressure: number;
  readonly bottleneckNeed: NormalWaveNeedId;
  readonly peakQueueByNeed: NeedCounts;
  readonly reassignments: readonly WorkerReassignmentImpact[];
  readonly explanation: readonly string[];
}

export interface NormalWaveState {
  readonly phase: NormalWavePhase;
  readonly tuning: NormalWaveProofTuning;
  readonly releasedDemand: number;
  readonly queueByNeed: NeedCounts;
  readonly servedByNeed: NeedCounts;
  readonly peakQueueByNeed: NeedCounts;
  readonly totalQueuePressure: number;
  readonly workerAssignments: Readonly<Record<NormalWaveWorkerId, NormalWaveNeedId>>;
  readonly reassignments: readonly WorkerReassignmentImpact[];
  readonly result: NormalWaveResult | null;
}

export interface BootstrapState {
  readonly schema: typeof BOOTSTRAP_STATE_SCHEMA;
  readonly bootId: string;
  readonly simulationTick: number;
  readonly elapsedSimulationMs: number;
  readonly normalWave: NormalWaveState;
}

export type BootstrapCommand =
  | { readonly type: 'ADVANCE_SIMULATION'; readonly deltaMs: number }
  | { readonly type: 'START_WAVE' }
  | { readonly type: 'REASSIGN_WORKER'; readonly workerId: NormalWaveWorkerId; readonly to: NormalWaveNeedId };

const empty = (): Record<NormalWaveNeedId, number> => ({ reception: 0, food: 0 });
const copy = (v: NeedCounts): Record<NormalWaveNeedId, number> => ({ reception: v.reception, food: v.food });

function validateTuning(t: NormalWaveProofTuning): void {
  const values = [t.totalDemand, t.releasePerTick, t.queuePressurePerLostStar, ...NORMAL_WAVE_NEEDS.map(n => t.baseServiceCapacity[n])];
  if (values.some(v => !Number.isInteger(v) || v <= 0)) throw new Error('NORMAL_WAVE_PROOF_TUNING_INVALID');
}

function awaiting(tuning: NormalWaveProofTuning): NormalWaveState {
  validateTuning(tuning);
  return {
    phase: 'awaiting',
    tuning: { ...tuning, baseServiceCapacity: copy(tuning.baseServiceCapacity) },
    releasedDemand: 0,
    queueByNeed: empty(),
    servedByNeed: empty(),
    peakQueueByNeed: empty(),
    totalQueuePressure: 0,
    workerAssignments: { [NORMAL_WAVE_PROOF_WORKER_ID]: 'reception' },
    reassignments: [],
    result: null
  };
}

function capacity(wave: NormalWaveState, need: NormalWaveNeedId): number {
  const workers = Object.values(wave.workerAssignments).filter(v => v === need).length;
  return wave.tuning.baseServiceCapacity[need] + workers;
}

export function normalWaveServiceCapacity(state: BootstrapState, need: NormalWaveNeedId): number {
  return capacity(state.normalWave, need);
}

function resultFor(wave: NormalWaveState): NormalWaveResult {
  let bottleneckNeed: NormalWaveNeedId = NORMAL_WAVE_NEEDS[0];
  for (const need of NORMAL_WAVE_NEEDS) {
    if (wave.peakQueueByNeed[need] > wave.peakQueueByNeed[bottleneckNeed]) bottleneckNeed = need;
  }
  const lostStars = Math.min(4, Math.floor(wave.totalQueuePressure / wave.tuning.queuePressurePerLostStar));
  return {
    rating: 5 - lostStars,
    totalQueuePressure: wave.totalQueuePressure,
    bottleneckNeed,
    peakQueueByNeed: copy(wave.peakQueueByNeed),
    reassignments: [...wave.reassignments],
    explanation: [
      `Peak queue ${bottleneckNeed}=${wave.peakQueueByNeed[bottleneckNeed]}.`,
      `Aggregate queue pressure=${wave.totalQueuePressure}.`,
      ...(wave.reassignments.length
        ? wave.reassignments.map(x => `Worker ${x.workerId} moved ${x.from}->${x.to}; ${x.to} capacity ${x.toCapacityBefore}->${x.toCapacityAfter} with queue ${x.targetQueueAtChange}.`)
        : ['No Worker reassignment was used.'])
    ]
  };
}

function advanceWave(wave: NormalWaveState): NormalWaveState {
  if (wave.phase !== 'incoming' && wave.phase !== 'draining') return wave;
  const releasedNow = wave.phase === 'incoming'
    ? Math.min(wave.tuning.releasePerTick, wave.tuning.totalDemand - wave.releasedDemand)
    : 0;
  const releasedDemand = wave.releasedDemand + releasedNow;
  const queueByNeed = empty();
  const servedByNeed = copy(wave.servedByNeed);
  const peakQueueByNeed = copy(wave.peakQueueByNeed);

  for (const need of NORMAL_WAVE_NEEDS) {
    const waiting = wave.queueByNeed[need] + releasedNow;
    const servedNow = Math.min(waiting, capacity(wave, need));
    const remaining = waiting - servedNow;
    queueByNeed[need] = remaining;
    servedByNeed[need] += servedNow;
    peakQueueByNeed[need] = Math.max(peakQueueByNeed[need], remaining);
  }

  const pressure = NORMAL_WAVE_NEEDS.reduce((sum, need) => sum + queueByNeed[need], 0);
  const arrivalsFinished = releasedDemand >= wave.tuning.totalDemand;
  const queuesDrained = NORMAL_WAVE_NEEDS.every(need => queueByNeed[need] === 0);
  const phase: NormalWavePhase = arrivalsFinished ? (queuesDrained ? 'complete' : 'draining') : 'incoming';
  const next: NormalWaveState = {
    ...wave,
    phase,
    releasedDemand,
    queueByNeed,
    servedByNeed,
    peakQueueByNeed,
    totalQueuePressure: wave.totalQueuePressure + pressure
  };
  return phase === 'complete' ? { ...next, result: resultFor(next) } : next;
}

export function createInitialBootstrapState(
  bootId: string,
  tuning: NormalWaveProofTuning = NORMAL_WAVE_PROOF_TUNING
): BootstrapState {
  return {
    schema: BOOTSTRAP_STATE_SCHEMA,
    bootId,
    simulationTick: 0,
    elapsedSimulationMs: 0,
    normalWave: awaiting(tuning)
  };
}

export function applyBootstrapCommand(state: BootstrapState, command: BootstrapCommand): BootstrapState {
  switch (command.type) {
    case 'START_WAVE':
      if (state.normalWave.phase !== 'awaiting') throw new Error('NORMAL_WAVE_START_INVALID');
      return { ...state, normalWave: { ...state.normalWave, phase: 'incoming' } };

    case 'REASSIGN_WORKER': {
      const wave = state.normalWave;
      if (wave.phase !== 'incoming' && wave.phase !== 'draining') throw new Error('NORMAL_WAVE_REASSIGN_INVALID');
      const from = wave.workerAssignments[command.workerId];
      if (from === undefined) throw new Error('NORMAL_WAVE_WORKER_UNKNOWN');
      if (from === command.to) return state;
      const fromCapacityBefore = capacity(wave, from);
      const toCapacityBefore = capacity(wave, command.to);
      const moved: NormalWaveState = {
        ...wave,
        workerAssignments: { ...wave.workerAssignments, [command.workerId]: command.to }
      };
      const impact: WorkerReassignmentImpact = {
        workerId: command.workerId,
        from,
        to: command.to,
        simulationTick: state.simulationTick,
        fromCapacityBefore,
        fromCapacityAfter: capacity(moved, from),
        toCapacityBefore,
        toCapacityAfter: capacity(moved, command.to),
        targetQueueAtChange: wave.queueByNeed[command.to]
      };
      return { ...state, normalWave: { ...moved, reassignments: [...wave.reassignments, impact] } };
    }

    case 'ADVANCE_SIMULATION':
      if (!Number.isFinite(command.deltaMs) || command.deltaMs <= 0) throw new Error('BOOTSTRAP_DELTA_INVALID');
      return {
        ...state,
        simulationTick: state.simulationTick + 1,
        elapsedSimulationMs: state.elapsedSimulationMs + command.deltaMs,
        normalWave: advanceWave(state.normalWave)
      };
  }
}

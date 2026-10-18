export const BOOTSTRAP_STATE_SCHEMA = 'resort-bootstrap-state/v1' as const;
export const NORMAL_SERVICE_IDS = ['reception', 'food', 'drinks', 'relax', 'oceanView'] as const;
export const NORMAL_WAVE_NEEDS = ['reception', 'food', 'drinks'] as const;
export type NormalWaveNeedId = (typeof NORMAL_SERVICE_IDS)[number];
export type PrototypeWaveNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const PROTOTYPE_SCRIPTED_WAVES = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export interface NormalServiceDefinition {
  readonly buildingLabel: string;
  readonly needLabel: string;
}

export const NORMAL_SERVICE_CATALOG: Readonly<Record<NormalWaveNeedId, NormalServiceDefinition>> = {
  reception: { buildingLabel: 'Reception', needLabel: 'Rooms' },
  food: { buildingLabel: 'Restaurant', needLabel: 'Food' },
  drinks: { buildingLabel: 'Beach Bar', needLabel: 'Drinks' },
  relax: { buildingLabel: 'Pool', needLabel: 'Relax' },
  oceanView: { buildingLabel: 'Bungalows', needLabel: 'Ocean View' }
};

export interface NormalWaveForecast {
  readonly waveNumber: PrototypeWaveNumber;
  readonly totalWaves: 8;
  readonly needs: readonly NormalWaveNeedId[];
  readonly totalDemand: number;
  readonly demandByNeed: Readonly<Record<NormalWaveNeedId, number>>;
}
export type NormalWavePhase = 'awaiting' | 'incoming' | 'draining' | 'complete';
export const NORMAL_WAVE_PROOF_WORKER_ID = 'worker-1' as const;
export const NORMAL_WAVE_BASE_WORKER_IDS = [NORMAL_WAVE_PROOF_WORKER_ID, 'worker-0'] as const;
export const PROTOTYPE_AREA_IDS = ['pool', 'bungalows'] as const;
export type PrototypeAreaId = (typeof PROTOTYPE_AREA_IDS)[number];
export const PROTOTYPE_AREA_WORKER_IDS = { pool: 'worker-2', bungalows: 'worker-3' } as const;
export type NormalWaveWorkerId = (typeof NORMAL_WAVE_BASE_WORKER_IDS)[number] | (typeof PROTOTYPE_AREA_WORKER_IDS)[PrototypeAreaId];
export type NormalWaveWorkerAssignments = Readonly<Partial<Record<NormalWaveWorkerId, NormalWaveNeedId>>>;
export type PrototypeAreaPurchases = Readonly<Record<PrototypeAreaId, boolean>>;
export type PrototypeAreaStatus = 'locked' | 'available' | 'not_affordable' | 'unlocked';
export const PROTOTYPE_AREA_CATALOG = {
  pool: { buildingLabel: 'Pool', need: 'relax', eligibilityAfterWave: 3, includedWorkerId: 'worker-2' },
  bungalows: { buildingLabel: 'Bungalows', need: 'oceanView', eligibilityAfterWave: 6, includedWorkerId: 'worker-3' }
} as const;
export const PROTOTYPE_AREA_PROOF_TUNING: Readonly<Record<PrototypeAreaId, number>> = { pool: 10, bungalows: 20 };
export interface PrototypeAreaUnlockView {
  readonly areaId: PrototypeAreaId;
  readonly buildingLabel: string;
  readonly need: NormalWaveNeedId;
  readonly eligibilityAfterWave: 3 | 6;
  readonly includedWorkerId: NormalWaveWorkerId;
  readonly coinCost: number;
  readonly status: PrototypeAreaStatus;
}
export type NeedCounts = Readonly<Record<NormalWaveNeedId, number>>;
export type NormalNeedOperationalState = 'BOTTLENECK' | 'RECOVERING' | 'SATISFIED';
export type NormalWaveBottleneckCause = 'staffing' | 'capacity';
export type PrototypeBuildingLevel = 1 | 2 | 3;
export type PrototypeUpgradeTargetLevel = 2 | 3;
export type BuildingLevels = Readonly<Record<NormalWaveNeedId, PrototypeBuildingLevel>>;

export interface PrototypeUpgradeTuning {
  readonly startingCoins: number;
  readonly startingResortValue: number;
  readonly capacityBonusByLevel: Readonly<Record<PrototypeBuildingLevel, number>>;
  readonly coinCostByTargetLevel: Readonly<Record<PrototypeUpgradeTargetLevel, number>>;
  readonly resortValueGainByTargetLevel: Readonly<Record<PrototypeUpgradeTargetLevel, number>>;
}

// Prototype proof tuning only; these numbers are not product requirements.
export const PROTOTYPE_UPGRADE_PROOF_TUNING: PrototypeUpgradeTuning = {
  startingCoins: 30,
  startingResortValue: 0,
  capacityBonusByLevel: { 1: 0, 2: 1, 3: 2 },
  coinCostByTargetLevel: { 2: 10, 3: 20 },
  resortValueGainByTargetLevel: { 2: 1, 3: 2 }
};

export interface PrototypeUpgradeQuote {
  readonly need: NormalWaveNeedId;
  readonly fromLevel: PrototypeBuildingLevel;
  readonly toLevel: PrototypeUpgradeTargetLevel;
  readonly beforeCapacity: number;
  readonly afterCapacity: number;
  readonly coinCost: number;
  readonly resortValueGain: number;
}

export interface PrototypeEnergyProofTuning {
  readonly startingEnergy: number;
  readonly earnedPerCompletedWave: number;
  readonly boostedServiceCycles: number;
  readonly boostDurationTicks: number;
}

// Deterministic proof tuning only; these values are not product requirements.
export const PROTOTYPE_ENERGY_PROOF_TUNING: PrototypeEnergyProofTuning = {
  startingEnergy: 0, earnedPerCompletedWave: 1, boostedServiceCycles: 2, boostDurationTicks: 2
};

export interface PrototypeEconomyProofTuning {
  readonly perUnitCoinValue: number;
  readonly ratingModifierByRating: Readonly<Record<number, number>>;
  readonly comebackRewardCoins: number;
}

// Deterministic proof tuning only; canonical requirements define reward structure, not these numeric values.
export const PROTOTYPE_ECONOMY_PROOF_TUNING: PrototypeEconomyProofTuning = {
  perUnitCoinValue: 5,
  ratingModifierByRating: { 1: 0.2, 2: 0.4, 3: 0.6, 4: 0.8, 5: 1 },
  comebackRewardCoins: 5
};
export interface PrototypeEnergyMode { readonly need: NormalWaveNeedId; readonly ticksRemaining: number; }
export interface PrototypeSuddenRushState { readonly scheduled: boolean; readonly triggered: boolean; readonly triggerAfterReleasedDemand: number; readonly extraDemand: number; }
// Deterministic playtest fixture; exact Rush timing/volume is not a product requirement.
export const PROTOTYPE_SUDDEN_RUSH_PROOF_TUNING = { earliestWave: 5 as PrototypeWaveNumber, triggerAfterReleasedDemand: 2, extraDemand: 2 } as const;

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
  baseServiceCapacity: { reception: 1, food: 1, drinks: 1, relax: 1, oceanView: 1 },
  queuePressurePerLostStar: 4
};

const PROTOTYPE_WAVE_DEMAND_PROFILE: Readonly<Record<PrototypeWaveNumber, Partial<Record<NormalWaveNeedId, number>>>> = {
  1: {},
  2: {},
  3: {},
  4: { reception: 4, food: 6, drinks: 4, relax: 6 },
  5: { reception: 6, food: 4, drinks: 6, relax: 3 },
  6: { reception: 4, food: 6, drinks: 3, relax: 6 },
  7: { reception: 6, food: 3, drinks: 5, relax: 4, oceanView: 6 },
  8: { reception: 5, food: 6, drinks: 6, relax: 5, oceanView: 6 }
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
  readonly accumulatedWaitByNeed: NeedCounts;
  readonly bottleneckNeed: NormalWaveNeedId;
  readonly bottleneckCause: NormalWaveBottleneckCause;
  readonly peakQueueByNeed: NeedCounts;
  readonly reassignments: readonly WorkerReassignmentImpact[];
  readonly guidance: string;
  readonly explanation: readonly string[];
}

export interface NormalWaveState {
  readonly phase: NormalWavePhase;
  readonly tuning: NormalWaveProofTuning;
  readonly activeNeedIds: readonly NormalWaveNeedId[];
  readonly debutNeedIds: readonly NormalWaveNeedId[];
  readonly demandTargetByNeed: NeedCounts;
  readonly releasedByNeed: NeedCounts;
  readonly buildingLevelsByNeed: BuildingLevels;
  readonly upgradeTuning: PrototypeUpgradeTuning;
  readonly releasedDemand: number;
  readonly queueByNeed: NeedCounts;
  readonly activeByNeed: NeedCounts;
  readonly servedByNeed: NeedCounts;
  readonly peakQueueByNeed: NeedCounts;
  readonly accumulatedWaitByNeed: NeedCounts;
  readonly staffingWaitByNeed: NeedCounts;
  readonly capacityWaitByNeed: NeedCounts;
  readonly totalQueuePressure: number;
  readonly workerSlotsByNeed: NeedCounts;
  readonly workerAssignments: NormalWaveWorkerAssignments;
  readonly reassignments: readonly WorkerReassignmentImpact[];
  readonly energyMode: PrototypeEnergyMode | null;
  readonly suddenRush: PrototypeSuddenRushState;
  readonly result: NormalWaveResult | null;
}

export interface BootstrapState {
  readonly schema: typeof BOOTSTRAP_STATE_SCHEMA;
  readonly bootId: string;
  readonly simulationTick: number;
  readonly elapsedSimulationMs: number;
  readonly energy: number;
  readonly suddenRushOccurred: boolean;
  readonly coins: number;
  readonly resortValue: number;
  readonly currentWaveNumber: PrototypeWaveNumber;
  readonly purchasedAreas: PrototypeAreaPurchases;
  readonly normalWave: NormalWaveState;
}

export type BootstrapCommand =
  | { readonly type: 'ADVANCE_SIMULATION'; readonly deltaMs: number }
  | { readonly type: 'START_WAVE' }
  | { readonly type: 'CONTINUE_TO_NEXT_WAVE' }
  | { readonly type: 'PURCHASE_AREA'; readonly areaId: PrototypeAreaId }
  | { readonly type: 'UPGRADE_BUILDING'; readonly need: NormalWaveNeedId }
  | { readonly type: 'REASSIGN_WORKER'; readonly workerId: NormalWaveWorkerId; readonly to: NormalWaveNeedId }
  | { readonly type: 'ACTIVATE_ENERGY_MODE'; readonly need: NormalWaveNeedId }
  | { readonly type: 'CLAIM_COMEBACK_REWARD' };

const empty = (): Record<NormalWaveNeedId, number> => ({ reception: 0, food: 0, drinks: 0, relax: 0, oceanView: 0 });
const oneSlotEach = (): Record<NormalWaveNeedId, number> => ({ reception: 1, food: 1, drinks: 1, relax: 1, oceanView: 1 });
const initialBuildingLevels = (): Record<NormalWaveNeedId, PrototypeBuildingLevel> => ({ reception: 1, food: 1, drinks: 1, relax: 1, oceanView: 1 });
const copy = (v: NeedCounts): Record<NormalWaveNeedId, number> => ({ reception: v.reception, food: v.food, drinks: v.drinks, relax: v.relax, oceanView: v.oceanView });

function validateTuning(t: NormalWaveProofTuning): void {
  const values = [
    t.totalDemand,
    t.releasePerTick,
    t.queuePressurePerLostStar,
    ...NORMAL_SERVICE_IDS.map(n => t.baseServiceCapacity[n])
  ];
  if (values.some(v => !Number.isInteger(v) || v <= 0)) throw new Error('NORMAL_WAVE_PROOF_TUNING_INVALID');
}

function workerCount(wave: NormalWaveState, need: NormalWaveNeedId): number {
  return Object.values(wave.workerAssignments).filter(v => v === need).length;
}

function validateWorkerModel(wave: NormalWaveState): void {
  const workers = Object.keys(wave.workerAssignments).length;
  const assignedNeeds = Object.values(wave.workerAssignments).filter((value): value is NormalWaveNeedId => value !== undefined);
  const eligibleNeedIds = new Set<NormalWaveNeedId>([...wave.activeNeedIds, ...assignedNeeds]);
  const slots = [...eligibleNeedIds].reduce((sum, need) => sum + wave.workerSlotsByNeed[need], 0);
  if (workers <= 0 || workers >= slots) throw new Error('NORMAL_WAVE_WORKER_SCARCITY_INVALID');
  for (const need of NORMAL_SERVICE_IDS) {
    if (wave.workerSlotsByNeed[need] !== 1) throw new Error('NORMAL_WAVE_SLOT_MODEL_INVALID');
    if (workerCount(wave, need) > wave.workerSlotsByNeed[need]) throw new Error('NORMAL_WAVE_SLOT_OCCUPIED');
  }
}

function noSuddenRush(): PrototypeSuddenRushState { return { scheduled: false, triggered: false, triggerAfterReleasedDemand: 0, extraDemand: 0 }; }
function scheduledSuddenRush(): PrototypeSuddenRushState { return { scheduled: true, triggered: false, triggerAfterReleasedDemand: PROTOTYPE_SUDDEN_RUSH_PROOF_TUNING.triggerAfterReleasedDemand, extraDemand: PROTOTYPE_SUDDEN_RUSH_PROOF_TUNING.extraDemand }; }

function awaiting(
  tuning: NormalWaveProofTuning,
  workerAssignments: NormalWaveWorkerAssignments = { [NORMAL_WAVE_PROOF_WORKER_ID]: 'reception', 'worker-0': 'drinks' },
  buildingLevelsByNeed: BuildingLevels = initialBuildingLevels(),
  upgradeTuning: PrototypeUpgradeTuning = PROTOTYPE_UPGRADE_PROOF_TUNING,
  activeNeedIds: readonly NormalWaveNeedId[] = NORMAL_WAVE_NEEDS,
  debutNeedIds: readonly NormalWaveNeedId[] = [],
  suddenRush: PrototypeSuddenRushState = noSuddenRush(),
  waveNumber: PrototypeWaveNumber = 1
): NormalWaveState {
  validateTuning(tuning);
  const demandTargetByNeed = empty();
  const profile = PROTOTYPE_WAVE_DEMAND_PROFILE[waveNumber];
  for (const need of activeNeedIds) {
    const profiledDemand = profile[need] ?? tuning.totalDemand;
    demandTargetByNeed[need] = debutNeedIds.includes(need)
      ? Math.min(profiledDemand, Math.max(1, Math.ceil(tuning.totalDemand / 2)))
      : profiledDemand;
  }
  const wave: NormalWaveState = {
    phase: 'awaiting', activeNeedIds: [...activeNeedIds], debutNeedIds: [...debutNeedIds], demandTargetByNeed,
    releasedByNeed: empty(), tuning: { ...tuning, baseServiceCapacity: copy(tuning.baseServiceCapacity) },
    buildingLevelsByNeed: { ...buildingLevelsByNeed },
    upgradeTuning: { ...upgradeTuning, capacityBonusByLevel: { ...upgradeTuning.capacityBonusByLevel }, coinCostByTargetLevel: { ...upgradeTuning.coinCostByTargetLevel }, resortValueGainByTargetLevel: { ...upgradeTuning.resortValueGainByTargetLevel } },
    releasedDemand: 0, queueByNeed: empty(), activeByNeed: empty(), servedByNeed: empty(), peakQueueByNeed: empty(),
    accumulatedWaitByNeed: empty(), staffingWaitByNeed: empty(), capacityWaitByNeed: empty(), totalQueuePressure: 0,
    workerSlotsByNeed: oneSlotEach(), workerAssignments: { ...workerAssignments }, reassignments: [], energyMode: null, suddenRush: { ...suddenRush }, result: null
  };
  validateWorkerModel(wave);
  return wave;
}

function capacity(wave: NormalWaveState, need: NormalWaveNeedId): number {
  return wave.tuning.baseServiceCapacity[need]
    + wave.upgradeTuning.capacityBonusByLevel[wave.buildingLevelsByNeed[need]]
    + workerCount(wave, need);
}

export function normalWaveForecast(state: BootstrapState): NormalWaveForecast {
  return {
    waveNumber: state.currentWaveNumber,
    totalWaves: 8,
    needs: state.normalWave.activeNeedIds,
    totalDemand: state.normalWave.tuning.totalDemand,
    demandByNeed: copy(state.normalWave.demandTargetByNeed)
  };
}

function nextPrototypeWaveNumber(current: PrototypeWaveNumber): PrototypeWaveNumber {
  return Math.min(8, current + 1) as PrototypeWaveNumber;
}

function activeNeedIdsForAreas(purchasedAreas: PrototypeAreaPurchases): NormalWaveNeedId[] {
  const needs: NormalWaveNeedId[] = [...NORMAL_WAVE_NEEDS];
  for (const areaId of PROTOTYPE_AREA_IDS) if (purchasedAreas[areaId]) needs.push(PROTOTYPE_AREA_CATALOG[areaId].need);
  return needs;
}

function completedWaveNumber(state: BootstrapState): number {
  return state.normalWave.phase === 'complete' ? state.currentWaveNumber : Math.max(0, state.currentWaveNumber - 1);
}

export function prototypeAreaUnlockView(state: BootstrapState, areaId: PrototypeAreaId): PrototypeAreaUnlockView {
  const definition = PROTOTYPE_AREA_CATALOG[areaId];
  const coinCost = PROTOTYPE_AREA_PROOF_TUNING[areaId];
  const status: PrototypeAreaStatus = state.purchasedAreas[areaId] ? 'unlocked' : completedWaveNumber(state) < definition.eligibilityAfterWave ? 'locked' : state.coins < coinCost ? 'not_affordable' : 'available';
  return { areaId, ...definition, coinCost, status };
}

export function normalWaveServiceCapacity(state: BootstrapState, need: NormalWaveNeedId): number {
  return capacity(state.normalWave, need);
}

export function normalNeedOperationalState(state: BootstrapState, need: NormalWaveNeedId): NormalNeedOperationalState {
  const wave = state.normalWave;
  if (!wave.activeNeedIds.includes(need)) return 'SATISFIED';
  if (wave.queueByNeed[need] > 0) return 'BOTTLENECK';
  if (wave.activeByNeed[need] > 0) return 'RECOVERING';
  return 'SATISFIED';
}

export function normalWaveUpgradeQuote(
  state: BootstrapState,
  need: NormalWaveNeedId
): PrototypeUpgradeQuote | null {
  const wave = state.normalWave;
  if (wave.phase !== 'complete' || wave.result === null) return null;
  if (!wave.activeNeedIds.includes(need)) return null;
  const fromLevel = wave.buildingLevelsByNeed[need];
  if (fromLevel >= 3) return null;
  const toLevel = (fromLevel + 1) as PrototypeUpgradeTargetLevel;
  const beforeCapacity = normalWaveServiceCapacity(state, need);
  const upgradedWave: NormalWaveState = {
    ...wave,
    buildingLevelsByNeed: { ...wave.buildingLevelsByNeed, [need]: toLevel }
  };
  return {
    need,
    fromLevel,
    toLevel,
    beforeCapacity,
    afterCapacity: capacity(upgradedWave, need),
    coinCost: wave.upgradeTuning.coinCostByTargetLevel[toLevel],
    resortValueGain: wave.upgradeTuning.resortValueGainByTargetLevel[toLevel]
  };
}

function resultFor(wave: NormalWaveState): NormalWaveResult {
  let bottleneckNeed: NormalWaveNeedId = wave.activeNeedIds[0] ?? NORMAL_WAVE_NEEDS[0];
  for (const need of wave.activeNeedIds) {
    if (wave.accumulatedWaitByNeed[need] > wave.accumulatedWaitByNeed[bottleneckNeed]) {
      bottleneckNeed = need;
    } else if (
      wave.accumulatedWaitByNeed[need] === wave.accumulatedWaitByNeed[bottleneckNeed] &&
      wave.peakQueueByNeed[need] > wave.peakQueueByNeed[bottleneckNeed]
    ) {
      bottleneckNeed = need;
    }
  }

  const staffingWait = wave.staffingWaitByNeed[bottleneckNeed];
  const capacityWait = wave.capacityWaitByNeed[bottleneckNeed];
  const bottleneckCause: NormalWaveBottleneckCause =
    staffingWait > capacityWait ? 'staffing' : 'capacity';
  const guidance = bottleneckCause === 'staffing'
    ? `Reassign a Worker to ${bottleneckNeed} when its queue grows.`
    : `Consider an optional ${bottleneckNeed} capacity upgrade before a future wave.`;

  const lostStars = Math.min(
    4,
    Math.floor(wave.totalQueuePressure / wave.tuning.queuePressurePerLostStar)
  );

  return {
    rating: 5 - lostStars,
    totalQueuePressure: wave.totalQueuePressure,
    accumulatedWaitByNeed: copy(wave.accumulatedWaitByNeed),
    bottleneckNeed,
    bottleneckCause,
    peakQueueByNeed: copy(wave.peakQueueByNeed),
    reassignments: [...wave.reassignments],
    guidance,
    explanation: [
      `Peak queue ${bottleneckNeed}=${wave.peakQueueByNeed[bottleneckNeed]}.`,
      `Accumulated waiting ${bottleneckNeed}=${wave.accumulatedWaitByNeed[bottleneckNeed]}; total=${wave.totalQueuePressure}.`,
      `Primary cause: ${bottleneckCause}.`,
      guidance,
      ...(wave.reassignments.length
        ? wave.reassignments.map(
            x =>
              `Worker moved ${x.from}->${x.to}; ${x.to} capacity ${x.toCapacityBefore}->${x.toCapacityAfter} with queue ${x.targetQueueAtChange}.`
          )
        : ['No Worker reassignment was used.'])
    ]
  };
}

export function normalWaveCoinReward(wave: NormalWaveState): number {
  if (wave.phase !== 'complete' || wave.result === null) return 0;
  const ratingModifier = PROTOTYPE_ECONOMY_PROOF_TUNING.ratingModifierByRating[wave.result.rating] ?? 0;
  return Math.round(wave.releasedDemand * PROTOTYPE_ECONOMY_PROOF_TUNING.perUnitCoinValue * ratingModifier);
}

function advanceWave(wave: NormalWaveState): NormalWaveState {
  if (wave.phase !== 'incoming' && wave.phase !== 'draining') return wave;
  const rushNow = wave.phase === 'incoming' && wave.suddenRush.scheduled && !wave.suddenRush.triggered && wave.releasedDemand >= wave.suddenRush.triggerAfterReleasedDemand;
  const suddenRush = rushNow ? { ...wave.suddenRush, triggered: true } : wave.suddenRush;
  const demandTargetByNeed = copy(wave.demandTargetByNeed);
  if (rushNow) for (const need of wave.activeNeedIds) demandTargetByNeed[need] += suddenRush.extraDemand;
  const totalDemandTarget = wave.tuning.totalDemand + (suddenRush.triggered ? suddenRush.extraDemand : 0);
  const releasedNow = wave.phase === 'incoming' ? Math.min(wave.tuning.releasePerTick, totalDemandTarget - wave.releasedDemand) : 0;
  const releasedDemand = wave.releasedDemand + releasedNow;
  const releasedByNeed = copy(wave.releasedByNeed);
  const servedByNeed = copy(wave.servedByNeed), queueByNeed = empty(), activeByNeed = empty();
  const peakQueueByNeed = copy(wave.peakQueueByNeed), accumulatedWaitByNeed = copy(wave.accumulatedWaitByNeed);
  const staffingWaitByNeed = copy(wave.staffingWaitByNeed), capacityWaitByNeed = copy(wave.capacityWaitByNeed);
  for (const need of wave.activeNeedIds) {
    servedByNeed[need] += wave.activeByNeed[need];
    const releaseForNeed = Math.min(releasedNow, Math.max(0, demandTargetByNeed[need] - releasedByNeed[need]));
    releasedByNeed[need] += releaseForNeed;
    let waiting = wave.queueByNeed[need] + releaseForNeed;
    const simultaneousCapacity = capacity(wave, need);
    const cycles = wave.energyMode?.need === need ? PROTOTYPE_ENERGY_PROOF_TUNING.boostedServiceCycles : 1;
    for (let cycle = 1; cycle < cycles; cycle += 1) { const fast = Math.min(waiting, simultaneousCapacity); servedByNeed[need] += fast; waiting -= fast; }
    const admitted = Math.min(waiting, simultaneousCapacity), remaining = waiting - admitted;
    activeByNeed[need] = admitted; queueByNeed[need] = remaining; peakQueueByNeed[need] = Math.max(peakQueueByNeed[need], remaining); accumulatedWaitByNeed[need] += remaining;
    if (remaining > 0) { if (workerCount(wave, need) === 0) staffingWaitByNeed[need] += remaining; else capacityWaitByNeed[need] += remaining; }
  }
  const pressure = wave.activeNeedIds.reduce((sum, need) => sum + queueByNeed[need], 0);
  const arrivalsFinished = releasedDemand >= totalDemandTarget;
  const queuesDrained = wave.activeNeedIds.every(need => queueByNeed[need] === 0);
  const serviceDrained = wave.activeNeedIds.every(need => activeByNeed[need] === 0);
  const phase: NormalWavePhase = arrivalsFinished ? (queuesDrained && serviceDrained ? 'complete' : 'draining') : 'incoming';
  const energyMode = wave.energyMode === null ? null : wave.energyMode.ticksRemaining <= 1 ? null : { ...wave.energyMode, ticksRemaining: wave.energyMode.ticksRemaining - 1 };
  const next: NormalWaveState = { ...wave, phase, demandTargetByNeed, suddenRush, energyMode, releasedDemand, releasedByNeed, queueByNeed, activeByNeed, servedByNeed, peakQueueByNeed, accumulatedWaitByNeed, staffingWaitByNeed, capacityWaitByNeed, totalQueuePressure: wave.totalQueuePressure + pressure };
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
    energy: PROTOTYPE_ENERGY_PROOF_TUNING.startingEnergy,
    suddenRushOccurred: false,
    coins: PROTOTYPE_UPGRADE_PROOF_TUNING.startingCoins,
    resortValue: PROTOTYPE_UPGRADE_PROOF_TUNING.startingResortValue,
    currentWaveNumber: 1,
    purchasedAreas: { pool: false, bungalows: false },
    normalWave: awaiting(tuning)
  };
}

export function normalizePrototypeWorkerRoster(state: BootstrapState): BootstrapState {
  const wave = state.normalWave;
  const assignedWorkers = Object.values(wave.workerAssignments).filter((value): value is NormalWaveNeedId => value !== undefined).length;
  const desiredWorkers = Math.max(1, wave.activeNeedIds.length - 1);
  if (assignedWorkers >= desiredWorkers || wave.workerAssignments['worker-0'] !== undefined) return state;
  const target = (wave.activeNeedIds.includes('drinks') && workerCount(wave, 'drinks') < wave.workerSlotsByNeed.drinks)
    ? 'drinks'
    : wave.activeNeedIds.find(need => workerCount(wave, need) < wave.workerSlotsByNeed[need]);
  if (target === undefined) return state;
  const normalWave: NormalWaveState = { ...wave, workerAssignments: { ...wave.workerAssignments, 'worker-0': target } };
  validateWorkerModel(normalWave);
  return { ...state, normalWave };
}

export function applyBootstrapCommand(state: BootstrapState, command: BootstrapCommand): BootstrapState {
  switch (command.type) {
    case 'START_WAVE':
      if (state.normalWave.phase !== 'awaiting') throw new Error('NORMAL_WAVE_START_INVALID');
      return { ...state, normalWave: { ...state.normalWave, phase: 'incoming' } };

    case 'CONTINUE_TO_NEXT_WAVE': {
      if (state.normalWave.phase !== 'complete') throw new Error('NORMAL_WAVE_CONTINUE_INVALID');
      const nextWaveNumber = nextPrototypeWaveNumber(state.currentWaveNumber);
      const activeNeedIds = activeNeedIdsForAreas(state.purchasedAreas);
      const debutNeedIds = activeNeedIds.filter(need => !state.normalWave.activeNeedIds.includes(need));
      const scheduleRush = !state.suddenRushOccurred && nextWaveNumber >= PROTOTYPE_SUDDEN_RUSH_PROOF_TUNING.earliestWave && debutNeedIds.length === 0;
      return { ...state, currentWaveNumber: nextWaveNumber, normalWave: awaiting(state.normalWave.tuning, state.normalWave.workerAssignments, state.normalWave.buildingLevelsByNeed, state.normalWave.upgradeTuning, activeNeedIds, debutNeedIds, scheduleRush ? scheduledSuddenRush() : noSuddenRush(), nextWaveNumber) };
    }

    case 'PURCHASE_AREA': {
      if (state.normalWave.phase !== 'awaiting' && state.normalWave.phase !== 'complete') throw new Error('PROTOTYPE_AREA_PURCHASE_PHASE_INVALID');
      const view = prototypeAreaUnlockView(state, command.areaId);
      if (view.status !== 'available') return state;
      const purchasedAreas: PrototypeAreaPurchases = { ...state.purchasedAreas, [command.areaId]: true };
      const workerAssignments: NormalWaveWorkerAssignments = { ...state.normalWave.workerAssignments, [view.includedWorkerId]: view.need };
      const nextNeeds = activeNeedIdsForAreas(purchasedAreas);
      const normalWave = state.normalWave.phase === 'awaiting'
        ? awaiting(state.normalWave.tuning, workerAssignments, state.normalWave.buildingLevelsByNeed, state.normalWave.upgradeTuning, nextNeeds, nextNeeds.filter(need => state.normalWave.debutNeedIds.includes(need) || !state.normalWave.activeNeedIds.includes(need)))
        : { ...state.normalWave, workerAssignments };
      validateWorkerModel(normalWave);
      return { ...state, coins: state.coins - view.coinCost, purchasedAreas, normalWave };
    }

    case 'UPGRADE_BUILDING': {
      const quote = normalWaveUpgradeQuote(state, command.need);
      if (quote === null || state.coins < quote.coinCost) return state;
      return {
        ...state,
        coins: state.coins - quote.coinCost,
        resortValue: state.resortValue + quote.resortValueGain,
        normalWave: {
          ...state.normalWave,
          buildingLevelsByNeed: {
            ...state.normalWave.buildingLevelsByNeed,
            [command.need]: quote.toLevel
          }
        }
      };
    }

    case 'REASSIGN_WORKER': {
      const wave = state.normalWave;
      if (
        wave.phase !== 'awaiting' &&
        wave.phase !== 'incoming' &&
        wave.phase !== 'draining'
      ) {
        throw new Error('NORMAL_WAVE_REASSIGN_INVALID');
      }

      if (!wave.activeNeedIds.includes(command.to)) throw new Error('NORMAL_WAVE_TARGET_INACTIVE');
      const from = wave.workerAssignments[command.workerId];
      if (from === undefined) throw new Error('NORMAL_WAVE_WORKER_UNKNOWN');
      if (from === command.to) return state;
      if (workerCount(wave, command.to) >= wave.workerSlotsByNeed[command.to]) {
        throw new Error('NORMAL_WAVE_SLOT_OCCUPIED');
      }

      const fromCapacityBefore = capacity(wave, from);
      const toCapacityBefore = capacity(wave, command.to);
      const moved: NormalWaveState = {
        ...wave,
        workerAssignments: { ...wave.workerAssignments, [command.workerId]: command.to }
      };
      validateWorkerModel(moved);

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

      return {
        ...state,
        normalWave: {
          ...moved,
          reassignments: [...wave.reassignments, impact]
        }
      };
    }

    case 'ACTIVATE_ENERGY_MODE': {
      const wave = state.normalWave;
      if (wave.phase !== 'incoming' && wave.phase !== 'draining') throw new Error('PROTOTYPE_ENERGY_PHASE_INVALID');
      if (!wave.activeNeedIds.includes(command.need)) throw new Error('PROTOTYPE_ENERGY_TARGET_INACTIVE');
      if (state.energy <= 0 || wave.energyMode !== null) return state;
      return { ...state, energy: state.energy - 1, normalWave: { ...wave, energyMode: { need: command.need, ticksRemaining: PROTOTYPE_ENERGY_PROOF_TUNING.boostDurationTicks } } };
    }

    case 'CLAIM_COMEBACK_REWARD':
      return { ...state, coins: state.coins + PROTOTYPE_ECONOMY_PROOF_TUNING.comebackRewardCoins };

    case 'ADVANCE_SIMULATION': {
      if (!Number.isFinite(command.deltaMs) || command.deltaMs <= 0) throw new Error('BOOTSTRAP_DELTA_INVALID');
      const normalWave = advanceWave(state.normalWave);
      const completedNow = state.normalWave.phase !== 'complete' && normalWave.phase === 'complete';
      const rushTriggeredNow = !state.normalWave.suddenRush.triggered && normalWave.suddenRush.triggered;
      return { ...state, simulationTick: state.simulationTick + 1, elapsedSimulationMs: state.elapsedSimulationMs + command.deltaMs, coins: state.coins + (completedNow ? normalWaveCoinReward(normalWave) : 0), energy: state.energy + (completedNow ? PROTOTYPE_ENERGY_PROOF_TUNING.earnedPerCompletedWave : 0), suddenRushOccurred: state.suddenRushOccurred || rushTriggeredNow, normalWave };
    }
  }
}

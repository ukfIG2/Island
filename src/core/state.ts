import { mvpVipAttainableQualityCeiling, advanceMvpVipLayer, beginMvpVipVisit, markMvpVipConsumableReady, decideMvpVipPreview, showMvpVipPreview, initialMvpVipLayer, type MvpVipLayerState, type MvpVipType } from './vipLayer';
import { deriveMvpVipPreviewInfo } from './vipPreview';
/** FR-040 provisional economics, not a canonically fixed balance. */
export const MVP_VIP_MATERIALS_PROVISIONAL = { supplyCostCoins: 5, supplyUnits: 1, fixCostMaterials: 1 } as const;
import { MVP_BUILDING_EXTENSION_PROOF_TUNING, mvpAdditionalCapacityForLevel, mvpQualityBonusForLevel, mvpWorkerSlotIncreaseOnUpgrade, nextBuildingLevel, type MvpBuildingLevel, type ResortProgressionStage } from './mvpBuildingProgression';

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
export type NormalWaveWorkerId = (typeof NORMAL_WAVE_BASE_WORKER_IDS)[number] | (typeof PROTOTYPE_AREA_WORKER_IDS)[PrototypeAreaId] | `worker-hired-${number}`;
// Q-08 leaves final Worker prices OPEN/TUNING.
export const MVP_WORKER_PROOF_TUNING = { hireCostCoins: 12 } as const;
export type NormalWaveWorkerAssignments = Readonly<Partial<Record<NormalWaveWorkerId, NormalWaveNeedId>>>;
export type NormalWaveManagerAssignments = Readonly<Partial<Record<NormalWaveNeedId, true>>>;
export const MVP_MANAGER_CATALOG = {
  reception: { name: 'Maya Chen', linkedNeed: 'reception' },
  food: { name: 'Alex Rivera', linkedNeed: 'food' },
  drinks: { name: 'Jordan Lee', linkedNeed: 'drinks' },
  relax: { name: 'Samira Khan', linkedNeed: 'relax' },
  oceanView: { name: 'Nora Patel', linkedNeed: 'oceanView' }
} as const satisfies Readonly<Record<NormalWaveNeedId, { readonly name: string; readonly linkedNeed: NormalWaveNeedId }>>;
// Provisional MVP balance, not canonical FINAL(3) pricing: Q-08 remains OPEN/TUNING.
export const MVP_MANAGER_PROOF_TUNING = { hireCostCoins: 15, serviceSpeedMultiplier: 1.5 } as const;
export const MVP_SPECIALIST_CATALOG = {
  photographer: { name: 'Lea Morgan', role: 'Photographer' },
  eventPlanner: { name: 'Daniel Park', role: 'Event Planner' },
  publicist: { name: 'Avery Quinn', role: 'Publicist' }
} as const;
export type MvpSpecialistId = keyof typeof MVP_SPECIALIST_CATALOG;
// Provisional MVP price only: FINAL(3) Q-08 keeps Specialist prices/progression OPEN/TUNING.
export const MVP_SPECIALIST_PROOF_TUNING = { hireCostCoins: 12 } as const;

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
export type BuildingLevels = Readonly<Record<NormalWaveNeedId, MvpBuildingLevel>>;

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
  capacityBonusByLevel: { 1: 0, 2: 2, 3: 4 },
  coinCostByTargetLevel: { 2: 10, 3: 20 },
  resortValueGainByTargetLevel: { 2: 1, 3: 2 }
};

export interface PrototypeUpgradeQuote {
  readonly need: NormalWaveNeedId;
  readonly fromLevel: MvpBuildingLevel;
  readonly toLevel: MvpBuildingLevel;
  readonly addedWorkerSlots: number;
  readonly qualityBonusBefore: number;
  readonly qualityBonusAfter: number;
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
  startingEnergy: 0, earnedPerCompletedWave: 1, boostedServiceCycles: 2, boostDurationTicks: 12
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
export interface PrototypeSuddenRushState {
  readonly scheduled: boolean;
  readonly triggered: boolean;
  readonly triggerAfterReleasedDemand: number; // legacy-save compatibility
  readonly extraDemand: number;
  readonly targetNeed?: NormalWaveNeedId;
}
// Deterministic playtest fixture; exact Rush timing/volume is not a product requirement.
export const PROTOTYPE_SUDDEN_RUSH_PROOF_TUNING = {
  earliestWave: 2 as PrototypeWaveNumber,
  triggerAfterReleasedDemand: 0,
  triggerAfterMs: 45_000,
  durationMs: 10_000,
  extraDemand: 6
} as const;

export interface NormalWaveProofTuning {
  readonly totalDemand: number;
  readonly releasePerTick: number; // retained for v1 persisted tuning; no longer drives arrivals
  readonly baseServiceCapacity: NeedCounts;
  readonly queuePressurePerLostStar: number; // average queued seconds per unit per lost star
  readonly arrivalDurationMs?: number;
  readonly serviceDurationMs?: number;
  readonly unstaffedServiceSpeed?: number;
  readonly useStudioDemandProfile?: boolean;
}

// Deterministic proof fixture only; these values are not product requirements.
export const NORMAL_WAVE_PROOF_TUNING: NormalWaveProofTuning = {
  totalDemand: 12,
  releasePerTick: 2,
  baseServiceCapacity: { reception: 3, food: 3, drinks: 3, relax: 3, oceanView: 3 },
  queuePressurePerLostStar: 2.5,
  arrivalDurationMs: 90_000,
  serviceDurationMs: 12_000,
  unstaffedServiceSpeed: 0.33,
  useStudioDemandProfile: true
};

const PROTOTYPE_WAVE_GUEST_PROFILE: Readonly<Record<PrototypeWaveNumber, number>> = {
  1: 12, 2: 18, 3: 24, 4: 26, 5: 34, 6: 40, 7: 42, 8: 52
};
// S3-TABLE-016 seed: Rooms, Drinks, Food, Relax, Ocean View need units.
const PROTOTYPE_WAVE_DEMAND_PROFILE: Readonly<Record<PrototypeWaveNumber, Partial<Record<NormalWaveNeedId, number>>>> = {
  1: { reception: 8, drinks: 8, food: 6 },
  2: { reception: 12, drinks: 16, food: 10 },
  3: { reception: 16, drinks: 18, food: 14 },
  4: { reception: 16, drinks: 18, food: 14, relax: 8 },
  5: { reception: 20, drinks: 22, food: 18, relax: 16 },
  6: { reception: 25, drinks: 28, food: 22, relax: 20 },
  7: { reception: 25, drinks: 28, food: 22, relax: 20, oceanView: 10 },
  8: { reception: 31, drinks: 35, food: 28, relax: 25, oceanView: 16 }
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
  readonly fromSpeedBefore: number;
  readonly fromSpeedAfter: number;
  readonly toSpeedBefore: number;
  readonly toSpeedAfter: number;
  readonly targetQueueAtChange: number;
}

export interface NormalWaveSatisfaction {
  readonly basis: 'accumulated_wait';
  readonly totalWaitingTime: number;
  readonly waitingTimeByNeed: NeedCounts;
}

export interface NormalWaveResult {
  readonly rating: number;
  readonly satisfaction: NormalWaveSatisfaction;
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
  readonly waveElapsedMs: number;
  readonly serviceProgressByNeed: Readonly<Record<NormalWaveNeedId, readonly number[]>>;
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
  readonly hiredManagers: NormalWaveManagerAssignments;
  readonly reassignments: readonly WorkerReassignmentImpact[];
  readonly energyMode: PrototypeEnergyMode | null;
  readonly energyBoostedNeedsThisWave: readonly NormalWaveNeedId[];
  readonly suddenRush: PrototypeSuddenRushState;
  readonly result: NormalWaveResult | null;
}

export interface MvpVipRewardReceipt { readonly vipType: MvpVipType; readonly qualityCeiling: number; readonly reputation: number; readonly completedVisitCount: number; }

export interface BootstrapState {
  readonly schema: typeof BOOTSTRAP_STATE_SCHEMA;
  readonly bootId: string;
  readonly progressionStage: ResortProgressionStage;
  readonly simulationTick: number;
  readonly elapsedSimulationMs: number;
  readonly energy: number;
  readonly suddenRushOccurred: boolean;
  readonly coins: number;
 readonly reputation: number;
 readonly lastVipReward: MvpVipRewardReceipt | null;
  readonly materials: number;
  readonly resortValue: number;
  readonly currentWaveNumber: PrototypeWaveNumber;
  readonly purchasedAreas: PrototypeAreaPurchases;
 readonly vipBuildings: Readonly<{ spa: boolean }>;
  readonly hiredSpecialists: readonly MvpSpecialistId[];
  readonly vipLayer: MvpVipLayerState;
  readonly normalWave: NormalWaveState;
}

export type BootstrapCommand =
  | { readonly type: 'ADVANCE_SIMULATION'; readonly deltaMs: number }
  | { readonly type: 'START_WAVE' }
  | { readonly type: 'HIRE_MANAGER'; readonly need: NormalWaveNeedId }
  | { readonly type: 'HIRE_SPECIALIST'; readonly specialistId: MvpSpecialistId }
  | { readonly type: 'BEGIN_VIP_VISIT'; readonly vipType: MvpVipType }
 | { readonly type: 'PURCHASE_VIP_SPA' }
 | { readonly type: 'VIP_SPEED_UP' }
  | { readonly type: 'SHOW_VIP_PREVIEW'; readonly vipType: MvpVipType }
  | { readonly type: 'DECIDE_VIP_PREVIEW'; readonly decision: 'accept' | 'maybeLater' | 'declined' }
  | { readonly type: 'PURCHASE_VIP_MATERIALS' }
  | { readonly type: 'FIX_VIP_CONSUMABLE' }
  | { readonly type: 'HIRE_WORKER'; readonly to: NormalWaveNeedId }
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
    t.arrivalDurationMs ?? 90_000,
    t.serviceDurationMs ?? 12_000,
    t.unstaffedServiceSpeed ?? 0.33,
    ...NORMAL_SERVICE_IDS.map(n => t.baseServiceCapacity[n])
  ];
  if (values.some(v => !Number.isFinite(v) || v <= 0)) throw new Error('NORMAL_WAVE_PROOF_TUNING_INVALID');
}

function workerCount(wave: NormalWaveState, need: NormalWaveNeedId): number {
  return Object.values(wave.workerAssignments).filter(v => v === need).length;
}

function slotsAfterWorkerHire(wave: NormalWaveState, to: NormalWaveNeedId): Record<NormalWaveNeedId, number> | null {
  if (!wave.activeNeedIds.includes(to) || workerCount(wave, to) >= wave.buildingLevelsByNeed[to]) return null;
  const slots = copy(wave.workerSlotsByNeed);
  slots[to] = Math.max(slots[to], workerCount(wave, to) + 1);
  const workersAfter = Object.keys(wave.workerAssignments).length + 1;
  if (workersAfter >= wave.activeNeedIds.reduce((sum, need) => sum + slots[need], 0)) {
    const reserve = wave.activeNeedIds.find(need => slots[need] < wave.buildingLevelsByNeed[need]);
    if (reserve === undefined) return null;
    slots[reserve] += 1;
  }
  return slots;
}
export function normalWaveCanHireWorker(state: BootstrapState, to: NormalWaveNeedId): boolean {
  return (state.normalWave.phase === 'awaiting' || state.normalWave.phase === 'complete') && state.coins >= MVP_WORKER_PROOF_TUNING.hireCostCoins && slotsAfterWorkerHire(state.normalWave, to) !== null;
}
function validateWorkerModel(wave: NormalWaveState): void {
  const entries = Object.entries(wave.workerAssignments);
  const baseIds = new Set<string>([...NORMAL_WAVE_BASE_WORKER_IDS, ...Object.values(PROTOTYPE_AREA_WORKER_IDS)]);
  const needs = new Set<NormalWaveNeedId>(NORMAL_SERVICE_IDS);
  if (entries.some(([id, need]) => (!baseIds.has(id) && !/^worker-hired-[1-9][0-9]*$/.test(id)) || need === undefined || !needs.has(need))) throw new Error('NORMAL_WAVE_WORKER_UNASSIGNED');
  const eligible = new Set<NormalWaveNeedId>([...wave.activeNeedIds, ...entries.map(([, need]) => need as NormalWaveNeedId)]);
  let slots = 0;
  for (const need of NORMAL_SERVICE_IDS) {
    if (!Number.isInteger(wave.workerSlotsByNeed[need]) || wave.workerSlotsByNeed[need] < 1 || wave.workerSlotsByNeed[need] > wave.buildingLevelsByNeed[need]) throw new Error('NORMAL_WAVE_SLOT_MODEL_INVALID');
    if (workerCount(wave, need) > wave.workerSlotsByNeed[need]) throw new Error('NORMAL_WAVE_SLOT_OCCUPIED');
    if (eligible.has(need)) slots += wave.workerSlotsByNeed[need];
  }
  if (entries.length < Math.max(1, eligible.size - 1) || entries.length >= slots) throw new Error('NORMAL_WAVE_WORKER_SCARCITY_INVALID');
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
  waveNumber: PrototypeWaveNumber = 1,
  hiredManagers: NormalWaveManagerAssignments = {},
  committedSlots: NeedCounts = oneSlotEach()
): NormalWaveState {
  validateTuning(tuning);
  const demandTargetByNeed = empty();
  const profile = tuning.useStudioDemandProfile ? PROTOTYPE_WAVE_DEMAND_PROFILE[waveNumber] : {};
  const guestDemand = tuning.useStudioDemandProfile ? PROTOTYPE_WAVE_GUEST_PROFILE[waveNumber] : tuning.totalDemand;
  for (const need of activeNeedIds) {
    const profiledDemand = profile[need] ?? tuning.totalDemand;
    demandTargetByNeed[need] = debutNeedIds.includes(need) && !tuning.useStudioDemandProfile
      ? Math.min(profiledDemand, Math.max(1, Math.ceil(tuning.totalDemand / 2)))
      : profiledDemand;
  }
  const wave: NormalWaveState = {
    phase: 'awaiting', activeNeedIds: [...activeNeedIds], debutNeedIds: [...debutNeedIds], demandTargetByNeed,
    waveElapsedMs: 0,
    serviceProgressByNeed: { reception: [], food: [], drinks: [], relax: [], oceanView: [] },
    releasedByNeed: empty(), tuning: { ...tuning, totalDemand: guestDemand, baseServiceCapacity: copy(tuning.baseServiceCapacity) },
    buildingLevelsByNeed: { ...buildingLevelsByNeed },
    upgradeTuning: { ...upgradeTuning, capacityBonusByLevel: { ...upgradeTuning.capacityBonusByLevel }, coinCostByTargetLevel: { ...upgradeTuning.coinCostByTargetLevel }, resortValueGainByTargetLevel: { ...upgradeTuning.resortValueGainByTargetLevel } },
    releasedDemand: 0, queueByNeed: empty(), activeByNeed: empty(), servedByNeed: empty(), peakQueueByNeed: empty(),
    accumulatedWaitByNeed: empty(), staffingWaitByNeed: empty(), capacityWaitByNeed: empty(), totalQueuePressure: 0,
    workerSlotsByNeed: copy(committedSlots), workerAssignments: { ...workerAssignments }, hiredManagers: { ...hiredManagers }, reassignments: [], energyMode: null, energyBoostedNeedsThisWave: [], suddenRush: { ...suddenRush }, result: null
  };
  validateWorkerModel(wave);
  return wave;
}

function capacity(wave: NormalWaveState, need: NormalWaveNeedId): number {
  return wave.tuning.baseServiceCapacity[need]
    + wave.upgradeTuning.capacityBonusByLevel[Math.min(3, wave.buildingLevelsByNeed[need]) as PrototypeBuildingLevel]
    + mvpAdditionalCapacityForLevel(wave.buildingLevelsByNeed[need])
    ;
}

// Provisional MVP balance: each further Worker supplies half the marginal speed of the preceding Worker.
export const MVP_MULTI_WORKER_PROOF_TUNING = { marginalDecay: 0.5 } as const;
function serviceSpeed(wave: NormalWaveState, need: NormalWaveNeedId): number {
  const workers = workerCount(wave, need);
  const decay = MVP_MULTI_WORKER_PROOF_TUNING.marginalDecay;
  const workerSpeed = workers === 0
    ? (wave.tuning.unstaffedServiceSpeed ?? 0.33)
    : (1 - Math.pow(decay, workers)) / (1 - decay);
  return workerSpeed * (wave.hiredManagers[need] ? MVP_MANAGER_PROOF_TUNING.serviceSpeedMultiplier : 1);
}
export function normalWaveBuildingQualityBonus(state: BootstrapState, need: NormalWaveNeedId): number {
  return mvpQualityBonusForLevel(state.normalWave.buildingLevelsByNeed[need]);
}

export function normalWaveServiceSpeed(state: BootstrapState, need: NormalWaveNeedId): number {
  return serviceSpeed(state.normalWave, need);
}

export function normalWaveManagerMultiplier(state: BootstrapState, need: NormalWaveNeedId): number {
  return state.normalWave.hiredManagers[need] ? MVP_MANAGER_PROOF_TUNING.serviceSpeedMultiplier : 1;
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

export function normalNeedBottleneckCause(state: BootstrapState, need: NormalWaveNeedId): NormalWaveBottleneckCause | null {
  const wave = state.normalWave;
  if (!wave.activeNeedIds.includes(need) || wave.queueByNeed[need] <= 0) return null;
  return workerCount(wave, need) === 0 ? 'staffing' : 'capacity';
}

export function normalWaveUpgradeQuote(
  state: BootstrapState,
  need: NormalWaveNeedId
): PrototypeUpgradeQuote | null {
  const wave = state.normalWave;
  // Permanent investment is possible after a completed wave and during the next-wave preparation.
  // The initial Wave-1 setup is not a post-wave investment window.
  const betweenWaves = wave.phase === 'complete' && wave.result !== null ||
    wave.phase === 'awaiting' && state.currentWaveNumber > 1;
  if (!betweenWaves) return null;
  if (!wave.activeNeedIds.includes(need)) return null;
  const fromLevel = wave.buildingLevelsByNeed[need];
  const toLevel = nextBuildingLevel(state.progressionStage ?? 'prototype', fromLevel);
  if (toLevel === null) return null;
  const beforeCapacity = normalWaveServiceCapacity(state, need);
  const upgradedWave: NormalWaveState = {
    ...wave,
    buildingLevelsByNeed: { ...wave.buildingLevelsByNeed, [need]: toLevel }
  };
  const extension = toLevel >= 4 ? MVP_BUILDING_EXTENSION_PROOF_TUNING[toLevel as 4 | 5] : null;
 const rawPrestigeGain = wave.upgradeTuning.resortValueGainByTargetLevel[toLevel as PrototypeUpgradeTargetLevel];
 const resortValueGain = extension ? extension.resortValueGain : Number.isSafeInteger(rawPrestigeGain) && rawPrestigeGain > 0 ? rawPrestigeGain : PROTOTYPE_UPGRADE_PROOF_TUNING.resortValueGainByTargetLevel[toLevel as PrototypeUpgradeTargetLevel];
  return {
    need, fromLevel, toLevel, beforeCapacity,
    afterCapacity: capacity(upgradedWave, need),
    addedWorkerSlots: extension ? mvpWorkerSlotIncreaseOnUpgrade(toLevel) : 0,
    qualityBonusBefore: mvpQualityBonusForLevel(fromLevel),
    qualityBonusAfter: mvpQualityBonusForLevel(toLevel),
    coinCost: extension ? extension.coinCost : wave.upgradeTuning.coinCostByTargetLevel[toLevel as PrototypeUpgradeTargetLevel],
    resortValueGain
  };
}

function satisfactionFor(wave: NormalWaveState): NormalWaveSatisfaction {
  const waitingTimeByNeed = copy(wave.accumulatedWaitByNeed);
  const totalWaitingTime = wave.activeNeedIds.reduce((sum, need) => sum + waitingTimeByNeed[need], 0);
  return { basis: 'accumulated_wait', totalWaitingTime, waitingTimeByNeed };
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

  const demandUnits = wave.activeNeedIds.reduce((sum, need) => sum + wave.releasedByNeed[need], 0);
  const averageWaitSeconds = wave.totalQueuePressure / Math.max(1, demandUnits);
  const qualityRelief = wave.activeNeedIds.reduce((sum, need) => sum + wave.accumulatedWaitByNeed[need] * mvpQualityBonusForLevel(wave.buildingLevelsByNeed[need]), 0) / Math.max(1, wave.totalQueuePressure);
  const lostStars = Math.max(0, Math.min(4, Math.floor(averageWaitSeconds / wave.tuning.queuePressurePerLostStar) - Math.round(qualityRelief)));

  return {
    rating: 5 - lostStars,
    satisfaction: satisfactionFor(wave),
    totalQueuePressure: wave.totalQueuePressure,
    accumulatedWaitByNeed: copy(wave.accumulatedWaitByNeed),
    bottleneckNeed,
    bottleneckCause,
    peakQueueByNeed: copy(wave.peakQueueByNeed),
    reassignments: [...wave.reassignments],
    guidance,
    explanation: [
      `Peak queue ${bottleneckNeed}=${wave.peakQueueByNeed[bottleneckNeed]}.`,
      `Accumulated waiting ${bottleneckNeed}=${Math.round(wave.accumulatedWaitByNeed[bottleneckNeed])} unit-seconds; total=${Math.round(wave.totalQueuePressure)}.`,
      `Primary cause: ${bottleneckCause}.`,
      guidance,
      ...(wave.reassignments.length
        ? wave.reassignments.map(
            x =>
              `Worker moved ${x.from}->${x.to}; ${x.to} service speed ${x.toSpeedBefore}->${x.toSpeedAfter} with queue ${x.targetQueueAtChange}.`
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

/** Advance by elapsed time, not call-count. The 250ms internal step preserves arrival,
 *  per-service work and rush timing under both 200ms tests and 1000ms UI clock. */
function advanceWave(wave: NormalWaveState, deltaMs: number): NormalWaveState {
  if (wave.phase !== 'incoming' && wave.phase !== 'draining') return wave;
  let current = wave;
  let remainingMs = deltaMs;
  while (remainingMs > 0 && current.phase !== 'complete') {
    const stepMs = Math.min(remainingMs, 250);
    current = advanceWaveSlice(current, stepMs);
    remainingMs -= stepMs;
  }
  return current;
}

function advanceWaveSlice(wave: NormalWaveState, deltaMs: number): NormalWaveState {
  const elapsedMs = wave.waveElapsedMs + deltaMs;
  const arrivalDurationMs = wave.tuning.arrivalDurationMs ?? 90_000;
  const serviceDurationMs = wave.tuning.serviceDurationMs ?? 12_000;
  const rushTuning = PROTOTYPE_SUDDEN_RUSH_PROOF_TUNING;
  const rushDue = wave.suddenRush.scheduled && !wave.suddenRush.triggered &&
    elapsedMs >= rushTuning.triggerAfterMs;
  const rushTarget = rushDue
    ? wave.activeNeedIds.find(need => workerCount(wave, need) === 0)
    : wave.suddenRush.targetNeed;
  const rushNow = rushDue && rushTarget !== undefined;
  const suddenRush: PrototypeSuddenRushState = rushNow
    ? { ...wave.suddenRush, triggered: true, targetNeed: rushTarget }
    : rushDue
      ? { ...wave.suddenRush, scheduled: false }
      : wave.suddenRush;
  const demandTargetByNeed = copy(wave.demandTargetByNeed);
  if (rushNow && rushTarget) demandTargetByNeed[rushTarget] += suddenRush.extraDemand;

  const regularFraction = Math.min(1, elapsedMs / arrivalDurationMs);
  const releasedDemand = Math.min(wave.tuning.totalDemand, Math.floor(wave.tuning.totalDemand * regularFraction + 1e-9));
  const releasedByNeed = copy(wave.releasedByNeed);
  const servedByNeed = copy(wave.servedByNeed);
  const activeByNeed = empty(), queueByNeed = empty();
  const peakQueueByNeed = copy(wave.peakQueueByNeed);
  const accumulatedWaitByNeed = copy(wave.accumulatedWaitByNeed);
  const staffingWaitByNeed = copy(wave.staffingWaitByNeed);
  const capacityWaitByNeed = copy(wave.capacityWaitByNeed);
  const serviceProgressByNeed: Record<NormalWaveNeedId, readonly number[]> = {
    reception: [], food: [], drinks: [], relax: [], oceanView: []
  };
  for (const need of wave.activeNeedIds) {
    const isRushTarget = suddenRush.triggered && suddenRush.targetNeed === need;
    const baseTarget = demandTargetByNeed[need] - (isRushTarget ? suddenRush.extraDemand : 0);
    const rushFraction = isRushTarget
      ? Math.min(1, Math.max(0, elapsedMs - rushTuning.triggerAfterMs) / rushTuning.durationMs)
      : 0;
    const targetReleased = Math.min(demandTargetByNeed[need],
      Math.floor(baseTarget * regularFraction + 1e-9) + Math.floor(suddenRush.extraDemand * rushFraction + 1e-9));
    const newlyArrived = Math.max(0, targetReleased - wave.releasedByNeed[need]);
    releasedByNeed[need] = targetReleased;
    const boosted = wave.energyMode?.need === need ? PROTOTYPE_ENERGY_PROOF_TUNING.boostedServiceCycles : 1;
    const deltaProgress = (deltaMs / serviceDurationMs) * serviceSpeed(wave, need) * boosted;
    const progressed = wave.serviceProgressByNeed[need].map(x => x + deltaProgress);
    servedByNeed[need] += progressed.filter(x => x >= 1 - 1e-9).length;
    const active = progressed.filter(x => x < 1 - 1e-9);
    let waiting = wave.queueByNeed[need] + newlyArrived;
    const admitted = Math.min(waiting, Math.max(0, capacity(wave, need) - active.length));
    for (let i = 0; i < admitted; i++) active.push(0);
    waiting -= admitted;
    serviceProgressByNeed[need] = active;
    activeByNeed[need] = active.length;
    queueByNeed[need] = waiting;
    peakQueueByNeed[need] = Math.max(peakQueueByNeed[need], waiting);
    const queuedSeconds = waiting * deltaMs / 1000;
    accumulatedWaitByNeed[need] += queuedSeconds;
    if (workerCount(wave, need) === 0) staffingWaitByNeed[need] += queuedSeconds;
    else capacityWaitByNeed[need] += queuedSeconds;
  }
  const arrivalFinished = elapsedMs >= arrivalDurationMs &&
    (!suddenRush.scheduled || suddenRush.triggered &&
      elapsedMs >= rushTuning.triggerAfterMs + rushTuning.durationMs);
  const settled = wave.activeNeedIds.every(need => queueByNeed[need] === 0 && activeByNeed[need] === 0);
  const phase: NormalWavePhase = arrivalFinished ? (settled ? 'complete' : 'draining') : 'incoming';
  const energyMode = wave.energyMode === null ? null :
    wave.energyMode.ticksRemaining <= deltaMs / 1000 ? null :
      { ...wave.energyMode, ticksRemaining: wave.energyMode.ticksRemaining - deltaMs / 1000 };
  const next: NormalWaveState = {
    ...wave, energyBoostedNeedsThisWave: wave.energyBoostedNeedsThisWave ?? (wave.energyMode === null ? [] : [wave.energyMode.need]), phase, waveElapsedMs: elapsedMs, serviceProgressByNeed,
    demandTargetByNeed, suddenRush, energyMode, releasedDemand, releasedByNeed,
    queueByNeed, activeByNeed, servedByNeed, peakQueueByNeed, accumulatedWaitByNeed,
    staffingWaitByNeed, capacityWaitByNeed,
    totalQueuePressure: wave.activeNeedIds.reduce((sum, need) => sum + accumulatedWaitByNeed[need], 0)
  };
  return phase === 'complete' ? { ...next, result: resultFor(next) } : next;
}

export function createInitialBootstrapState(
  bootId: string,
  tuning: NormalWaveProofTuning = NORMAL_WAVE_PROOF_TUNING,
  progressionStage: ResortProgressionStage = 'prototype'
): BootstrapState {
  return {
    schema: BOOTSTRAP_STATE_SCHEMA,
    bootId,
    progressionStage,
    simulationTick: 0,
    elapsedSimulationMs: 0,
    energy: PROTOTYPE_ENERGY_PROOF_TUNING.startingEnergy,
    suddenRushOccurred: false,
    coins: PROTOTYPE_UPGRADE_PROOF_TUNING.startingCoins,
    reputation: 0,
    lastVipReward: null,
    materials: 0,
    resortValue: PROTOTYPE_UPGRADE_PROOF_TUNING.startingResortValue,
    currentWaveNumber: 1,
    purchasedAreas: { pool: false, bungalows: false },
 vipBuildings: { spa: false },
    hiredSpecialists: [],
    vipLayer: initialMvpVipLayer(),
    normalWave: awaiting(tuning)
  };
}

export function enableMvpProgression(state: BootstrapState): BootstrapState {
  return state.progressionStage === 'mvp' ? state : { ...state, progressionStage: 'mvp' };
}

export function hasSpecialistForVip(state: BootstrapState, specialistId: MvpSpecialistId): boolean {
  return state.hiredSpecialists.includes(specialistId);
}

export function normalizePrototypeSpecialistRoster(state: BootstrapState): BootstrapState {
  const raw = (state as { hiredSpecialists?: unknown }).hiredSpecialists;
  if (Array.isArray(raw) && raw.every(id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(MVP_SPECIALIST_CATALOG, id)) && new Set(raw).size === raw.length) return state;
  const fixed: MvpSpecialistId[] = [];
  if (Array.isArray(raw)) for (const id of raw) {
    if (typeof id === 'string' && Object.prototype.hasOwnProperty.call(MVP_SPECIALIST_CATALOG, id) && !fixed.includes(id as MvpSpecialistId)) fixed.push(id as MvpSpecialistId);
  }
  return { ...state, hiredSpecialists: fixed };
}

export function normalizePrototypeManagerRoster(state: BootstrapState): BootstrapState {
  const raw = (state.normalWave as { hiredManagers?: unknown }).hiredManagers;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const roster = raw as Record<string, unknown>;
    if (Object.entries(roster).every(([need, hired]) => NORMAL_SERVICE_IDS.includes(need as NormalWaveNeedId) && hired === true)) return state;
  }
  const repaired: Partial<Record<NormalWaveNeedId, true>> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const roster = raw as Record<string, unknown>;
    for (const need of NORMAL_SERVICE_IDS) if (roster[need] === true) repaired[need] = true;
  }
  return { ...state, normalWave: { ...state.normalWave, hiredManagers: repaired } };
}

export function normalizePrototypeWorkerRoster(state: BootstrapState): BootstrapState {
  const wave = state.normalWave;
  const eligible = new Set<NormalWaveNeedId>(wave.activeNeedIds);
  for (const areaId of PROTOTYPE_AREA_IDS) if (state.purchasedAreas[areaId]) eligible.add(PROTOTYPE_AREA_CATALOG[areaId].need);
  const slots = oneSlotEach();
  for (const need of NORMAL_SERVICE_IDS) {
    const raw = wave.workerSlotsByNeed?.[need];
    const persisted = Number.isInteger(raw) ? raw : 1;
    const assigned = Object.entries(wave.workerAssignments).filter(([id, to]) => to === need && ([...NORMAL_WAVE_BASE_WORKER_IDS, ...Object.values(PROTOTYPE_AREA_WORKER_IDS)].includes(id as never) || /^worker-hired-[1-9][0-9]*$/.test(id))).length;
    slots[need] = Math.min(wave.buildingLevelsByNeed[need], Math.max(1, persisted, assigned));
  }
  const hired = Object.keys(wave.workerAssignments).filter(id => /^worker-hired-[1-9][0-9]*$/.test(id)) as NormalWaveWorkerId[];
  const candidates: NormalWaveWorkerId[] = [...NORMAL_WAVE_BASE_WORKER_IDS, ...PROTOTYPE_AREA_IDS.filter(a => state.purchasedAreas[a]).map(a => PROTOTYPE_AREA_CATALOG[a].includedWorkerId), ...hired];
  const total = [...eligible].reduce((n, need) => n + slots[need], 0);
  const desired = Math.min(candidates.length, Math.max(0, total - 1));
  const result: Partial<Record<NormalWaveWorkerId, NormalWaveNeedId>> = {};
  const counts = new Map<NormalWaveNeedId, number>();
  const assign = (id: NormalWaveWorkerId, need: NormalWaveNeedId) => { result[id] = need; counts.set(need, (counts.get(need) ?? 0) + 1); };
  for (const id of candidates) {
    const need = wave.workerAssignments[id];
    if (Object.keys(result).length < desired && need !== undefined && eligible.has(need) && (counts.get(need) ?? 0) < slots[need]) assign(id, need);
  }
  for (const id of candidates) {
    if (Object.keys(result).length >= desired) break;
    if (result[id] !== undefined) continue;
    const preferred: NormalWaveNeedId = id === 'worker-2' ? 'relax' : id === 'worker-3' ? 'oceanView' : id === 'worker-0' ? 'drinks' : 'reception';
    const need = [...eligible].find(n => n === preferred && (counts.get(n) ?? 0) < slots[n]) ?? [...eligible].find(n => (counts.get(n) ?? 0) < slots[n]);
    if (need === undefined) throw new Error('NORMAL_WAVE_WORKER_REPAIR_IMPOSSIBLE');
    assign(id, need);
  }
  if (Object.keys(result).length !== desired) throw new Error('NORMAL_WAVE_WORKER_REPAIR_INCOMPLETE');
  const unchanged = NORMAL_SERVICE_IDS.every(n => wave.workerSlotsByNeed[n] === slots[n]) && Object.keys(wave.workerAssignments).length === Object.keys(result).length && Object.entries(wave.workerAssignments).every(([id,need]) => result[id as NormalWaveWorkerId] === need);
  if (unchanged) return state;
  const normalWave: NormalWaveState = { ...wave, workerSlotsByNeed: slots, workerAssignments: result };
  validateWorkerModel(normalWave);
  return { ...state, normalWave };
}

/** FR-043 provisional tuning, not canonical balance: shared Energy buys VIP-only timer progress. */
export const MVP_VIP_SPEED_UP_PROVISIONAL = { energyCost: 1, advanceMs: 10_000 } as const;
export function mvpVipSpeedUpAvailable(state: BootstrapState): boolean {
 return state.progressionStage === 'mvp' && state.vipLayer.active !== null && state.energy >= MVP_VIP_SPEED_UP_PROVISIONAL.energyCost;
}
/** FR-044: Spa is exclusively VIP infrastructure, not a normal-wave need or staffing target. */
export const MVP_VIP_SPA_BUILDING = { id: 'spa', label: 'Spa', role: 'vip', normalWaveNeed: null, workerSlots: 0 } as const;
/** Temporary purchase price; FINAL(3) does not set Spa cost. */
export const MVP_VIP_SPA_PROVISIONAL = { coinCost: 25 } as const;
export function mvpVipSpaPurchaseAvailable(state: BootstrapState): boolean {
 return state.progressionStage === 'mvp' && state.vipBuildings.spa === false && state.coins >= MVP_VIP_SPA_PROVISIONAL.coinCost;
}
export function normalWaveEnergyModeAvailable(state: BootstrapState, need: NormalWaveNeedId): boolean {
  const wave = state.normalWave;
  return (wave.phase === 'incoming' || wave.phase === 'draining')
    && wave.activeNeedIds.includes(need)
    && state.energy > 0
    && wave.energyMode === null
    && (state.progressionStage !== 'prototype' || !(wave.energyBoostedNeedsThisWave ?? []).includes(need));
}

// FR-046: one core-owned reward settlement per actual VIP active-to-completed transition.
// Tuning numbers in the preview proof catalog are provisional, not canonical constants.
function settleMvpVipCompletion(state: BootstrapState, vipLayer: MvpVipLayerState): Pick<BootstrapState, 'vipLayer' | 'reputation' | 'lastVipReward'> {
 const active = state.vipLayer.active;
 if (active === null || vipLayer.active !== null || vipLayer.completed.length !== state.vipLayer.completed.length + 1) return { vipLayer, reputation: state.reputation, lastVipReward: state.lastVipReward };
 const qualityCeiling = mvpVipAttainableQualityCeiling(active.preparedness) ?? 1;
 const preview = deriveMvpVipPreviewInfo(state, active.type).potentialReward;
 const reputation = Math.round(preview.minimum + (preview.maximum - preview.minimum) * (qualityCeiling - 1) / 4);
 return { vipLayer, reputation: state.reputation + reputation, lastVipReward: { vipType: active.type, qualityCeiling, reputation, completedVisitCount: vipLayer.completed.length } };
}

export function applyBootstrapCommand(state: BootstrapState, command: BootstrapCommand): BootstrapState {
  switch (command.type) {
    case 'START_WAVE':
      if (state.normalWave.phase !== 'awaiting') throw new Error('NORMAL_WAVE_START_INVALID');
      return { ...state, normalWave: { ...state.normalWave, phase: 'incoming' } };

    case 'CONTINUE_TO_NEXT_WAVE': {
      if (state.normalWave.phase !== 'complete') throw new Error('NORMAL_WAVE_CONTINUE_INVALID');
      if (state.currentWaveNumber === 8) throw new Error('NORMAL_WAVE_CAMPAIGN_COMPLETE');
      const nextWaveNumber = nextPrototypeWaveNumber(state.currentWaveNumber);
      const activeNeedIds = activeNeedIdsForAreas(state.purchasedAreas);
      const debutNeedIds = activeNeedIds.filter(need => !state.normalWave.activeNeedIds.includes(need));
      const scheduleRush = !state.suddenRushOccurred && nextWaveNumber === PROTOTYPE_SUDDEN_RUSH_PROOF_TUNING.earliestWave;
      return { ...state, currentWaveNumber: nextWaveNumber, normalWave: awaiting(state.normalWave.tuning, state.normalWave.workerAssignments, state.normalWave.buildingLevelsByNeed, state.normalWave.upgradeTuning, activeNeedIds, debutNeedIds, scheduleRush ? scheduledSuddenRush() : noSuddenRush(), nextWaveNumber, state.normalWave.hiredManagers, state.normalWave.workerSlotsByNeed) };
    }

    case 'SHOW_VIP_PREVIEW': {
      if (state.progressionStage !== 'mvp') throw new Error('MVP_VIP_STAGE_INVALID');
      return { ...state, vipLayer: showMvpVipPreview(state.vipLayer, command.vipType) };
    }

    case 'DECIDE_VIP_PREVIEW': {
      if (state.progressionStage !== 'mvp') throw new Error('MVP_VIP_STAGE_INVALID');
      return { ...state, vipLayer: decideMvpVipPreview(state.vipLayer, command.decision) };
    }

    case 'PURCHASE_VIP_MATERIALS': {
      if (state.progressionStage !== 'mvp') throw new Error('MVP_VIP_STAGE_INVALID');
      if (state.coins < MVP_VIP_MATERIALS_PROVISIONAL.supplyCostCoins) throw new Error('MVP_VIP_MATERIALS_COINS_INSUFFICIENT');
      return { ...state, coins: state.coins - MVP_VIP_MATERIALS_PROVISIONAL.supplyCostCoins, materials: state.materials + MVP_VIP_MATERIALS_PROVISIONAL.supplyUnits };
    }
    case 'FIX_VIP_CONSUMABLE': {
      if (state.progressionStage !== 'mvp') throw new Error('MVP_VIP_STAGE_INVALID');
      if (state.vipLayer.accepted === null || !state.vipLayer.requestsOpen || state.vipLayer.consumableReady) throw new Error('MVP_VIP_CONSUMABLE_FIX_UNAVAILABLE');
      if (state.materials < MVP_VIP_MATERIALS_PROVISIONAL.fixCostMaterials) throw new Error('MVP_VIP_MATERIALS_INSUFFICIENT');
      return { ...state, materials: state.materials - MVP_VIP_MATERIALS_PROVISIONAL.fixCostMaterials, vipLayer: markMvpVipConsumableReady(state.vipLayer) };
    }
    case 'BEGIN_VIP_VISIT': {
      if (state.progressionStage !== 'mvp') throw new Error('MVP_VIP_STAGE_INVALID');
      if (state.vipLayer.accepted !== null && (state.vipLayer.accepted !== command.vipType || !state.vipLayer.consumableReady)) throw new Error('MVP_VIP_CONSUMABLE_NOT_READY');
      const prior = deriveMvpVipPreviewInfo(state, command.vipType);
      return { ...state, vipLayer: beginMvpVipVisit(state.vipLayer, command.vipType, { readiness: prior.readiness, rosterGaps: prior.rosterGaps, buildingGaps: prior.buildingGaps }) };
    }

    case 'VIP_SPEED_UP': {
 if (state.progressionStage !== 'mvp') throw new Error('MVP_VIP_STAGE_INVALID');
 if (state.vipLayer.active === null) throw new Error('MVP_VIP_SPEED_UP_NOT_IN_PROGRESS');
 if (state.energy < MVP_VIP_SPEED_UP_PROVISIONAL.energyCost) throw new Error('MVP_VIP_SPEED_UP_ENERGY_INSUFFICIENT');
 return { ...state, energy: state.energy - MVP_VIP_SPEED_UP_PROVISIONAL.energyCost, ...settleMvpVipCompletion(state, advanceMvpVipLayer(state.vipLayer, MVP_VIP_SPEED_UP_PROVISIONAL.advanceMs)) };
 }

 case 'HIRE_SPECIALIST': {
      if (state.normalWave.phase !== 'awaiting' && state.normalWave.phase !== 'complete') throw new Error('MVP_SPECIALIST_HIRE_PHASE_INVALID');
      if (!Object.prototype.hasOwnProperty.call(MVP_SPECIALIST_CATALOG, command.specialistId)) throw new Error('MVP_SPECIALIST_UNKNOWN');
      if (state.hiredSpecialists.includes(command.specialistId)) throw new Error('MVP_SPECIALIST_ALREADY_HIRED');
      if (state.coins < MVP_SPECIALIST_PROOF_TUNING.hireCostCoins) throw new Error('MVP_SPECIALIST_COINS_INSUFFICIENT');
      return { ...state, coins: state.coins - MVP_SPECIALIST_PROOF_TUNING.hireCostCoins, hiredSpecialists: [...state.hiredSpecialists, command.specialistId] };
    }

    case 'HIRE_WORKER': {
      const wave = state.normalWave;
      if (wave.phase !== 'awaiting' && wave.phase !== 'complete') throw new Error('NORMAL_WAVE_HIRE_PHASE_INVALID');
      if (!wave.activeNeedIds.includes(command.to)) throw new Error('NORMAL_WAVE_TARGET_INACTIVE');
      if (workerCount(wave, command.to) >= wave.buildingLevelsByNeed[command.to]) throw new Error('NORMAL_WAVE_SLOT_OCCUPIED');
      const nextSlots = slotsAfterWorkerHire(wave, command.to);
      if (nextSlots === null) throw new Error('NORMAL_WAVE_WORKER_SCARCITY_INVALID');
      if (state.coins < MVP_WORKER_PROOF_TUNING.hireCostCoins) throw new Error('NORMAL_WAVE_HIRE_COINS_INSUFFICIENT');
      const used = Object.keys(wave.workerAssignments).filter(id => /^worker-hired-[1-9][0-9]*$/.test(id)).map(id => Number(id.slice(13)));
      const workerId = ('worker-hired-' + (Math.max(0, ...used) + 1)) as NormalWaveWorkerId;
      const normalWave: NormalWaveState = { ...wave, workerSlotsByNeed: nextSlots, workerAssignments: { ...wave.workerAssignments, [workerId]: command.to } };
      validateWorkerModel(normalWave);
      return { ...state, coins: state.coins - MVP_WORKER_PROOF_TUNING.hireCostCoins, normalWave };
    }

    case 'HIRE_MANAGER': {
      if (state.normalWave.phase !== 'awaiting' && state.normalWave.phase !== 'complete') throw new Error('MVP_MANAGER_HIRE_PHASE_INVALID');
      if (!NORMAL_SERVICE_IDS.includes(command.need) || !activeNeedIdsForAreas(state.purchasedAreas).includes(command.need)) throw new Error('MVP_MANAGER_BUILDING_LOCKED');
      if (state.normalWave.hiredManagers[command.need]) throw new Error('MVP_MANAGER_ALREADY_HIRED');
      if (state.coins < MVP_MANAGER_PROOF_TUNING.hireCostCoins) throw new Error('MVP_MANAGER_COINS_INSUFFICIENT');
      return { ...state, coins: state.coins - MVP_MANAGER_PROOF_TUNING.hireCostCoins, normalWave: { ...state.normalWave, hiredManagers: { ...state.normalWave.hiredManagers, [command.need]: true } } };
    }

    case 'PURCHASE_VIP_SPA': {
      if (state.progressionStage !== 'mvp') throw new Error('MVP_VIP_SPA_STAGE_INVALID');
      if (state.vipBuildings.spa) return state;
      if (state.coins < MVP_VIP_SPA_PROVISIONAL.coinCost) throw new Error('MVP_VIP_SPA_COINS_INSUFFICIENT');
      return { ...state, coins: state.coins - MVP_VIP_SPA_PROVISIONAL.coinCost, vipBuildings: { ...state.vipBuildings, spa: true } };
    }
    case 'PURCHASE_AREA': {
      if (state.normalWave.phase !== 'awaiting' && state.normalWave.phase !== 'complete') throw new Error('PROTOTYPE_AREA_PURCHASE_PHASE_INVALID');
      const view = prototypeAreaUnlockView(state, command.areaId);
      if (view.status !== 'available') return state;
      const purchasedAreas: PrototypeAreaPurchases = { ...state.purchasedAreas, [command.areaId]: true };
      const workerAssignments: NormalWaveWorkerAssignments = { ...state.normalWave.workerAssignments, [view.includedWorkerId]: view.need };
      const nextNeeds = activeNeedIdsForAreas(purchasedAreas);
      const normalWave = state.normalWave.phase === 'awaiting'
        ? awaiting(state.normalWave.tuning, workerAssignments, state.normalWave.buildingLevelsByNeed, state.normalWave.upgradeTuning, nextNeeds, nextNeeds.filter(need => state.normalWave.debutNeedIds.includes(need) || !state.normalWave.activeNeedIds.includes(need)), state.normalWave.suddenRush, state.currentWaveNumber, state.normalWave.hiredManagers, state.normalWave.workerSlotsByNeed)
        : { ...state.normalWave, workerAssignments };
      validateWorkerModel(normalWave);
      return { ...state, coins: state.coins - view.coinCost, purchasedAreas, normalWave };
    }

    case 'UPGRADE_BUILDING': {
      const quote = normalWaveUpgradeQuote(state, command.need);
      if (quote === null || state.coins < quote.coinCost) return state;
    if (!Number.isSafeInteger(state.resortValue) || state.resortValue < 0 || !Number.isSafeInteger(quote.resortValueGain) || quote.resortValueGain <= 0 || !Number.isSafeInteger(state.resortValue + quote.resortValueGain)) throw new Error('RESORT_VALUE_INVARIANT');
      return {
        ...state,
        coins: state.coins - quote.coinCost,
        resortValue: state.resortValue + quote.resortValueGain,
        normalWave: {
          ...state.normalWave,
          buildingLevelsByNeed: {
            ...state.normalWave.buildingLevelsByNeed,
            [command.need]: quote.toLevel
          },
          workerSlotsByNeed: quote.addedWorkerSlots === 0 ? state.normalWave.workerSlotsByNeed : {
            ...state.normalWave.workerSlotsByNeed,
            [command.need]: state.normalWave.workerSlotsByNeed[command.need] + quote.addedWorkerSlots
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
      const fromSpeedBefore = serviceSpeed(wave, from);
      const toSpeedBefore = serviceSpeed(wave, command.to);
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
        fromSpeedBefore, fromSpeedAfter: serviceSpeed(moved, from),
        toSpeedBefore, toSpeedAfter: serviceSpeed(moved, command.to),
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
      if (!normalWaveEnergyModeAvailable(state, command.need)) return state;
      return { ...state, energy: state.energy - 1, normalWave: { ...wave, energyMode: { need: command.need, ticksRemaining: PROTOTYPE_ENERGY_PROOF_TUNING.boostDurationTicks }, energyBoostedNeedsThisWave: [...new Set([...(wave.energyBoostedNeedsThisWave ?? []), command.need])] } };
    }

    case 'CLAIM_COMEBACK_REWARD':
      return { ...state, coins: state.coins + PROTOTYPE_ECONOMY_PROOF_TUNING.comebackRewardCoins };

    case 'ADVANCE_SIMULATION': {
      if (!Number.isFinite(command.deltaMs) || command.deltaMs <= 0) throw new Error('BOOTSTRAP_DELTA_INVALID');
      const normalWave = advanceWave(state.normalWave, command.deltaMs);
      const vipLayer = state.progressionStage === 'mvp' ? advanceMvpVipLayer(state.vipLayer, command.deltaMs) : state.vipLayer;
 const vipReward = settleMvpVipCompletion(state, vipLayer);
      const completedNow = state.normalWave.phase !== 'complete' && normalWave.phase === 'complete';
      const rushTriggeredNow = !state.normalWave.suddenRush.triggered && normalWave.suddenRush.triggered;
      return { ...state, ...vipReward, simulationTick: state.simulationTick + 1, elapsedSimulationMs: state.elapsedSimulationMs + command.deltaMs, coins: state.coins + (completedNow ? normalWaveCoinReward(normalWave) : 0), reputation: vipReward.reputation + (completedNow ? (normalWave.result?.rating ?? 0) : 0), energy: state.energy + (completedNow ? PROTOTYPE_ENERGY_PROOF_TUNING.earnedPerCompletedWave : 0), suddenRushOccurred: state.suddenRushOccurred || rushTriggeredNow, normalWave };
    }
  }
}

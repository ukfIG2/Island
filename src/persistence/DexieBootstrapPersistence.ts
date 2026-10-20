import { normalizePrototypeSpecialistRoster, normalizePrototypeManagerRoster, normalizePrototypeWorkerRoster } from '../core/state';
import { PROTOTYPE_UPGRADE_PROOF_TUNING } from '../core/state';
import Dexie, { type Table } from 'dexie';
import { MVP_VIP_TYPES, normalizeMvpVipLayer } from '../core/vipLayer';
import {
  NORMAL_SERVICE_IDS,
  NORMAL_WAVE_NEEDS,
  NORMAL_WAVE_PROOF_WORKER_ID,
  createInitialBootstrapState,
  type BootstrapState,
  type NormalWaveNeedId,
  type NormalWaveState
} from '../core/state';
import type { BootstrapPersistence } from './PersistencePort';

interface BootstrapRecord {
  id: 'singleton';
  state: BootstrapState;
}

class ResortBootstrapDatabase extends Dexie {
  readonly bootstrap: Table<BootstrapRecord, string>;

  constructor() {
    super('resort-empire-bootstrap');

    this.version(1).stores({
      bootstrap: 'id'
    });

    this.bootstrap = this.table('bootstrap');
  }
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function extendNeedRecord(value: unknown, fallback: number): Record<NormalWaveNeedId, number> {
  const source = value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
  const n = (key: NormalWaveNeedId, defaultValue: number) => finiteNonNegative(source[key]) ? source[key] as number : defaultValue;
  return {
    reception: n('reception', fallback),
    food: n('food', fallback),
    drinks: n('drinks', fallback),
    relax: n('relax', fallback),
    oceanView: n('oceanView', fallback)
  };
}

function isNeedId(value: unknown): value is NormalWaveNeedId {
  return typeof value === 'string' && (NORMAL_SERVICE_IDS as readonly string[]).includes(value);
}

function extendLegacyWave(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  const wave = value as Record<string, any>;
  const hadDrinks = wave.queueByNeed && typeof wave.queueByNeed === 'object' && finiteNonNegative(wave.queueByNeed.drinks);
  const activeNeedIds: NormalWaveNeedId[] = Array.isArray(wave.activeNeedIds)
    ? wave.activeNeedIds.filter(isNeedId)
    : (hadDrinks || wave.phase === 'awaiting' ? [...NORMAL_WAVE_NEEDS] : ['reception', 'food']);
  const totalDemand = finiteNonNegative(wave.tuning?.totalDemand) ? wave.tuning.totalDemand : 0;
  const releasedDemand = finiteNonNegative(wave.releasedDemand) ? wave.releasedDemand : 0;
  const demandTargetByNeed = extendNeedRecord(wave.demandTargetByNeed, 0);
  const releasedByNeed = extendNeedRecord(wave.releasedByNeed, 0);
  if (wave.demandTargetByNeed === undefined) for (const need of activeNeedIds) demandTargetByNeed[need] = totalDemand;
  if (wave.releasedByNeed === undefined) for (const need of activeNeedIds) releasedByNeed[need] = releasedDemand;
  const result = wave.result && typeof wave.result === 'object' ? {
    ...wave.result,
    accumulatedWaitByNeed: extendNeedRecord(wave.result.accumulatedWaitByNeed, 0),
    peakQueueByNeed: extendNeedRecord(wave.result.peakQueueByNeed, 0)
  } : wave.result;
  return {
    ...wave,
    activeNeedIds,
    debutNeedIds: Array.isArray(wave.debutNeedIds) ? wave.debutNeedIds.filter(isNeedId) : [],
    demandTargetByNeed,
    releasedByNeed,
    tuning: wave.tuning && typeof wave.tuning === 'object' ? { ...wave.tuning, baseServiceCapacity: extendNeedRecord(wave.tuning.baseServiceCapacity, 1) } : wave.tuning,
    queueByNeed: extendNeedRecord(wave.queueByNeed, 0),
    activeByNeed: extendNeedRecord(wave.activeByNeed, 0),
    servedByNeed: extendNeedRecord(wave.servedByNeed, 0),
    peakQueueByNeed: extendNeedRecord(wave.peakQueueByNeed, 0),
    accumulatedWaitByNeed: extendNeedRecord(wave.accumulatedWaitByNeed, 0),
    staffingWaitByNeed: extendNeedRecord(wave.staffingWaitByNeed, 0),
    capacityWaitByNeed: extendNeedRecord(wave.capacityWaitByNeed, 0),
    workerSlotsByNeed: extendNeedRecord(wave.workerSlotsByNeed, 1),
    buildingLevelsByNeed: extendNeedRecord(wave.buildingLevelsByNeed, 1),
    energyMode: wave.energyMode && typeof wave.energyMode === 'object' && isNeedId(wave.energyMode.need) && finiteNonNegative(wave.energyMode.ticksRemaining) ? { need: wave.energyMode.need, ticksRemaining: wave.energyMode.ticksRemaining } : null,
    suddenRush: wave.suddenRush && typeof wave.suddenRush === 'object' ? { scheduled: wave.suddenRush.scheduled === true, triggered: wave.suddenRush.triggered === true, triggerAfterReleasedDemand: finiteNonNegative(wave.suddenRush.triggerAfterReleasedDemand) ? wave.suddenRush.triggerAfterReleasedDemand : 0, extraDemand: finiteNonNegative(wave.suddenRush.extraDemand) ? wave.suddenRush.extraDemand : 0 } : { scheduled: false, triggered: false, triggerAfterReleasedDemand: 0, extraDemand: 0 },
    result
  };
}

function hasNeedCounts(value: unknown): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const counts = value as Partial<Record<NormalWaveNeedId, unknown>>;
  return NORMAL_SERVICE_IDS.every(need => finiteNonNegative(counts[need]));
}

function hasCanonicalWaveShape(value: unknown): value is NormalWaveState {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const wave = value as Partial<NormalWaveState>;
  return (
    Array.isArray(wave.activeNeedIds) && wave.activeNeedIds.every(isNeedId) &&
    Array.isArray(wave.debutNeedIds) && wave.debutNeedIds.every(isNeedId) &&
    hasNeedCounts(wave.demandTargetByNeed) &&
    hasNeedCounts(wave.releasedByNeed) &&
    hasNeedCounts(wave.queueByNeed) &&
    hasNeedCounts(wave.activeByNeed) &&
    hasNeedCounts(wave.servedByNeed) &&
    hasNeedCounts(wave.peakQueueByNeed) &&
    hasNeedCounts(wave.accumulatedWaitByNeed) &&
    hasNeedCounts(wave.staffingWaitByNeed) &&
    hasNeedCounts(wave.capacityWaitByNeed) &&
    hasNeedCounts(wave.workerSlotsByNeed) &&
    wave.workerAssignments !== undefined &&
    typeof wave.workerAssignments === 'object' &&
    Array.isArray(wave.reassignments) &&
    (wave.energyMode === null || (wave.energyMode !== undefined && isNeedId(wave.energyMode.need) && finiteNonNegative(wave.energyMode.ticksRemaining))) &&
    wave.suddenRush !== undefined &&
    typeof wave.suddenRush.scheduled === 'boolean' &&
    typeof wave.suddenRush.triggered === 'boolean' &&
    finiteNonNegative(wave.suddenRush.triggerAfterReleasedDemand) &&
    finiteNonNegative(wave.suddenRush.extraDemand) &&
    (wave.result === null || (
      wave.result !== undefined &&
      (wave.result.bottleneckCause === 'staffing' || wave.result.bottleneckCause === 'capacity') &&
      typeof wave.result.guidance === 'string' &&
      hasNeedCounts(wave.result.accumulatedWaitByNeed)
    ))
  );
}

function legacyWorkerAssignment(value: unknown): NormalWaveNeedId | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }

  const wave = value as {
    workerAssignments?: Record<string, unknown>;
  };
  const assigned = wave.workerAssignments?.[NORMAL_WAVE_PROOF_WORKER_ID];

  return isNeedId(assigned) ? assigned : null;
}

function normalizePersistedStateLegacy(
  persisted: BootstrapState
): BootstrapState {
  const raw = persisted as any;
  const rawWave = raw.normalWave;
  const alreadyCanonical =
    Number.isInteger(raw.currentWaveNumber) &&
    raw.currentWaveNumber >= 1 &&
    raw.currentWaveNumber <= 8 &&
    typeof raw.purchasedAreas?.pool === 'boolean' &&
    typeof raw.purchasedAreas?.bungalows === 'boolean' &&
    Number.isInteger(raw.energy) && raw.energy >= 0 &&
    typeof raw.suddenRushOccurred === 'boolean' &&
    Number.isInteger(raw.coins) &&
    Number.isInteger(raw.resortValue) &&
    hasCanonicalWaveShape(rawWave) &&
    rawWave?.buildingLevelsByNeed !== undefined &&
    NORMAL_SERVICE_IDS.every(need => [1, 2, 3, 4, 5].includes(rawWave.buildingLevelsByNeed[need])) &&
    rawWave?.upgradeTuning !== undefined;

  if (alreadyCanonical) {
    return persisted;
  }

  persisted = {
    ...persisted,
    energy: Number.isInteger(raw.energy) && raw.energy >= 0 ? raw.energy : 0,
    suddenRushOccurred: raw.suddenRushOccurred === true,
    purchasedAreas: {
      pool: raw.purchasedAreas?.pool === true,
      bungalows: raw.purchasedAreas?.bungalows === true
    }
  };
  if (!(Number.isInteger(raw.currentWaveNumber) && raw.currentWaveNumber >= 1 && raw.currentWaveNumber <= 8 && hasCanonicalWaveShape(raw.normalWave) && raw.normalWave?.buildingLevelsByNeed?.drinks !== undefined)) {
    persisted = {
      ...persisted,
      currentWaveNumber: Number.isInteger(raw.currentWaveNumber) && raw.currentWaveNumber >= 1 && raw.currentWaveNumber <= 8 ? raw.currentWaveNumber : 1,
      normalWave: extendLegacyWave(raw.normalWave) as BootstrapState['normalWave']
    };
  }
  const legacy = persisted as BootstrapState & { coins?: number; resortValue?: number; normalWave?: BootstrapState['normalWave'] & { buildingLevelsByNeed?: BootstrapState['normalWave']['buildingLevelsByNeed']; upgradeTuning?: BootstrapState['normalWave']['upgradeTuning'] } };
  const legacyWave = legacy.normalWave;
  const hasCurrentUpgradeShape =
    Number.isInteger(legacy.coins) &&
    Number.isInteger(legacy.resortValue) &&
    legacyWave !== undefined &&
    legacyWave.buildingLevelsByNeed !== undefined &&
    NORMAL_SERVICE_IDS.every(need => [1, 2, 3, 4, 5].includes(legacyWave.buildingLevelsByNeed![need])) &&
    legacyWave.upgradeTuning !== undefined;

  if (hasCurrentUpgradeShape && hasCanonicalWaveShape(persisted.normalWave)) {
    return persisted;
  }

  persisted = {
    ...persisted,
    coins: Number.isInteger(legacy.coins) ? legacy.coins! : PROTOTYPE_UPGRADE_PROOF_TUNING.startingCoins,
    resortValue: Number.isInteger(legacy.resortValue) ? legacy.resortValue! : PROTOTYPE_UPGRADE_PROOF_TUNING.startingResortValue,
    normalWave: legacy.normalWave === undefined ? legacy.normalWave as BootstrapState['normalWave'] : {
      ...legacy.normalWave,
      buildingLevelsByNeed: legacy.normalWave.buildingLevelsByNeed ?? { reception: 1, food: 1, drinks: 1, relax: 1, oceanView: 1 },
      upgradeTuning: legacy.normalWave.upgradeTuning ?? PROTOTYPE_UPGRADE_PROOF_TUNING
    }
  };

  if (hasCanonicalWaveShape(persisted.normalWave)) {
    return persisted;
  }

  const current = createInitialBootstrapState(
    typeof persisted.bootId === 'string'
      ? persisted.bootId
      : 'migrated-bootstrap'
  );
  const assignment = legacyWorkerAssignment(
    (persisted as unknown as { normalWave?: unknown }).normalWave
  );

  return {
    ...current,
    simulationTick:
      Number.isFinite(persisted.simulationTick)
        ? persisted.simulationTick
        : 0,
    elapsedSimulationMs:
      Number.isFinite(persisted.elapsedSimulationMs)
        ? persisted.elapsedSimulationMs
        : 0,
    normalWave: assignment === null
      ? current.normalWave
      : {
          ...current.normalWave,
          workerAssignments: {
            [NORMAL_WAVE_PROOF_WORKER_ID]: assignment
          }
        }
  };
}

export class DexieBootstrapPersistence
  implements BootstrapPersistence {
  private readonly db = new ResortBootstrapDatabase();

  async load(): Promise<BootstrapState | null> {
    const record = await this.db.bootstrap.get('singleton');

    if (record === undefined) {
      return null;
    }

    return normalizePersistedState(record.state);
  }

  async save(state: BootstrapState): Promise<void> {
    await this.db.bootstrap.put({
      id: 'singleton',
      state
    });
  }
}

/** Preserve existing campaign/queue/worker progress when opening a v1 tick-based save.
 * Historical active slots restart at zero progress; no queued/served units are discarded.
 * A new temporal model is only installed when the saved state lacks its fields. */
function ensureTemporalWave(state: BootstrapState): BootstrapState {
  const wave = state.normalWave;
  const raw = wave as NormalWaveState & {
    waveElapsedMs?: number;
    serviceProgressByNeed?: Record<NormalWaveNeedId, readonly number[]>;
  };
  if (finiteNonNegative(raw.waveElapsedMs) && raw.serviceProgressByNeed &&
    NORMAL_SERVICE_IDS.every(need => Array.isArray(raw.serviceProgressByNeed![need]) &&
      raw.serviceProgressByNeed![need].length === wave.activeByNeed[need])) return state;

  const arrivalDurationMs = wave.tuning.arrivalDurationMs ?? 90_000;
  const progress = wave.tuning.totalDemand > 0 ? wave.releasedDemand / wave.tuning.totalDemand : 0;
  const elapsedMs = wave.phase === 'awaiting' ? 0 : wave.phase === 'incoming'
    ? Math.min(arrivalDurationMs, Math.max(0, progress * arrivalDurationMs))
    : arrivalDurationMs;
  // Construct every service key explicitly so a restored save has a complete,
  // statically checked record even when some services are not unlocked yet.
  const activeSlots = (need: NormalWaveNeedId): readonly number[] =>
    Array.from({ length: wave.activeByNeed[need] }, () => 0);
  const serviceProgressByNeed: Record<NormalWaveNeedId, readonly number[]> = {
    reception: activeSlots('reception'),
    food: activeSlots('food'),
    drinks: activeSlots('drinks'),
    relax: activeSlots('relax'),
    oceanView: activeSlots('oceanView')
  };
  return {
    ...state,
    normalWave: {
      ...wave,
      tuning: {
        ...wave.tuning,
        arrivalDurationMs,
        serviceDurationMs: wave.tuning.serviceDurationMs ?? 12_000,
        unstaffedServiceSpeed: wave.tuning.unstaffedServiceSpeed ?? 0.33,
        useStudioDemandProfile: wave.tuning.useStudioDemandProfile ?? true
      },
      waveElapsedMs: elapsedMs,
      serviceProgressByNeed
    }
  };
}

export function normalizePersistedState(...args: Parameters<typeof normalizePersistedStateLegacy>): BootstrapState {
  const state = normalizePrototypeSpecialistRoster(normalizePrototypeManagerRoster(normalizePrototypeWorkerRoster(ensureTemporalWave(normalizePersistedStateLegacy(...args)))));
  const vipLayer = normalizeMvpVipLayer((state as Partial<BootstrapState>).vipLayer);
  const withVip = state.vipLayer === vipLayer ? state : { ...state, vipLayer };
  const legacyMaterials = (withVip as Partial<BootstrapState>).materials;
  const materials = typeof legacyMaterials === 'number' && Number.isSafeInteger(legacyMaterials) && legacyMaterials >= 0 ? legacyMaterials : 0;
  const rawReputation = (withVip as Partial<BootstrapState>).reputation;
 const reputation = typeof rawReputation === 'number' && Number.isSafeInteger(rawReputation) && rawReputation >= 0 ? rawReputation : 0;
 const rawReceipt = (withVip as Partial<BootstrapState>).lastVipReward;
 const lastVipReward = rawReceipt && MVP_VIP_TYPES.some(type => type === rawReceipt.vipType) && Number.isSafeInteger(rawReceipt.reputation) && rawReceipt.reputation > 0 && Number.isInteger(rawReceipt.qualityCeiling) && rawReceipt.qualityCeiling >= 1 && rawReceipt.qualityCeiling <= 5 && Number.isSafeInteger(rawReceipt.completedVisitCount) && rawReceipt.completedVisitCount > 0 ? rawReceipt : null;
 const hydrated = legacyMaterials === materials && rawReputation === reputation && withVip.lastVipReward === lastVipReward ? withVip : { ...withVip, materials, reputation, lastVipReward };
  // Legacy snapshots predate VIP buildings. Missing or corrupt Spa ownership means not built.
  const rawVipBuildings = (hydrated as Partial<BootstrapState>).vipBuildings;
  const withSpa = typeof rawVipBuildings?.spa === 'boolean' ? hydrated : { ...hydrated, vipBuildings: { spa: false } };
  // Preserve already-canonical snapshots by identity.
  const savedPrestige = (withSpa as Partial<BootstrapState>).resortValue;
  const validPrestige = typeof savedPrestige === 'number' && Number.isSafeInteger(savedPrestige) && savedPrestige >= 0;
  const withPrestige = validPrestige ? withSpa : { ...withSpa, resortValue: PROTOTYPE_UPGRADE_PROOF_TUNING.startingResortValue };
  if (withPrestige.progressionStage === 'prototype' || withPrestige.progressionStage === 'mvp') return withPrestige;
  return { ...withPrestige, progressionStage: 'prototype' };
}

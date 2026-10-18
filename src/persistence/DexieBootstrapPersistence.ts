import { normalizePrototypeWorkerRoster } from '../core/state';
import { PROTOTYPE_UPGRADE_PROOF_TUNING } from '../core/state';
import Dexie, { type Table } from 'dexie';
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
    NORMAL_SERVICE_IDS.every(need => [1, 2, 3].includes(rawWave.buildingLevelsByNeed[need])) &&
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
    NORMAL_SERVICE_IDS.every(need => [1, 2, 3].includes(legacyWave.buildingLevelsByNeed![need])) &&
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

export function normalizePersistedState(...args: Parameters<typeof normalizePersistedStateLegacy>) {
  return normalizePrototypeWorkerRoster(normalizePersistedStateLegacy(...args));
}

import { PROTOTYPE_UPGRADE_PROOF_TUNING } from '../core/state';
import Dexie, { type Table } from 'dexie';
import {
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

function extendNeedRecord(value: unknown, drinksDefault: number): Record<string, number> {
  const source = value !== null && typeof value === 'object' ? value as Record<string, unknown> : {};
  const n = (key: string, fallback: number) => finiteNonNegative(source[key]) ? source[key] as number : fallback;
  return { reception: n('reception', 0), food: n('food', 0), drinks: n('drinks', drinksDefault) };
}

function extendLegacyWave(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  const wave = value as Record<string, any>;
  const hadDrinks = wave.queueByNeed && typeof wave.queueByNeed === 'object' && finiteNonNegative(wave.queueByNeed.drinks);
  const result = wave.result && typeof wave.result === 'object' ? {
    ...wave.result,
    accumulatedWaitByNeed: extendNeedRecord(wave.result.accumulatedWaitByNeed, 0),
    peakQueueByNeed: extendNeedRecord(wave.result.peakQueueByNeed, 0)
  } : wave.result;
  return {
    ...wave,
    activeNeedIds: Array.isArray(wave.activeNeedIds) ? wave.activeNeedIds : (hadDrinks || wave.phase === 'awaiting' ? NORMAL_WAVE_NEEDS : ['reception', 'food']),
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
    result
  };
}

function hasNeedCounts(value: unknown): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const counts = value as Partial<Record<NormalWaveNeedId, unknown>>;
  return NORMAL_WAVE_NEEDS.every(need => finiteNonNegative(counts[need]));
}

function hasCanonicalWaveShape(value: unknown): value is NormalWaveState {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const wave = value as Partial<NormalWaveState>;
  return (
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

  return assigned === 'reception' || assigned === 'food' || assigned === 'drinks'
    ? assigned
    : null;
}

export function normalizePersistedState(
  persisted: BootstrapState
): BootstrapState {
  const raw = persisted as any;
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
    NORMAL_WAVE_NEEDS.every(need => [1, 2, 3].includes(legacyWave.buildingLevelsByNeed![need])) &&
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
      buildingLevelsByNeed: legacy.normalWave.buildingLevelsByNeed ?? { reception: 1, food: 1, drinks: 1 },
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

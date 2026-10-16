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

  return assigned === 'reception' || assigned === 'food'
    ? assigned
    : null;
}

export function normalizePersistedState(
  persisted: BootstrapState
): BootstrapState {
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

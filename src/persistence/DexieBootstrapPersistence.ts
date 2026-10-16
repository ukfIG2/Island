import Dexie, { type Table } from 'dexie';
import {
  createInitialBootstrapState,
  type BootstrapState
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

function normalizePersistedState(
  persisted: BootstrapState
): BootstrapState {
  if (persisted.normalWave !== undefined) {
    return persisted;
  }

  const current = createInitialBootstrapState(
    typeof persisted.bootId === 'string'
      ? persisted.bootId
      : 'migrated-bootstrap'
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
        : 0
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

import Dexie, { type Table } from 'dexie';
import type { BootstrapState } from '../core/state';
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

export class DexieBootstrapPersistence
  implements BootstrapPersistence {
  private readonly db = new ResortBootstrapDatabase();

  async load(): Promise<BootstrapState | null> {
    const record = await this.db.bootstrap.get('singleton');
    return record?.state ?? null;
  }

  async save(state: BootstrapState): Promise<void> {
    await this.db.bootstrap.put({
      id: 'singleton',
      state
    });
  }
}

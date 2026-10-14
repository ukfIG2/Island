import type { BootstrapState } from '../core/state';

export interface BootstrapPersistence {
  load(): Promise<BootstrapState | null>;
  save(state: BootstrapState): Promise<void>;
}

import type { BootstrapCore } from '../core/runtime';
import type { BootstrapState } from '../core/state';
import type { SimulationClock } from '../runtime/SimulationClock';

export interface RrhDevFacade {
  health(): Readonly<{
    schema: 'rrh-dev-health/v1';
    ok: true;
    simulationRunning: boolean;
    simulationPeriodMs: number;
  }>;

  snapshot(): BootstrapState;
}

declare global {
  var __RRH_DEV__: RrhDevFacade | undefined;
}

export function installDevFacade(
  core: BootstrapCore,
  clock: SimulationClock
): RrhDevFacade {
  const facade: RrhDevFacade = Object.freeze({
    health: () => {
      const status = clock.status();

      return Object.freeze({
        schema: 'rrh-dev-health/v1' as const,
        ok: true as const,
        simulationRunning: status.running,
        simulationPeriodMs: status.periodMs
      });
    },

    snapshot: () =>
      Object.freeze({
        ...core.getSnapshot()
      })
  });

  Object.defineProperty(globalThis, '__RRH_DEV__', {
    value: facade,
    writable: false,
    enumerable: false,
    configurable: true
  });

  return facade;
}

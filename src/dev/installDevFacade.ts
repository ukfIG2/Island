import type {
  BootstrapCore
} from '../core/runtime';

import type {
  BootstrapState
} from '../core/state';

import {
  type DebugEvent,
  DebugRingBufferSink
} from '../debug/DebugTransport';

import type {
  SimulationClock
} from '../runtime/SimulationClock';

export interface RrhDevFacade {
  health(): Readonly<{
    schema:
      'rrh-dev-health/v1';

    ok:
      true;

    simulationRunning:
      boolean;

    simulationPeriodMs:
      number;
  }>;

  snapshot():
    BootstrapState;

  eventCount():
    number;

  events():
    readonly DebugEvent[];
}

declare global {
  var __RRH_DEV__:
    RrhDevFacade |
    undefined;
}

export function installDevFacade(
  core:
    BootstrapCore,

  clock:
    SimulationClock,

  eventSink:
    DebugRingBufferSink
): RrhDevFacade {
  const facade:
    RrhDevFacade =
      Object.freeze({
        health: () => {
          const status =
            clock.status();

          return Object.freeze({
            schema:
              'rrh-dev-health/v1' as const,

            ok:
              true as const,

            simulationRunning:
              status.running,

            simulationPeriodMs:
              status.periodMs
          });
        },

        snapshot: () =>
          Object.freeze({
            ...core.getSnapshot()
          }),

        eventCount: () =>
          eventSink.size(),

        events: () =>
          eventSink.snapshot()
      });

  Object.defineProperty(
    globalThis,
    '__RRH_DEV__',
    {
      value: facade,
      writable: false,
      enumerable: false,
      configurable: true
    }
  );

  return facade;
}

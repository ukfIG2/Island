import {
  StrictMode
} from 'react';

import {
  createRoot
} from 'react-dom/client';

import {
  App
} from './app/App';

import './app/styles.css';

import {
  BootstrapCore,
  type BootstrapDebugEvents
} from './core/runtime';

import {
  createInitialBootstrapState
} from './core/state';

import {
  DebugRingBufferSink,
  DebugTransport
} from './debug/DebugTransport';

import {
  installDevFacade
} from './dev/installDevFacade';

import {
  DexieBootstrapPersistence
} from './persistence/DexieBootstrapPersistence';

import {
  SimulationClock
} from './runtime/SimulationClock';

async function boot(): Promise<void> {
  const persistence = new DexieBootstrapPersistence();
  const capacityUpgradeProof =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('proof') === 'capacity-upgrade';

  const restored = capacityUpgradeProof
    ? null
    : await persistence
        .load()
        .catch(() => null);

  const initial = capacityUpgradeProof
    ? createInitialBootstrapState(
        'capacity-upgrade-browser-proof',
        {
          totalDemand: 6,
          releasePerTick: 3,
          baseServiceCapacity: { reception: 10, food: 1 },
          queuePressurePerLostStar: 4
        }
      )
    : restored ??
      createInitialBootstrapState(
        crypto.randomUUID()
      );

  const debugEvents = new DebugRingBufferSink(64);

  const enabledDebugCategories: Array<keyof BootstrapDebugEvents> =
    import.meta.env.DEV
      ? ['core.transition']
      : [];

  const debug = new DebugTransport<BootstrapDebugEvents>({
    enabledCategories: enabledDebugCategories,
    sinks: [debugEvents]
  });

  const core = new BootstrapCore(initial, debug);

  // Prototype interaction cadence only; gameplay semantics remain delta-driven
  // in the renderer-independent core and are not coupled to Pixi rendering.
  const simulationClock = new SimulationClock(core, 1000);

  simulationClock.start();

  installDevFacade(
    core,
    simulationClock,
    debugEvents
  );

  window.addEventListener(
    'pagehide',
    () => {
      simulationClock.stop();

      if (!capacityUpgradeProof) {
        void persistence
          .save(core.getSnapshot())
          .catch(() => undefined);
      }
    },
    { once: true }
  );

  const root = document.getElementById('root');

  if (root === null) {
    throw new Error('ROOT_ELEMENT_MISSING');
  }

  createRoot(root).render(
    <StrictMode>
      <App core={core} />
    </StrictMode>
  );
}

void boot();

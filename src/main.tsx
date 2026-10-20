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
  createInitialBootstrapState,
  enableMvpProgression,
  PROTOTYPE_ECONOMY_PROOF_TUNING
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

import {
  consumePrototypeComebackEligibility,
  recordPrototypeInactivity
} from './runtime/PrototypeInactivity';

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
          baseServiceCapacity: { reception: 10, food: 1, drinks: 10, relax: 10, oceanView: 10 },
          queuePressurePerLostStar: 4
        }
      )
    : restored ??
      createInitialBootstrapState(
        crypto.randomUUID()
      );

  const liveInitial = capacityUpgradeProof ? initial : enableMvpProgression(initial);
  const debugEvents = new DebugRingBufferSink(64);

  const enabledDebugCategories: Array<keyof BootstrapDebugEvents> =
    import.meta.env.DEV
      ? ['core.transition']
      : [];

  const debug = new DebugTransport<BootstrapDebugEvents>({
    enabledCategories: enabledDebugCategories,
    sinks: [debugEvents]
  });

  const core = new BootstrapCore(liveInitial, debug);

  const claimComebackReward = (): boolean => {
    if (capacityUpgradeProof || !consumePrototypeComebackEligibility(window.localStorage, Date.now())) return false;
    core.dispatch({ type: 'CLAIM_COMEBACK_REWARD' });
    return true;
  };

  const comebackRewardGranted = document.visibilityState === 'visible' && claimComebackReward();

  // Prototype interaction cadence only; gameplay semantics remain delta-driven
  // in the renderer-independent core and are not coupled to Pixi rendering.
  const simulationClock = new SimulationClock(core, 1000);

  if (document.visibilityState === 'visible') {
    simulationClock.start();
  }

  installDevFacade(
    core,
    simulationClock,
    debugEvents
  );

  const persistSnapshot = (): void => {
    if (!capacityUpgradeProof) {
      void persistence.save(core.getSnapshot()).catch(() => undefined);
    }
  };

  const startNewResort = async (): Promise<void> => {
    if (capacityUpgradeProof) return;

    const fresh = createInitialBootstrapState(crypto.randomUUID(), undefined, 'mvp');
    simulationClock.stop();

    try {
      await persistence.save(fresh);
      core.replaceState(fresh);
    } finally {
      if (document.visibilityState === 'visible') {
        simulationClock.start();
      }
    }
  };

  const handleVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') {
      simulationClock.stop();
      if (!capacityUpgradeProof) recordPrototypeInactivity(window.localStorage, Date.now());
      persistSnapshot();
      return;
    }

    if (claimComebackReward()) {
      window.dispatchEvent(new CustomEvent<number>('resort-empire:comeback-reward', { detail: PROTOTYPE_ECONOMY_PROOF_TUNING.comebackRewardCoins }));
    }
    simulationClock.start();
  };

  document.addEventListener('visibilitychange', handleVisibilityChange);

  window.addEventListener(
    'pagehide',
    () => {
      simulationClock.stop();
      if (!capacityUpgradeProof) recordPrototypeInactivity(window.localStorage, Date.now());
      persistSnapshot();
    },
    { once: true }
  );

  const root = document.getElementById('root');

  if (root === null) {
    throw new Error('ROOT_ELEMENT_MISSING');
  }

  createRoot(root).render(
    <StrictMode>
      <App
        core={core}
        comebackRewardCoins={comebackRewardGranted ? PROTOTYPE_ECONOMY_PROOF_TUNING.comebackRewardCoins : 0}
        onNewResort={startNewResort}
      />
    </StrictMode>
  );
}

void boot();

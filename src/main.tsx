import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './app/styles.css';
import { BootstrapCore } from './core/runtime';
import { createInitialBootstrapState } from './core/state';
import { installDevFacade } from './dev/installDevFacade';
import { DexieBootstrapPersistence } from './persistence/DexieBootstrapPersistence';
import { SimulationClock } from './runtime/SimulationClock';

async function boot(): Promise<void> {
  const persistence = new DexieBootstrapPersistence();

  const restored = await persistence
    .load()
    .catch(() => null);

  const initial =
    restored ??
    createInitialBootstrapState(
      crypto.randomUUID()
    );

  const core = new BootstrapCore(initial);
  const simulationClock = new SimulationClock(core, 200);

  simulationClock.start();
  installDevFacade(core, simulationClock);

  window.addEventListener(
    'pagehide',
    () => {
      simulationClock.stop();

      void persistence
        .save(core.getSnapshot())
        .catch(() => undefined);
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

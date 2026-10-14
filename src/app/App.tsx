import {
  useEffect,
  useRef,
  useSyncExternalStore
} from 'react';
import type { BootstrapCore } from '../core/runtime';
import { PixiProjection } from '../render/PixiProjection';

export interface AppProps {
  core: BootstrapCore;
}

export function App({ core }: AppProps) {
  const snapshot = useSyncExternalStore(
    core.subscribe,
    core.getSnapshot,
    core.getSnapshot
  );

  const worldHost = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = worldHost.current;

    if (host === null) {
      return;
    }

    const projection = new PixiProjection();

    void projection.mount(host, core.getSnapshot);

    return () => {
      projection.destroy();
    };
  }, [core]);

  return (
    <main className="shell">
      <section className="shell__panel">
        <p className="shell__eyebrow">Resort Empire</p>
        <h1>Bootstrap shell</h1>
        <p>
          Architecture boundary proof only. No gameplay has
          been implemented.
        </p>

        <dl className="shell__facts">
          <div>
            <dt>Core authority</dt>
            <dd>Pure TypeScript</dd>
          </div>
          <div>
            <dt>Simulation tick</dt>
            <dd>{snapshot.simulationTick}</dd>
          </div>
          <div>
            <dt>Elapsed simulation</dt>
            <dd>{snapshot.elapsedSimulationMs} ms</dd>
          </div>
        </dl>
      </section>

      <section className="shell__world">
        <div ref={worldHost} className="shell__pixi" />
      </section>
    </main>
  );
}

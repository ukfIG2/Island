import { normalWaveUpgradeQuote } from '../core/state';
import {
  useEffect,
  useRef,
  useSyncExternalStore
} from 'react';

import type { BootstrapCore } from '../core/runtime';
import {
  NORMAL_WAVE_NEEDS,
  NORMAL_WAVE_PROOF_WORKER_ID,
  normalWaveServiceCapacity,
  type NormalWaveNeedId
} from '../core/state';
import { PixiProjection } from '../render/PixiProjection';

export interface AppProps {
  core: BootstrapCore;
}

function labelNeed(need: NormalWaveNeedId): string {
  return need === 'reception' ? 'Reception' : 'Food';
}

export function App({ core }: AppProps) {
  const snapshot = useSyncExternalStore(
    core.subscribe,
    core.getSnapshot,
    core.getSnapshot
  );

  const worldHost = useRef<HTMLDivElement | null>(null);
  const wave = snapshot.normalWave;
  const upgradeQuote = wave.result ? normalWaveUpgradeQuote(snapshot, wave.result.bottleneckNeed) : null;
  const workerNeed = wave.workerAssignments[NORMAL_WAVE_PROOF_WORKER_ID];
  const reassignmentTarget: NormalWaveNeedId =
    workerNeed === 'reception' ? 'food' : 'reception';
  const canReassign =
    wave.phase === 'awaiting' ||
    wave.phase === 'incoming' ||
    wave.phase === 'draining';
  const currentQueue = NORMAL_WAVE_NEEDS.reduce(
    (sum, need) => sum + wave.queueByNeed[need],
    0
  );
  const currentActive = NORMAL_WAVE_NEEDS.reduce(
    (sum, need) => sum + wave.activeByNeed[need],
    0
  );

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
        <p className="shell__eyebrow">Resort Empire · Prototype</p>
        <h1>Normal wave</h1>
        <p>Coins: {snapshot.coins} · Resort Value: {snapshot.resortValue}</p>
        <p className="shell__intro">
          Prepare the Worker before the wave or move them while guests are arriving.
          Waiting guests and guests in active service are separate core states.
        </p>

        <div className="shell__actions">
          <button
            type="button"
            onClick={() => core.dispatch({ type: 'START_WAVE' })}
            disabled={wave.phase !== 'awaiting'}
          >
            Start wave
          </button>

          <button
            type="button"
            onClick={() => core.dispatch({
              type: 'REASSIGN_WORKER',
              workerId: NORMAL_WAVE_PROOF_WORKER_ID,
              to: reassignmentTarget
            })}
            disabled={!canReassign}
          >
            Move Worker to {labelNeed(reassignmentTarget)}
          </button>

          {wave.phase === 'complete' ? (
            <button
              type="button"
              onClick={() => core.dispatch({ type: 'CONTINUE_TO_NEXT_WAVE' })}
            >
              Continue to next wave
            </button>
          ) : null}
        </div>

        <dl className="shell__facts">
          <div>
            <dt>Wave phase</dt>
            <dd>{wave.phase}</dd>
          </div>
          <div>
            <dt>Demand released</dt>
            <dd>{wave.releasedDemand} / {wave.tuning.totalDemand}</dd>
          </div>
          <div>
            <dt>Guests waiting now</dt>
            <dd>{currentQueue}</dd>
          </div>
          <div>
            <dt>Guests in service</dt>
            <dd>{currentActive}</dd>
          </div>
          <div>
            <dt>Worker assignment</dt>
            <dd>{labelNeed(workerNeed)}</dd>
          </div>
        </dl>

        <div className="shell__services" aria-label="Service status">
          {NORMAL_WAVE_NEEDS.map((need) => (
            <article className="service-card" key={need}>
              <div className="service-card__heading">
                <strong>{labelNeed(need)}</strong>
                {workerNeed === need ? <span>Worker here</span> : null}
              </div>
              <dl>
                <div>
                  <dt>Waiting</dt>
                  <dd>{wave.queueByNeed[need]}</dd>
                </div>
                <div>
                  <dt>Active service</dt>
                  <dd>{wave.activeByNeed[need]}</dd>
                </div>
                <div>
                  <dt>Capacity / tick</dt>
                  <dd>{normalWaveServiceCapacity(snapshot, need)}</dd>
                </div>
                <div>
                  <dt>Served</dt>
                  <dd>{wave.servedByNeed[need]}</dd>
                </div>
                <div>
                  <dt>Peak queue</dt>
                  <dd>{wave.peakQueueByNeed[need]}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        {wave.result !== null ? (
          <section className="result-card" aria-live="polite">
            <p className="shell__eyebrow">Wave result</p>
            <h2>{wave.result.rating}★</h2>
            <p>
              Bottleneck: {labelNeed(wave.result.bottleneckNeed)} · cause:{' '}
              {wave.result.bottleneckCause}
            </p>
            <p>{wave.result.guidance}</p>
              {upgradeQuote && (
                <section aria-label="Upgrade suggestion">
                  <strong>Upgrade suggestion</strong>
                  <p>{labelNeed(upgradeQuote.need)} Lv{upgradeQuote.fromLevel} → Lv{upgradeQuote.toLevel}</p>
                  <p>Capacity {upgradeQuote.beforeCapacity} → {upgradeQuote.afterCapacity}</p>
                  <p>Price: {upgradeQuote.coinCost} Coins · Resort Value +{upgradeQuote.resortValueGain}</p>
                  <button
                    type="button"
                    disabled={snapshot.coins < upgradeQuote.coinCost}
                    onClick={() => core.dispatch({ type: 'UPGRADE_BUILDING', need: upgradeQuote.need })}
                  >
                    Upgrade {labelNeed(upgradeQuote.need)}
                  </button>
                </section>
              )}
            <ul>
              {wave.result.explanation.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>
        ) : null}
      </section>

      <section className="shell__world" aria-label="Resort world projection">
        <div ref={worldHost} className="shell__pixi" />
      </section>
    </main>
  );
}

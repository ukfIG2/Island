import { normalWaveForecast, normalWaveUpgradeQuote, prototypeAreaUnlockView } from '../core/state';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore
} from 'react';

import type { BootstrapCore } from '../core/runtime';
import {
  NORMAL_SERVICE_CATALOG,
  PROTOTYPE_AREA_IDS,
  type NormalWaveNeedId,
  type NormalWaveWorkerId
} from '../core/state';
import { PixiProjection } from '../render/PixiProjection';

export interface AppProps {
  core: BootstrapCore;
  comebackRewardCoins?: number;
}

function labelNeed(need: NormalWaveNeedId): string {
  const service = NORMAL_SERVICE_CATALOG[need];
  return `${service.buildingLabel} · ${service.needLabel}`;
}


export function App({ core, comebackRewardCoins = 0 }: AppProps) {
  const snapshot = useSyncExternalStore(
    core.subscribe,
    core.getSnapshot,
    core.getSnapshot
  );

  const worldHost = useRef<HTMLDivElement | null>(null);
  const [workerSheetOpen, setWorkerSheetOpen] = useState(false);
  const [visibleComebackReward, setVisibleComebackReward] = useState(comebackRewardCoins);

  useEffect(() => {
    setVisibleComebackReward(comebackRewardCoins);
    const handleComebackReward = (event: Event): void => {
      const coins = (event as CustomEvent<number>).detail;
      if (Number.isFinite(coins) && coins > 0) setVisibleComebackReward(coins);
    };
    window.addEventListener('resort-empire:comeback-reward', handleComebackReward);
    return () => window.removeEventListener('resort-empire:comeback-reward', handleComebackReward);
  }, [comebackRewardCoins]);
  const wave = snapshot.normalWave;
  const upgradeQuote = wave.result ? normalWaveUpgradeQuote(snapshot, wave.result.bottleneckNeed) : null;
  const workers = Object.entries(wave.workerAssignments).filter(
    (entry): entry is [NormalWaveWorkerId, NormalWaveNeedId] => entry[1] !== undefined
  );
  const areaUnlocks = PROTOTYPE_AREA_IDS.map(areaId => prototypeAreaUnlockView(snapshot, areaId));
  const forecast = normalWaveForecast(snapshot);
  const canReassign =
    wave.phase === 'awaiting' ||
    wave.phase === 'incoming' ||
    wave.phase === 'draining';
  const currentQueue = wave.activeNeedIds.reduce(
    (sum, need) => sum + wave.queueByNeed[need],
    0
  );
  const currentActive = wave.activeNeedIds.reduce(
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
        <header className="hud-top">
          <div className="hud-brand">
            <p className="shell__eyebrow">Resort Empire</p>
            <h1>Normal wave</h1>
            <p className="hud-economy">Coins: {snapshot.coins} | Energy: {snapshot.energy} | Resort Value: {snapshot.resortValue}</p>
          </div>

          <div className="shell__actions">
        {wave.phase === 'awaiting' ? (
              <button className="hud-primary-action" type="button" onClick={() => core.dispatch({ type: 'START_WAVE' })}>
                Start wave
              </button>
            ) : null}

            {wave.phase === 'complete' ? (
              <button className="hud-primary-action" type="button" onClick={() => core.dispatch({ type: 'CONTINUE_TO_NEXT_WAVE' })}>
                Continue to next wave
              </button>
            ) : null}

            {canReassign ? (
              <button
                type="button"
                className={wave.phase === 'incoming' || wave.phase === 'draining' ? 'hud-primary-action' : 'hud-secondary-action'}
                onClick={() => setWorkerSheetOpen(true)}
              >
                Manage workers
              </button>
            ) : null}
          </div>
        </header>

        {visibleComebackReward > 0 ? (
          <section className="comeback-notice" aria-live="polite" aria-label="Welcome back reward">
            <strong>Welcome back</strong>
            <span>Your resort stayed exactly as you left it.</span>
            <span>Comeback reward: +{visibleComebackReward} Coins</span>
          </section>
        ) : null}

        <aside className="hud-context-tray" aria-label="Resort actions">
        <section className="wave-needs" aria-label="Wave needs">
          <span className="wave-needs__label">Wave needs</span>
          <div className="wave-needs__items">
            {wave.activeNeedIds.map((need) => (
              <span className={'wave-need' + (wave.debutNeedIds.includes(need) ? ' wave-need--new' : '')} key={need}>
                <strong>{NORMAL_SERVICE_CATALOG[need].needLabel}</strong>
                <small>{wave.queueByNeed[need]} waiting</small>
              </span>
            ))}
          </div>
        </section>

        {wave.phase === 'incoming' || wave.phase === 'draining' ? (
          <section className="energy-actions" aria-label="Energy boost">
            <span className="wave-needs__label">Energy boost</span>
            <div className="energy-actions__buttons">
              {wave.activeNeedIds.map((need) => (
                <button
                  key={need}
                  type="button"
                  disabled={snapshot.energy <= 0 || wave.energyMode !== null}
                  onClick={() => core.dispatch({ type: 'ACTIVATE_ENERGY_MODE', need })}
                >
                  Boost {NORMAL_SERVICE_CATALOG[need].buildingLabel}
                </button>
              ))}
            </div>
            <small>
              {wave.energyMode !== null
                ? `Speed boost active: ${NORMAL_SERVICE_CATALOG[wave.energyMode.need].buildingLabel} · ${wave.energyMode.ticksRemaining} ticks left`
                : 'Temporary service-speed boost; simultaneous capacity does not change.'}
            </small>
          </section>
        ) : null}

        {wave.suddenRush.triggered ? (
          <section className="rush-alert" aria-live="polite">
            <strong>Sudden Rush</strong>
            <span>Extra demand +{wave.suddenRush.extraDemand}; the normal wave keeps running.</span>
          </section>
        ) : null}

        {wave.phase === 'awaiting' ? (
          <section aria-label="Wave forecast">
            <p className="shell__eyebrow">Wave {forecast.waveNumber} of {forecast.totalWaves} forecast</p>
            <p>Expected needs: {forecast.needs.map(labelNeed).join(' · ')}</p>
            <p>Expected demand: {forecast.totalDemand} guests</p>
          </section>
        ) : null}

        {wave.phase === 'awaiting' || wave.phase === 'complete' ? (
          <section aria-label="Area unlocks">
            <p className="shell__eyebrow">Area unlocks</p>
            <div className="shell__services">
              {areaUnlocks.map((unlock) => (
                <article className="service-card" key={unlock.areaId}>
                  <div className="service-card__heading">
                    <strong>{unlock.buildingLabel} · {NORMAL_SERVICE_CATALOG[unlock.need].needLabel}</strong>
                    <span>{unlock.status}</span>
                  </div>
                  <p>Eligible after Wave {unlock.eligibilityAfterWave}</p>
                  <p>{unlock.coinCost} Coins · includes {unlock.includedWorkerId}</p>
                  <button
                    type="button"
                    onClick={() => core.dispatch({ type: 'PURCHASE_AREA', areaId: unlock.areaId })}
                    disabled={unlock.status !== 'available'}
                  >
                    Unlock {unlock.buildingLabel}
                  </button>
                </article>
              ))}
            </div>
          </section>
        ) : null}

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
        </aside>

        {workerSheetOpen ? (
          <div className="worker-sheet__backdrop" role="presentation" onClick={() => setWorkerSheetOpen(false)}>
            <section className="worker-sheet" role="dialog" aria-modal="true" aria-label="Worker Allocation" onClick={(event) => event.stopPropagation()}>
              <header className="worker-sheet__header">
                <div><p className="shell__eyebrow">Worker Allocation</p><h2>Move a worker</h2></div>
                <button type="button" onClick={() => setWorkerSheetOpen(false)}>Close</button>
              </header>
              <div className="worker-sheet__workers">
                {workers.map(([workerId, workerNeed]) => (
                  <article className="worker-row" key={workerId}>
                    <div><strong>{workerId}</strong><small>At {NORMAL_SERVICE_CATALOG[workerNeed].buildingLabel}</small></div>
                    <div className="worker-row__destinations">
                      {wave.activeNeedIds.filter((need) => need !== workerNeed).map((need) => (
                        <button type="button" key={need} onClick={() => { core.dispatch({ type: 'REASSIGN_WORKER', workerId, to: need }); setWorkerSheetOpen(false); }}>
                          {NORMAL_SERVICE_CATALOG[need].buildingLabel}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : null}

      </section>

      <section className="shell__world" aria-label="Resort world projection">
        <div ref={worldHost} className="shell__pixi" />
      </section>
    </main>
  );
}

import { normalWaveForecast, normalWaveServiceCapacity, normalWaveUpgradeQuote, prototypeAreaUnlockView } from '../core/state';
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore
} from 'react';

import type { BootstrapCore } from '../core/runtime';
import {
  NORMAL_SERVICE_CATALOG,
  NORMAL_SERVICE_IDS,
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
  const [selectedNeed, setSelectedNeed] = useState<NormalWaveNeedId>('reception');
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

  useEffect(() => {
    if (visibleComebackReward <= 0) return;
    const timeout = window.setTimeout(() => setVisibleComebackReward(0), 3600);
    return () => window.clearTimeout(timeout);
  }, [visibleComebackReward]);

  const wave = snapshot.normalWave;
  const upgradeQuote = wave.result ? normalWaveUpgradeQuote(snapshot, wave.result.bottleneckNeed) : null;
  const workers = Object.entries(wave.workerAssignments).filter(
    (entry): entry is [NormalWaveWorkerId, NormalWaveNeedId] => entry[1] !== undefined
  );
  const areaUnlocks = PROTOTYPE_AREA_IDS.map(areaId => prototypeAreaUnlockView(snapshot, areaId));
  const forecast = normalWaveForecast(snapshot);
  const finalWaveComplete = wave.phase === 'complete' && forecast.waveNumber === forecast.totalWaves;
  const selectedUnlock = areaUnlocks.find((unlock) => unlock.need === selectedNeed) ?? null;
  const selectedWorkers = workers.filter(([, need]) => need === selectedNeed).map(([workerId]) => workerId);
  const selectedCapacity = normalWaveServiceCapacity(snapshot, selectedNeed);
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
    if (wave.result !== null) setSelectedNeed(wave.result.bottleneckNeed);
  }, [wave.result?.bottleneckNeed]);

  useEffect(() => {
    const host = worldHost.current;

    if (host === null) {
      return;
    }

    const projection = new PixiProjection();

    void projection.mount(host, core.getSnapshot, setSelectedNeed);

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
            <h1>Wave {forecast.waveNumber}</h1>
            <p className="hud-economy">Coins: {snapshot.coins} | Energy: {snapshot.energy} | Resort Value: {snapshot.resortValue}</p>
          </div>

          <div className="shell__actions">
        {wave.phase === 'awaiting' ? (
              <button className="hud-primary-action" type="button" onClick={() => core.dispatch({ type: 'START_WAVE' })}>
                Start wave
              </button>
            ) : null}

            {wave.phase === 'complete' && !finalWaveComplete ? (
              <button className="hud-primary-action" type="button" onClick={() => core.dispatch({ type: 'CONTINUE_TO_NEXT_WAVE' })}>
                Continue to next wave
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

        <nav className="world-status" aria-label="Resort buildings">
          {NORMAL_SERVICE_IDS.filter((need) => need !== 'relax' && need !== 'oceanView' || need === 'relax' && snapshot.purchasedAreas.pool || need === 'oceanView' && snapshot.purchasedAreas.bungalows).map((need) => (
            <button
              type="button"
              key={need}
              className={'world-status__building' + (selectedNeed === need ? ' is-selected' : '') + (wave.queueByNeed[need] > 0 ? ' has-pressure' : '')}
              onClick={() => setSelectedNeed(need)}
            >
              <strong>{NORMAL_SERVICE_CATALOG[need].buildingLabel}</strong>
              <span>{wave.queueByNeed[need] > 0 ? wave.queueByNeed[need] + ' waiting' : 'Flowing'}</span>
            </button>
          ))}
        </nav>

        {wave.phase === 'incoming' || wave.phase === 'draining' ? (
          <section className={'wave-live-banner wave-live-banner--' + wave.phase} aria-live="polite">
            <span>{wave.phase === 'incoming' ? 'Guests arriving' : 'Resort in motion'}</span>
            <strong>{currentQueue > 0 ? currentQueue + ' waiting' : currentActive > 0 ? currentActive + ' being served' : 'Everything is flowing'}</strong>
          </section>
        ) : null}

        {wave.phase === 'awaiting' ? (
          <section className="phase-card" aria-label="Next wave">
            <span>Wave {forecast.waveNumber} / {forecast.totalWaves}</span>
            <strong>{forecast.totalDemand} guests incoming</strong>
            <small>{forecast.needs.map((need) => NORMAL_SERVICE_CATALOG[need].needLabel).join(' · ')}</small>
          </section>
        ) : null}

        {wave.suddenRush.triggered ? (
          <section className="world-event world-event--rush" aria-live="polite"><strong>Sudden Rush</strong><span>+{wave.suddenRush.extraDemand} guests</span></section>
        ) : null}

        {areaUnlocks.some((unlock) => unlock.status === 'available') && (wave.phase === 'awaiting' || wave.phase === 'complete') ? (
          <section className="unlock-ribbon" aria-label="New resort area">
            <span>New area available</span>
            {areaUnlocks.filter((unlock) => unlock.status === 'available').map((unlock) => (
              <button key={unlock.areaId} type="button" onClick={() => { setSelectedNeed(unlock.need); core.dispatch({ type: 'PURCHASE_AREA', areaId: unlock.areaId }); }}>Open {unlock.buildingLabel} · {unlock.coinCost} Coins</button>
            ))}
          </section>
        ) : null}

        {wave.result !== null ? (
          <section className={'wave-result-toast' + (finalWaveComplete ? ' wave-result-toast--final' : '')} aria-live="polite">
            <span>{finalWaveComplete ? 'Resort complete' : 'Wave complete'}</span><strong>{wave.result.rating}★</strong>
            <p>{finalWaveComplete ? forecast.totalWaves + '/' + forecast.totalWaves + ' waves cleared · final pressure: ' + NORMAL_SERVICE_CATALOG[wave.result.bottleneckNeed].buildingLabel : NORMAL_SERVICE_CATALOG[wave.result.bottleneckNeed].buildingLabel + ' needs attention'}</p>
          </section>
        ) : null}

        <aside className="context-card" aria-label="Selected building actions">
          <div className="context-card__heading">
            <div><span>{NORMAL_SERVICE_CATALOG[selectedNeed].needLabel}</span><h2>{NORMAL_SERVICE_CATALOG[selectedNeed].buildingLabel}</h2></div>
            <strong>{selectedCapacity}/tick</strong>
          </div>
          <div className="context-card__stats">
            <span><b>{wave.queueByNeed[selectedNeed]}</b> waiting</span>
            <span><b>Lv.{wave.buildingLevelsByNeed[selectedNeed]}</b> building</span>
            <span><b>{selectedWorkers.length}</b> worker{selectedWorkers.length === 1 ? '' : 's'}</span>
          </div>
          {wave.result?.bottleneckNeed === selectedNeed ? <p className="context-card__guidance">{wave.result.guidance}</p> : null}
          <div className="context-card__actions">
            {canReassign ? <button type="button" onClick={() => setWorkerSheetOpen(true)}>Move worker</button> : null}
            {(wave.phase === 'incoming' || wave.phase === 'draining') && wave.activeNeedIds.includes(selectedNeed) ? <button type="button" disabled={snapshot.energy <= 0 || wave.energyMode !== null} onClick={() => core.dispatch({ type: 'ACTIVATE_ENERGY_MODE', need: selectedNeed })}>{wave.energyMode?.need === selectedNeed ? 'Boost active' : 'Boost · 1 Energy'}</button> : null}
            {upgradeQuote?.need === selectedNeed ? <button type="button" disabled={snapshot.coins < upgradeQuote.coinCost} onClick={() => core.dispatch({ type: 'UPGRADE_BUILDING', need: selectedNeed })}>Upgrade · {upgradeQuote.coinCost} Coins</button> : null}
            {selectedUnlock?.status === 'available' ? <button type="button" onClick={() => core.dispatch({ type: 'PURCHASE_AREA', areaId: selectedUnlock.areaId })}>Open area · {selectedUnlock.coinCost} Coins</button> : null}
          </div>
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

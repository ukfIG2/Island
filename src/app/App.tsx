import { normalWaveBuildingQualityBonus, normalWaveEnergyModeAvailable, normalWaveCoinReward, normalWaveForecast, normalWaveServiceCapacity, normalWaveUpgradeQuote, PROTOTYPE_ENERGY_PROOF_TUNING, prototypeAreaUnlockView,
  normalNeedOperationalState,
  normalNeedBottleneckCause,
  MVP_MANAGER_CATALOG,
  MVP_SPECIALIST_CATALOG,
  MVP_SPECIALIST_PROOF_TUNING,
MVP_VIP_MATERIALS_PROVISIONAL,
  type MvpSpecialistId,
  MVP_WORKER_PROOF_TUNING,
  normalWaveCanHireWorker,
  MVP_MANAGER_PROOF_TUNING
} from '../core/state';
import {
  useEffect,
  useState,
  useSyncExternalStore
} from 'react';

import { MVP_VIP_CATALOG, MVP_VIP_PROVISIONAL_TIMING, MVP_VIP_TYPES, mvpVipAttainableQualityCeiling, deriveMvpVipRequestCards } from '../core/vipLayer';
import { mvpVipSpeedUpAvailable, MVP_VIP_SPEED_UP_PROVISIONAL } from '../core/state';
import { mvpVipSpaPurchaseAvailable, MVP_VIP_SPA_PROVISIONAL } from '../core/state';
import { deriveMvpVipPreviewInfo } from '../core/vipPreview';
import type { BootstrapCore } from '../core/runtime';
import {
  NORMAL_SERVICE_CATALOG,
  NORMAL_SERVICE_IDS,
  PROTOTYPE_AREA_IDS,
  type NormalWaveNeedId,
  type NormalWaveWorkerId
} from '../core/state';
import { ResortWorld3D } from '../render/ResortWorld3D';
import { WaveCompletionSummary } from './WaveCompletionSummary';
import { InvestmentRecommendation } from './InvestmentRecommendation';

export interface AppProps {
  core: BootstrapCore;
  comebackRewardCoins?: number;
  onNewResort: () => Promise<void>;
}

function labelNeed(need: NormalWaveNeedId): string {
  const service = NORMAL_SERVICE_CATALOG[need];
  return `${service.buildingLabel} / ${service.needLabel}`;
}


export function App({ core, comebackRewardCoins = 0, onNewResort }: AppProps) {
  const snapshot = useSyncExternalStore(
    core.subscribe,
    core.getSnapshot,
    core.getSnapshot
  );
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
  const upgradeQuote = wave.result ? normalWaveUpgradeQuote(snapshot, selectedNeed) : null;
  const workers = Object.entries(wave.workerAssignments).filter(
    (entry): entry is [NormalWaveWorkerId, NormalWaveNeedId] => entry[1] !== undefined
  );
  const areaUnlocks = PROTOTYPE_AREA_IDS.map(areaId => prototypeAreaUnlockView(snapshot, areaId));
  const forecast = normalWaveForecast(snapshot);
  const finalWaveComplete = wave.phase === 'complete' && forecast.waveNumber === forecast.totalWaves;
  const selectedUnlock = areaUnlocks.find((unlock) => unlock.need === selectedNeed) ?? null;
  const selectedWorkers = workers.filter(([, need]) => need === selectedNeed).map(([workerId]) => workerId);
  const selectedCapacity = normalWaveServiceCapacity(snapshot, selectedNeed);
  const vipPreviewInfo = snapshot.vipLayer.preview === null ? null : deriveMvpVipPreviewInfo(snapshot, snapshot.vipLayer.preview);
  const managerHired = wave.hiredManagers[selectedNeed] === true;
  const canHireManager = (wave.phase === 'awaiting' || wave.phase === 'complete') && wave.activeNeedIds.includes(selectedNeed);
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
    setSelectedNeed('reception');
    setWorkerSheetOpen(false);
    setVisibleComebackReward(0);
  }, [snapshot.bootId]);


  return (
    <main className="shell">
      <section className="shell__panel">
        <header className="hud-top">
          <div className="hud-brand">
            <p className="shell__eyebrow">Resort Empire</p>
            <h1>Wave {forecast.waveNumber}</h1>
            <p className="hud-economy">Coins: {snapshot.coins} | Energy: {snapshot.energy} | Resort Value: {snapshot.resortValue}{snapshot.progressionStage === 'mvp' ? ' | Materials: ' + snapshot.materials + ' | Reputation: ' + snapshot.reputation : ''}</p>
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
              <span>{normalNeedOperationalState(snapshot, need)}{wave.queueByNeed[need] > 0 ? ' · ' + normalNeedBottleneckCause(snapshot, need)?.toUpperCase() : ''}</span>
            </button>
          ))}
        </nav>

        <section className={'phase-command phase-command--' + wave.phase} aria-live="polite">
          <div className="phase-command__copy">
            <span className="phase-command__eyebrow">{wave.phase === 'awaiting' ? 'Wave ' + forecast.waveNumber + ' ready' : wave.phase === 'complete' ? finalWaveComplete ? 'Resort complete' : 'Day complete' : wave.phase === 'incoming' ? 'Guests arriving' : 'Resort in motion'}</span>
            {wave.phase === 'awaiting' ? <>
              <strong>{forecast.totalDemand} guests incoming</strong>
              <small>Service load · {forecast.needs.map((need) => NORMAL_SERVICE_CATALOG[need].needLabel + ' ' + forecast.demandByNeed[need]).join(' · ')}</small>
              {forecast.waveNumber === 1 ? <small>Workers make a service faster; building level controls seats. Move workers before or during a wave.</small> : null}
            </> : wave.phase === 'incoming' || wave.phase === 'draining' ? <>
              <strong>{currentQueue > 0 ? currentQueue + ' waiting' : currentActive > 0 ? currentActive + ' being served' : 'Everything is flowing'}</strong>
              <small>Select a building to move workers or boost the current bottleneck.</small>
            </> : wave.result !== null ? <>
              <strong>{wave.result.rating}/5 · +{normalWaveCoinReward(wave)} Coins · +{PROTOTYPE_ENERGY_PROOF_TUNING.earnedPerCompletedWave} Energy</strong>
              <small>{finalWaveComplete ? forecast.totalWaves + '/' + forecast.totalWaves + ' waves cleared' : NORMAL_SERVICE_CATALOG[wave.result.bottleneckNeed].buildingLabel + ' was the bottleneck. Review an optional response or continue without buying.'}</small>
            </> : null}
          </div>
          <WaveCompletionSummary wave={wave} />
          <div className="phase-command__actions">
            {wave.phase === 'awaiting' ? <button className="hud-primary-action" type="button" onClick={() => core.dispatch({ type: 'START_WAVE' })}>Start wave</button> : null}
            {(wave.phase === 'awaiting' || wave.phase === 'complete') ? areaUnlocks.filter((unlock) => unlock.status === 'available').map((unlock) => <button className="phase-command__offer" key={unlock.areaId} type="button" onClick={() => { setSelectedNeed(unlock.need); core.dispatch({ type: 'PURCHASE_AREA', areaId: unlock.areaId }); }}><strong>Open {unlock.buildingLabel}</strong><small>New {NORMAL_SERVICE_CATALOG[unlock.need].needLabel} service + {unlock.includedWorkerId}</small><span>{unlock.coinCost} Coins</span></button>) : null}
            {wave.phase === 'complete' && !finalWaveComplete ? <button className="hud-primary-action" type="button" onClick={() => core.dispatch({ type: 'CONTINUE_TO_NEXT_WAVE' })}>Next wave</button> : null}
            {finalWaveComplete ? <button className="hud-primary-action" type="button" onClick={() => { void onNewResort(); }}>New resort</button> : null}
          </div>
        </section>

        {wave.suddenRush.triggered ? <section className="world-event world-event--rush" aria-live="polite"><strong>Sudden Rush</strong><span>+{wave.suddenRush.extraDemand} {wave.suddenRush.targetNeed ? NORMAL_SERVICE_CATALOG[wave.suddenRush.targetNeed].needLabel : 'need units'} — move a Worker or ignore</span></section> : null}

        {snapshot.progressionStage === 'mvp' ? (
          
        <section className="context-card" aria-label="VIP visits">
            <h2>VIP Visits</h2>
          <section className="context-card" aria-label="VIP Spa building">
            <h2>Spa · VIP Building</h2>
            <p>VIP-only facility; no normal guest-wave need or Worker slot.</p>
            <p role="status">Spa: {snapshot.vipBuildings.spa ? 'Built' : 'Not built'}</p>
            {!snapshot.vipBuildings.spa ? <button type="button" disabled={!mvpVipSpaPurchaseAvailable(snapshot)} onClick={() => core.dispatch({ type: 'PURCHASE_VIP_SPA' })}>Build Spa ({MVP_VIP_SPA_PROVISIONAL.coinCost} Coins · provisional)</button> : null}
          </section>
            <p>Optional VIP visits run alongside regular guest waves. They do not use normal Workers or interrupt service.</p>
            {snapshot.vipLayer.active !== null ? (
              <p role="status">{MVP_VIP_CATALOG[snapshot.vipLayer.active.type].label} visiting · {Math.min(100, Math.round(100 * snapshot.vipLayer.active.elapsedMs / MVP_VIP_PROVISIONAL_TIMING.visitDurationMs))}% complete</p>
            ) : <p>No VIP visit active.</p>}
            <p>Visits completed: {snapshot.vipLayer.completed.length}</p>
            {snapshot.vipLayer.active !== null ? <button type="button" disabled={!mvpVipSpeedUpAvailable(snapshot)} onClick={() => core.dispatch({ type: 'VIP_SPEED_UP' })}>Speed Up VIP (-{MVP_VIP_SPEED_UP_PROVISIONAL.energyCost} Energy, +{MVP_VIP_SPEED_UP_PROVISIONAL.advanceMs / 1000}s; provisional)</button> : null}
            <div aria-label="VIP request lifecycle">
              {deriveMvpVipRequestCards(snapshot.vipLayer).map(card => (
                <div className="progression-offer" key={card.key} aria-label={`${MVP_VIP_CATALOG[card.vipType].label} request ${card.status}`}>
                  <strong>{MVP_VIP_CATALOG[card.vipType].label}</strong>
                  <span>Request status: {card.status}</span>
                  {card.status === 'IN_PROGRESS' || card.status === 'COMPLETED' ? <span>Attainable quality ceiling: {card.attainableQualityCeiling === null ? 'Unknown (legacy evidence)' : `${card.attainableQualityCeiling} / 5 (provisional)`}</span> : null}
                </div>
              ))}
            </div>
            {snapshot.vipLayer.active !== null ? <p>Attainable VIP quality ceiling: {mvpVipAttainableQualityCeiling(snapshot.vipLayer.active.preparedness) ?? 'Unknown (legacy visit)'} / 5 (provisional; locked from prerequisites at visit start)</p> : null}
            {snapshot.lastVipReward !== null ? <p role="status">Latest VIP reward: +{snapshot.lastVipReward.reputation} Reputation ({MVP_VIP_CATALOG[snapshot.lastVipReward.vipType].label}; quality {snapshot.lastVipReward.qualityCeiling}/5; visit #{snapshot.lastVipReward.completedVisitCount})</p> : null}
            {snapshot.vipLayer.resolutions.length ? <p>Latest completed VIP quality ceiling: {mvpVipAttainableQualityCeiling(snapshot.vipLayer.resolutions[snapshot.vipLayer.resolutions.length - 1].preparedness)} / 5 (provisional)</p> : null}
            {snapshot.vipLayer.preview !== null ? (
              <aside className="progression-offer" aria-label="VIP Preview">
                <h3>{MVP_VIP_CATALOG[snapshot.vipLayer.preview].label} — VIP Preview</h3>
                <p>Choose whether to open VIP requests now. Deferring or declining has no penalty.</p>
                {vipPreviewInfo !== null ? (
                  <div aria-label="VIP opportunity details">
                    <p>Opportunity: {vipPreviewInfo.opportunity}</p>
                    <p>Potential {vipPreviewInfo.potentialReward.resource}: {vipPreviewInfo.potentialReward.minimum}–{vipPreviewInfo.potentialReward.maximum} (provisional estimate; paid when the VIP visit completes according to locked quality)</p>
                    <p>Prerequisite readiness: {vipPreviewInfo.readiness === 'prepared' ? 'Prepared' : 'Gaps identified'}</p>
                    <p>Roster gaps: {vipPreviewInfo.rosterGaps.length ? vipPreviewInfo.rosterGaps.join(', ') : 'None'}</p>
                    <p>Building gaps: {vipPreviewInfo.buildingGaps.length ? vipPreviewInfo.buildingGaps.join(', ') : 'None'}</p>
                  </div>
                ) : null}
                <button type="button" onClick={() => core.dispatch({ type: 'DECIDE_VIP_PREVIEW', decision: 'accept' })}>Accept / Open Requests</button>
                <button type="button" onClick={() => core.dispatch({ type: 'DECIDE_VIP_PREVIEW', decision: 'maybeLater' })}>Maybe later</button>
                <button type="button" onClick={() => core.dispatch({ type: 'DECIDE_VIP_PREVIEW', decision: 'declined' })}>Decline</button>
              </aside>
            ) : null}
            {snapshot.vipLayer.accepted !== null && snapshot.vipLayer.requestsOpen ? (
              <aside className="progression-offer" aria-label="VIP Requests">
                <h3>{MVP_VIP_CATALOG[snapshot.vipLayer.accepted].label} — Open Requests</h3>
                <p>VIP request accepted. Normal waves continue while you prepare required consumables.</p>
                <p>Missing Manager, Specialist or building prerequisites cannot be fixed during the visit and will lower its attainable quality ceiling; only consumables have Fix.</p>
                <p role="status">Consumable: {snapshot.vipLayer.consumableReady ? 'READY' : 'MISSING'} · {MVP_VIP_MATERIALS_PROVISIONAL.fixCostMaterials} Material required · Stock: {snapshot.materials}</p>
                {!snapshot.vipLayer.consumableReady ? (<>
                  <button type="button" disabled={snapshot.coins < MVP_VIP_MATERIALS_PROVISIONAL.supplyCostCoins} onClick={() => core.dispatch({ type: 'PURCHASE_VIP_MATERIALS' })}>Supply {MVP_VIP_MATERIALS_PROVISIONAL.supplyUnits} Material for {MVP_VIP_MATERIALS_PROVISIONAL.supplyCostCoins} Coins</button>
                  <button type="button" disabled={snapshot.materials < MVP_VIP_MATERIALS_PROVISIONAL.fixCostMaterials} onClick={() => core.dispatch({ type: 'FIX_VIP_CONSUMABLE' })}>Fix · use {MVP_VIP_MATERIALS_PROVISIONAL.fixCostMaterials} Material</button>
                </>) : null}
                <button type="button" disabled={!snapshot.vipLayer.consumableReady} onClick={() => core.dispatch({ type: 'BEGIN_VIP_VISIT', vipType: snapshot.vipLayer.accepted! })}>Begin VIP visit</button>
              </aside>
            ) : null}
            {MVP_VIP_TYPES.map(vipType => (
              <div className="progression-offer" key={vipType}>
                <span>{MVP_VIP_CATALOG[vipType].label}</span>
                <button type="button" disabled={snapshot.vipLayer.active !== null || snapshot.vipLayer.preview !== null || snapshot.vipLayer.accepted !== null} onClick={() => core.dispatch({ type: 'SHOW_VIP_PREVIEW', vipType })}>
                  Preview VIP opportunity
                </button>
              </div>
            ))}
          </section>
        ) : null}
        {finalWaveComplete ? (
          <aside className="context-card context-card--entered" aria-label="Resort finale">
            <div className="context-card__heading">
              <div><span>Campaign complete</span><h2>Resort summary</h2></div>
              <strong>{wave.result?.rating ?? 0}/5</strong>
            </div>
            <div className="context-card__stats">
              <span><b>{snapshot.coins}</b> Coins</span>
              <span><b>{snapshot.energy}</b> Energy</span>
              <span><b>{snapshot.resortValue}</b> Resort Value</span>
              {snapshot.progressionStage === 'mvp' ? <span><b>{snapshot.reputation}</b> Reputation</span> : null}
            </div>
            <p className="context-card__guidance">{forecast.totalWaves}/{forecast.totalWaves} waves cleared. The resort is complete.</p>
          </aside>
        ) : (
        <>
        <section className="context-card" aria-label="VIP specialist roster">
          <h2>VIP Specialists</h2>
          <p>Specialists are reusable VIP roster prerequisites. They do not staff buildings or change normal-wave service.</p>
          {(Object.keys(MVP_SPECIALIST_CATALOG) as MvpSpecialistId[]).map(specialistId => (
            <div key={specialistId} className="progression-offer">
              <span>{MVP_SPECIALIST_CATALOG[specialistId].name} · {MVP_SPECIALIST_CATALOG[specialistId].role}</span>
              {snapshot.hiredSpecialists.includes(specialistId) ? <strong>Hired · ready for VIP requirements</strong> : <button type="button" disabled={(wave.phase !== 'awaiting' && wave.phase !== 'complete') || snapshot.coins < MVP_SPECIALIST_PROOF_TUNING.hireCostCoins} onClick={() => core.dispatch({ type: 'HIRE_SPECIALIST', specialistId })}>Hire Specialist · {MVP_SPECIALIST_PROOF_TUNING.hireCostCoins} Coins</button>}
            </div>
          ))}
        </section>
        <aside key={selectedNeed} className="context-card context-card--entered" aria-label="Selected building actions">
          <div className="context-card__heading">
            <div><span>{NORMAL_SERVICE_CATALOG[selectedNeed].needLabel}</span><h2>{NORMAL_SERVICE_CATALOG[selectedNeed].buildingLabel}</h2></div>
            <strong>{selectedCapacity} places</strong>
          </div>
          <div className="context-card__stats">
            <span><b>{wave.queueByNeed[selectedNeed]}</b> waiting</span>
            <span><b>Lv.{wave.buildingLevelsByNeed[selectedNeed]}</b> building</span><span><b>{normalWaveBuildingQualityBonus(snapshot, selectedNeed)}</b> quality bonus</span>
            <span><b>{selectedWorkers.length}</b> worker{selectedWorkers.length === 1 ? '' : 's'}</span>
          </div>
          {wave.result?.bottleneckNeed === selectedNeed ? <p className="context-card__guidance">{wave.result.guidance}</p> : null}
          <InvestmentRecommendation state={snapshot} selectedNeed={selectedNeed} />
          <div className="context-card__actions">
            {canReassign ? <button type="button" onClick={() => setWorkerSheetOpen(true)}>Move worker</button> : null}
            {(wave.phase === 'incoming' || wave.phase === 'draining') && wave.activeNeedIds.includes(selectedNeed) ? <button type="button" disabled={!normalWaveEnergyModeAvailable(snapshot, selectedNeed)} onClick={() => core.dispatch({ type: 'ACTIVATE_ENERGY_MODE', need: selectedNeed })}>{wave.energyMode?.need === selectedNeed ? 'Boost active' : 'Boost - 1 Energy'}</button> : null}
            {upgradeQuote?.need === selectedNeed ? <><div className="progression-offer"><span>Optional building investment</span><strong>Lv.{upgradeQuote.fromLevel} to Lv.{upgradeQuote.toLevel} · {upgradeQuote.beforeCapacity} to {upgradeQuote.afterCapacity} places{upgradeQuote.beforeCapacity === upgradeQuote.afterCapacity ? " (unchanged)" : ""}</strong><small>+{upgradeQuote.addedWorkerSlots} Worker slots · +{upgradeQuote.qualityBonusAfter - upgradeQuote.qualityBonusBefore} quality</small><small>+{upgradeQuote.resortValueGain} Resort Value</small></div><button type="button" disabled={snapshot.coins < upgradeQuote.coinCost} onClick={() => core.dispatch({ type: 'UPGRADE_BUILDING', need: selectedNeed })}>Upgrade - {upgradeQuote.coinCost} Coins</button></> : null}
            {(wave.phase === 'awaiting' || wave.phase === 'complete') && wave.activeNeedIds.includes(selectedNeed) ? <button type="button" disabled={!normalWaveCanHireWorker(snapshot, selectedNeed)} onClick={() => core.dispatch({ type: 'HIRE_WORKER', to: selectedNeed })}>Hire Worker · {MVP_WORKER_PROOF_TUNING.hireCostCoins} Coins · {selectedWorkers.length}/{wave.workerSlotsByNeed[selectedNeed]} slots</button> : null}
            {managerHired ? <span>Manager: {MVP_MANAGER_CATALOG[selectedNeed].name} · service ×{MVP_MANAGER_PROOF_TUNING.serviceSpeedMultiplier}</span> : canHireManager ? <button type="button" disabled={snapshot.coins < MVP_MANAGER_PROOF_TUNING.hireCostCoins} onClick={() => core.dispatch({ type: 'HIRE_MANAGER', need: selectedNeed })}>Hire Manager {MVP_MANAGER_CATALOG[selectedNeed].name} · {MVP_MANAGER_PROOF_TUNING.hireCostCoins} Coins</button> : null}
            {selectedUnlock?.status === 'available' ? <button type="button" onClick={() => core.dispatch({ type: 'PURCHASE_AREA', areaId: selectedUnlock.areaId })}>Open area - {selectedUnlock.coinCost} Coins</button> : null}
          </div>
        </aside></>
        )}

        {workerSheetOpen && !finalWaveComplete ? (
          <div className="worker-sheet__backdrop" role="presentation" onClick={() => setWorkerSheetOpen(false)}>
            <section className="worker-sheet" role="dialog" aria-modal="true" aria-label="Worker Allocation" onClick={(event) => event.stopPropagation()}>
              <header className="worker-sheet__header">
                <div><p className="shell__eyebrow">Worker Allocation</p><h2>{workers.length} workers · live control</h2></div>
                <button type="button" onClick={() => setWorkerSheetOpen(false)}>Close</button>
              </header>
              <div className="worker-sheet__workers">
                {workers.map(([workerId, workerNeed]) => (
                  <article className="worker-row" key={workerId}>
                    <div><strong>{workerId}</strong><small>At {NORMAL_SERVICE_CATALOG[workerNeed].buildingLabel} · {normalWaveServiceCapacity(snapshot, workerNeed)} places · staffed</small></div>
                    <div className="worker-row__destinations">
                      {wave.activeNeedIds.filter((need) => need !== workerNeed && !workers.some(([, assignedNeed]) => assignedNeed === need)).map((need) => (
                        <button type="button" key={need} onClick={() => core.dispatch({ type: 'REASSIGN_WORKER', workerId, to: need })}>
                          {NORMAL_SERVICE_CATALOG[need].buildingLabel} · Worker boosts service speed
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
        <ResortWorld3D state={snapshot} selectedNeed={selectedNeed} onSelectNeed={setSelectedNeed} />
      </section>
    </main>
  );
}

import { MVP_AREA_REPUTATION_PROVISIONAL, NORMAL_SERVICE_CATALOG, PROTOTYPE_AREA_IDS, prototypeAreaUnlockView, type BootstrapState, type NormalWaveNeedId, type PrototypeAreaId } from '../core/state';

export interface AreaUnlockMapProps { readonly state: BootstrapState; readonly onSelectNeed: (need: NormalWaveNeedId) => void; readonly onPurchase: (areaId: PrototypeAreaId) => void; }
const statusLabel = { locked: 'Locked', available: 'Available', not_affordable: 'Not affordable', unlocked: 'Unlocked' } as const;

/** Map-facing view only: eligibility, economy and ownership remain Core authority. */
export function AreaUnlockMap({ state, onSelectNeed, onPurchase }: AreaUnlockMapProps) {
  const purchasePhase = state.normalWave.phase === 'awaiting' || state.normalWave.phase === 'complete';
  return <aside className="area-unlock-map" aria-label="Area unlocks on resort map">
    <h2>Resort expansions</h2>
    {PROTOTYPE_AREA_IDS.map(areaId => {
      const view = prototypeAreaUnlockView(state, areaId);
      const allowed = purchasePhase && view.status === 'available';
      return <article key={areaId} className="area-unlock-map__area" data-area={areaId} data-status={view.status}>
        <div className="area-unlock-map__heading"><strong>{view.buildingLabel}</strong><span>{statusLabel[view.status]}</span></div>
        <small>New {NORMAL_SERVICE_CATALOG[view.need].needLabel} service + included Worker {view.includedWorkerId}</small>
        <small>Price: {view.coinCost} Coins</small>
        {view.status === 'locked' ? <small>{state.progressionStage === 'mvp' ? 'Requires ' + MVP_AREA_REPUTATION_PROVISIONAL[areaId] + ' Reputation' : 'Available after wave ' + view.eligibilityAfterWave}</small> : null}
        {view.status === 'not_affordable' ? <small>Need {view.coinCost - state.coins} more Coins</small> : null}
        {view.status === 'unlocked' ? <small>Area already operating</small> : null}
        {view.status !== 'unlocked' ? <button type="button" data-purchase-area={areaId} disabled={!allowed} onClick={() => { onSelectNeed(view.need); onPurchase(areaId); }}>{view.status === 'available' ? 'Open ' + view.buildingLabel : statusLabel[view.status]} — {view.coinCost} Coins{!purchasePhase && view.status === 'available' ? ' (between waves)' : ''}</button> : null}
      </article>;
    })}
  </aside>;
}

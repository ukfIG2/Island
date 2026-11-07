import { useState } from 'react';
import { NORMAL_SERVICE_CATALOG, normalWaveUpgradeQuote, type BootstrapState, type NormalWaveNeedId } from '../core/state';

export interface WaveToUpgradeFlowProps {
  readonly state: BootstrapState;
  readonly onUpgrade: (need: NormalWaveNeedId) => void;
  readonly onNextWave: () => void;
}

/** Presentation-only sequence; Core already settles wave rewards exactly once. */
export function WaveToUpgradeFlow(props: WaveToUpgradeFlowProps) {
  const [reviewOpen, setReviewOpen] = useState(false);
  if (props.state.normalWave.phase !== 'complete' || props.state.normalWave.result === null) return null;
  if (props.state.normalWave.result.bottleneckCause === 'none') return <button className="hud-primary-action" type="button" onClick={props.onNextWave}>Continue to next wave</button>;
  return reviewOpen
    ? <UpgradeSuggestionDetails {...props} />
    : <button className="hud-primary-action" type="button" onClick={() => setReviewOpen(true)}>Review upgrade suggestion</button>;
}

export function UpgradeSuggestionDetails({ state, onUpgrade, onNextWave }: WaveToUpgradeFlowProps) {
  const wave = state.normalWave;
  if (wave.phase !== 'complete' || wave.result === null) return null;
  if (wave.result.bottleneckCause === 'none') return <section className="progression-offer" aria-label="Wave Complete"><p>No service bottleneck was observed.</p><button type="button" onClick={onNextWave}>Continue to next wave</button></section>;
  const need = wave.result.bottleneckNeed;
  const building = NORMAL_SERVICE_CATALOG[need].buildingLabel;
  const quote = normalWaveUpgradeQuote(state, need);
  const affordable = quote !== null && state.coins >= quote.coinCost && state.materials >= quote.materialCost;
  return (
    <section className="progression-offer" aria-label="Upgrade Suggestion">
      <h2>Upgrade Suggestion</h2>
      <button className="hud-primary-action" type="button" onClick={onNextWave}>Continue to next wave</button>
      <p>{building} was the wave bottleneck ({wave.result.bottleneckCause}). {wave.result.guidance}</p>
      {wave.result.bottleneckCause === 'staffing' ? <p>Reassign a Worker for staffing pressure; added seats alone will not fix missing staff.</p> : null}
      {quote === null ? <p>No further building capacity upgrade is available. Continue without buying.</p> : <>
        <p>Capacity: {quote.beforeCapacity} before / {quote.afterCapacity} after. Price: {quote.coinCost} Coins{quote.materialCost > 0 ? ' + ' + quote.materialCost + ' Materials' : ''}. Resort Value gain: +{quote.resortValueGain}.</p>
        <button type="button" disabled={!affordable} onClick={() => onUpgrade(need)}>Upgrade {building}</button>
      </>}
    </section>
  );
}

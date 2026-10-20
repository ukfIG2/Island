import { NORMAL_SERVICE_CATALOG, normalWaveUpgradeQuote, type BootstrapState, type NormalWaveNeedId } from '../core/state';

export interface InvestmentRecommendationProps {
  readonly state: BootstrapState;
  readonly selectedNeed: NormalWaveNeedId;
}

/** Post-wave advisory projection only; all cause, quote and purchase authority remains in the core. */
export function InvestmentRecommendation({ state, selectedNeed }: InvestmentRecommendationProps) {
  const wave = state.normalWave;
  const result = wave.result;
  if (wave.phase !== 'complete' || result === null || result.bottleneckNeed !== selectedNeed) return null;
  const building = NORMAL_SERVICE_CATALOG[selectedNeed].buildingLabel;
  const quote = normalWaveUpgradeQuote(state, selectedNeed);
  const capacityOffer = quote === null
    ? 'No further building capacity upgrade is currently available.'
    : 'Upgrade ' + building + ' from ' + quote.beforeCapacity + ' to ' + quote.afterCapacity + ' service places for ' + quote.coinCost + ' Coins.';
  const advice = result.bottleneckCause === 'staffing'
    ? 'Staffing was the observed cause at ' + building + '. Reassign a Worker after selecting Next wave and before starting it. ' + (quote === null ? capacityOffer : 'Optional longer-term investment: ' + capacityOffer) + ' Extra building capacity does not substitute for an assigned Worker.'
    : 'Capacity was the observed cause at ' + building + '. ' + (quote === null ? capacityOffer : 'Optional investment: ' + capacityOffer);
  return <p className="context-card__guidance" aria-label="Wave investment recommendation">{advice} Buy now or defer if an upgrade is available; Next wave does not require purchase.</p>;
}

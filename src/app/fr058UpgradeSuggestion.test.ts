import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { UpgradeSuggestionDetails } from './WaveToUpgradeFlow';
import { NORMAL_SERVICE_CATALOG, applyBootstrapCommand, createInitialBootstrapState, normalWaveUpgradeQuote, type BootstrapState } from '../core/state';

function complete(seed: string): BootstrapState {
  let state = applyBootstrapCommand(createInitialBootstrapState(seed, { totalDemand: 12, releasePerTick: 4, baseServiceCapacity: { reception: 10, food: 1, drinks: 10, relax: 1, oceanView: 1 }, queuePressurePerLostStar: 0.5, arrivalDurationMs: 1000, serviceDurationMs: 1000 }), { type: 'START_WAVE' });
  for (let i = 0; i < 800 && state.normalWave.phase !== 'complete'; i++)
    state = applyBootstrapCommand(state, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
  expect(state.normalWave.phase).toBe('complete');
  return state;
}
function html(state: BootstrapState): string {
  return renderToStaticMarkup(createElement(UpgradeSuggestionDetails, { state, onUpgrade: () => {}, onNextWave: () => {} }));
}

describe('FR-058 Core-sourced Upgrade Suggestion content', () => {
  it('identifies the observed bottleneck building and all four priced investment facts', () => {
    const state = complete('fr058-offer');
    const need = state.normalWave.result!.bottleneckNeed;
    const quote = normalWaveUpgradeQuote(state, need);
    expect(quote).not.toBeNull();
    const markup = html(state);
    expect(markup).toContain('aria-label="Upgrade Suggestion"');
    expect(markup).toContain(NORMAL_SERVICE_CATALOG[need].buildingLabel);
    expect(markup).toContain('Capacity: ' + quote!.beforeCapacity + ' before / ' + quote!.afterCapacity + ' after');
    expect(markup).toContain('Price: ' + quote!.coinCost + ' Coins');
    expect(markup).toContain('Resort Value gain: +' + quote!.resortValueGain);
    expect(markup).toContain('Continue to next wave');
  });
  it('projects Core-owned price and resulting capacity/value rather than charging in the UI', () => {
    const completed = complete('fr058-spending');
    const need = completed.normalWave.result!.bottleneckNeed;
    const quote = normalWaveUpgradeQuote(completed, need)!;
    expect(quote).not.toBeNull();
    const funded = { ...completed, coins: completed.coins + quote.coinCost + 1 };
    const purchased = applyBootstrapCommand(funded, { type: 'UPGRADE_BUILDING', need });
    expect(purchased.coins).toBe(funded.coins - quote.coinCost);
    expect(purchased.resortValue).toBe(funded.resortValue + quote.resortValueGain);
    expect(purchased.normalWave.buildingLevelsByNeed[need]).toBe(quote.toLevel);
    const nextQuote = normalWaveUpgradeQuote(purchased, need);
    if (nextQuote !== null) {
      expect(html(purchased)).toContain('Capacity: ' + nextQuote.beforeCapacity + ' before / ' + nextQuote.afterCapacity + ' after');
      expect(html(purchased)).toContain('Price: ' + nextQuote.coinCost + ' Coins');
    }
  });
  it('does not invent a capacity/price quote at the prototype maximum level', () => {
    let state = { ...complete('fr058-max'), coins: 1000 };
    const need = state.normalWave.result!.bottleneckNeed;
    let investments = 0;
    while (normalWaveUpgradeQuote(state, need) !== null && investments < 8) {
      state = applyBootstrapCommand(state, { type: 'UPGRADE_BUILDING', need });
      investments += 1;
    }
    expect(investments).toBeGreaterThan(0);
    expect(normalWaveUpgradeQuote(state, need)).toBeNull();
    const markup = html(state);
    expect(markup).toContain(NORMAL_SERVICE_CATALOG[need].buildingLabel);
    expect(markup).toContain('No further building capacity upgrade is available');
    expect(markup).not.toContain('Price: ');
    expect(markup).toContain('Continue to next wave');
  });
});

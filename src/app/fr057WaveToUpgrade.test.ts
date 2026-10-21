import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyBootstrapCommand, createInitialBootstrapState, normalWaveCoinReward, normalWaveUpgradeQuote, type BootstrapState } from '../core/state';
import { UpgradeSuggestionDetails, WaveToUpgradeFlow } from './WaveToUpgradeFlow';

function completed(): BootstrapState {
  let s = applyBootstrapCommand(createInitialBootstrapState('fr057-flow'), { type: 'START_WAVE' });
  for (let i = 0; i < 800 && s.normalWave.phase !== 'complete'; i++)
    s = applyBootstrapCommand(s, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
  expect(s.normalWave.phase).toBe('complete');
  return s;
}
const noop = () => {};
const render = (Comp: typeof WaveToUpgradeFlow, state: BootstrapState) =>
  renderToStaticMarkup(createElement(Comp, { state, onUpgrade: noop, onNextWave: noop }));

describe('FR-057 postreward wave-to-upgrade flow', () => {
  it('shows review first, with rewards already settled once by Core and no bypass Next wave', () => {
    const s = completed();
    expect(render(WaveToUpgradeFlow, s)).toContain('Review upgrade suggestion');
    expect(render(WaveToUpgradeFlow, s)).not.toContain('Next wave');
    expect(normalWaveCoinReward(s.normalWave)).toBeGreaterThan(0);
    const stable = applyBootstrapCommand(s, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
    expect(stable.coins).toBe(s.coins);
    expect(stable.energy).toBe(s.energy);
  });
  it('provides Core-quoted investment and permits next wave without purchase', () => {
    const s = completed(), need = s.normalWave.result!.bottleneckNeed;
    const quote = normalWaveUpgradeQuote(s, need), html = render(UpgradeSuggestionDetails, s);
    expect(html).toContain('Upgrade Suggestion');
    expect(html).toContain(s.normalWave.result!.guidance);
    expect(html).toContain('Continue to next wave');
    if (quote) {
      expect(html).toContain('Capacity: ' + quote.beforeCapacity + ' before / ' + quote.afterCapacity + ' after');
      expect(html).toContain('Price: ' + quote.coinCost + ' Coins');
      expect(html).toContain('Resort Value gain: +' + quote.resortValueGain);
    } else expect(html).toContain('No further building capacity upgrade');
    const next = applyBootstrapCommand(s, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(next.normalWave.phase).toBe('awaiting');
    expect(next.coins).toBe(s.coins);
  });
  it('does not offer postreward controls before completion', () => {
    const s = createInitialBootstrapState('fr057-pending');
    expect(render(WaveToUpgradeFlow, s)).toBe('');
    expect(render(UpgradeSuggestionDetails, s)).toBe('');
  });
});

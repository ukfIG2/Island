import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InvestmentRecommendation } from './InvestmentRecommendation';
import { NORMAL_WAVE_PROOF_WORKER_ID, applyBootstrapCommand, createInitialBootstrapState, normalWaveUpgradeQuote, type BootstrapState } from '../core/state';

const tuning = { totalDemand: 12, releasePerTick: 4, baseServiceCapacity: { reception: 10, food: 1, drinks: 10, relax: 1, oceanView: 1 }, queuePressurePerLostStar: 0.5, arrivalDurationMs: 1000, serviceDurationMs: 1000 } as const;

function complete(state: BootstrapState): BootstrapState {
  let next = applyBootstrapCommand(state, { type: 'START_WAVE' });
  for (let i = 0; i < 800 && next.normalWave.phase !== 'complete'; i++) next = applyBootstrapCommand(next, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
  expect(next.normalWave.phase).toBe('complete');
  return next;
}

function markup(state: BootstrapState): string {
  return renderToStaticMarkup(createElement(InvestmentRecommendation, { state, selectedNeed: state.normalWave.result!.bottleneckNeed }));
}

describe('FR-015 causal optional investment and deferral', () => {
  it('relates a capacity investment to the measured capacity bottleneck and permits deferral', () => {
    let state = createInitialBootstrapState('fr015-capacity', tuning);
    state = applyBootstrapCommand(state, { type: 'REASSIGN_WORKER', workerId: NORMAL_WAVE_PROOF_WORKER_ID, to: 'food' });
    state = complete(state);
    expect(state.normalWave.result!.bottleneckNeed).toBe('food');
    expect(state.normalWave.result!.bottleneckCause).toBe('capacity');
    const quote = normalWaveUpgradeQuote(state, 'food');
    expect(quote).not.toBeNull();
    const html = markup(state);
    expect(html).toContain('Capacity was the observed cause');
    expect(html).toContain('Optional investment:');
    expect(html).toContain(String(quote!.coinCost));
    expect(html).toContain('Next wave does not require purchase');
    const beforeCoins = state.coins, beforeLevels = state.normalWave.buildingLevelsByNeed;
    const deferred = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(deferred.normalWave.phase).toBe('awaiting');
    expect(deferred.coins).toBe(beforeCoins);
    expect(deferred.normalWave.buildingLevelsByNeed).toEqual(beforeLevels);
  });

  it('does not misrepresent extra building capacity as a remedy for missing workers', () => {
    const state = complete(createInitialBootstrapState('fr015-staffing', tuning));
    expect(state.normalWave.result!.bottleneckNeed).toBe('food');
    expect(state.normalWave.result!.bottleneckCause).toBe('staffing');
    const html = markup(state);
    expect(html).toContain('Staffing was the observed cause');
    expect(html).toContain('Reassign a Worker');
    expect(html).toContain('Optional longer-term investment:');
    expect(html).toContain('Extra building capacity does not substitute for an assigned Worker');
    expect(html).toContain('Next wave does not require purchase');
    const deferred = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
    const reassigned = applyBootstrapCommand(deferred, { type: 'REASSIGN_WORKER', workerId: NORMAL_WAVE_PROOF_WORKER_ID, to: 'food' });
    expect(reassigned.normalWave.workerAssignments[NORMAL_WAVE_PROOF_WORKER_ID]).toBe('food');
    expect(reassigned.coins).toBe(deferred.coins);
  });
});

import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyBootstrapCommand, createInitialBootstrapState } from '../core/state';
import { WaveCompletionSummary } from './WaveCompletionSummary';

describe('FR-011 Wave Complete review', () => {
  it('shows canonical rating, Satisfaction, actual service success, and improvement guidance only after completion', () => {
    const tuning = { totalDemand: 6, releasePerTick: 3, baseServiceCapacity: { reception: 10, food: 2, drinks: 10, relax: 1, oceanView: 1 }, queuePressurePerLostStar: 0.5, arrivalDurationMs: 1000, serviceDurationMs: 1000 };
    let state = createInitialBootstrapState('fr-011', tuning);
    expect(renderToStaticMarkup(createElement(WaveCompletionSummary, { wave: state.normalWave }))).toBe('');
    state = applyBootstrapCommand(state, { type: 'START_WAVE' });
    let guard = 0;
    while (state.normalWave.phase !== 'complete' && guard < 256) { state = applyBootstrapCommand(state, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 }); guard += 1; }
    expect(state.normalWave.phase).toBe('complete');
    expect(state.normalWave.result).not.toBeNull();
    const result = state.normalWave.result!;
    const html = renderToStaticMarkup(createElement(WaveCompletionSummary, { wave: state.normalWave }));
    expect(html).toContain('Wave Complete');
    expect(html).toContain(result.rating + '/5');
    expect(html).toContain('Satisfaction:');
    expect(html).toContain(String(result.satisfaction.totalWaitingTime));
    expect(html).toContain('unit-seconds of accumulated waiting');
    expect(html).toContain('What went well:');
    const requested = state.normalWave.activeNeedIds.reduce((sum, need) => sum + state.normalWave.releasedByNeed[need], 0);
    const served = state.normalWave.activeNeedIds.reduce((sum, need) => sum + state.normalWave.servedByNeed[need], 0);
    expect(requested).toBeGreaterThan(state.normalWave.releasedDemand);
    expect(served).toBe(requested);
    expect(html).toContain('All ' + requested + ' service requests completed.');
    expect(html).toContain('What to improve:');
    expect(html).toContain(result.guidance);
  });
});

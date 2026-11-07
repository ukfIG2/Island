import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState } from './state';
describe('NFR-009 absence of diagnostic pressure', () => {
  it('does not call a zero-wait completed wave a capacity bottleneck', () => {
    let state = createInitialBootstrapState('nfr009-quiet', { totalDemand: 1, releasePerTick: 1, queuePressurePerLostStar: 4, arrivalDurationMs: 90000, serviceDurationMs: 1000, baseServiceCapacity: { reception: 10, food: 10, drinks: 10, relax: 10, oceanView: 10 } });
    state = applyBootstrapCommand(state, { type: 'START_WAVE' });
    for (let i = 0; i < 200 && state.normalWave.phase !== 'complete'; i++) state = applyBootstrapCommand(state, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
    expect(state.normalWave.phase).toBe('complete');
    expect(state.normalWave.result!.totalQueuePressure).toBe(0);
    expect(state.normalWave.result!.bottleneckCause).toBe('none');
    expect(state.normalWave.result!.guidance).toContain('No service bottleneck');
  });
});

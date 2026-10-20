import { describe, expect, it } from 'vitest';
import {
  applyBootstrapCommand,
  createInitialBootstrapState,
  type BootstrapState
} from './state';

const tuning = {
  totalDemand: 2,
  releasePerTick: 2,
  baseServiceCapacity: { reception: 10, food: 1, drinks: 10, relax: 1, oceanView: 1 },
  queuePressurePerLostStar: 4,
  arrivalDurationMs: 200,
  serviceDurationMs: 100
} as const;

function tick(state: BootstrapState): BootstrapState {
  return applyBootstrapCommand(state, { type: 'ADVANCE_SIMULATION', deltaMs: 200 });
}

describe('FR-008 Satisfaction from accumulated waiting', () => {
  it('accumulates wait only while a need unit remains queued and derives completed Satisfaction from that history', () => {
    let state = createInitialBootstrapState('fr-008-satisfaction', tuning);
    state = applyBootstrapCommand(state, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'food' });
    state = applyBootstrapCommand(state, { type: 'START_WAVE' });
    state = tick(state);

    expect(state.normalWave.queueByNeed.food).toBe(1);
    expect(state.normalWave.activeByNeed.food).toBe(1);
    expect(state.normalWave.accumulatedWaitByNeed.food).toBeCloseTo(0.2);

    state = tick(state);

    expect(state.normalWave.queueByNeed.food).toBe(0);
    expect(state.normalWave.activeByNeed.food).toBe(1);
    expect(state.normalWave.accumulatedWaitByNeed.food).toBeCloseTo(0.2);

    state = tick(state);

    expect(state.normalWave.phase).toBe('complete');
    expect(state.normalWave.accumulatedWaitByNeed.food).toBeCloseTo(0.2);
    expect(state.normalWave.result?.satisfaction).toEqual({
      basis: 'accumulated_wait',
      totalWaitingTime: 0.2,
      waitingTimeByNeed: { reception: 0, food: 0.2, drinks: 0, relax: 0, oceanView: 0 }
    });
  });
});

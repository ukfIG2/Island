import { describe, expect, it } from 'vitest';
import {
  applyBootstrapCommand,
  createInitialBootstrapState,
  normalNeedOperationalState,
  type BootstrapState
} from './state';

function tick(state: BootstrapState): BootstrapState {
  return applyBootstrapCommand(state, { type: 'ADVANCE_SIMULATION', deltaMs: 200 });
}

describe('FR-006 normal-need operational state', () => {
  it('derives BOTTLENECK, RECOVERING and SATISFIED from queue and active-service conditions', () => {
    let state = createInitialBootstrapState('fr-006-operational-state', {
      totalDemand: 4,
      releasePerTick: 4,
      baseServiceCapacity: { reception: 1, food: 1, drinks: 1, relax: 1, oceanView: 1 },
      queuePressurePerLostStar: 4
    });

    expect(normalNeedOperationalState(state, 'food')).toBe('SATISFIED');

    state = applyBootstrapCommand(state, { type: 'START_WAVE' });
    state = tick(state);

    expect(state.normalWave.queueByNeed.food).toBeGreaterThan(0);
    expect(state.normalWave.activeByNeed.food).toBeGreaterThan(0);
    expect(normalNeedOperationalState(state, 'food')).toBe('BOTTLENECK');

    let guard = 0;
    while (normalNeedOperationalState(state, 'food') === 'BOTTLENECK' && guard < 16) {
      state = tick(state);
      guard += 1;
    }

    expect(guard).toBeLessThan(16);
    expect(state.normalWave.queueByNeed.food).toBe(0);
    expect(state.normalWave.activeByNeed.food).toBeGreaterThan(0);
    expect(normalNeedOperationalState(state, 'food')).toBe('RECOVERING');

    state = tick(state);

    expect(state.normalWave.queueByNeed.food).toBe(0);
    expect(state.normalWave.activeByNeed.food).toBe(0);
    expect(normalNeedOperationalState(state, 'food')).toBe('SATISFIED');
  });
});

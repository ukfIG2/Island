import { describe, expect, it } from 'vitest';
import {
  NORMAL_SERVICE_IDS,
  applyBootstrapCommand,
  createInitialBootstrapState,
  type BootstrapState
} from './state';

const tuning = {
  totalDemand: 12,
  releasePerTick: 3,
  baseServiceCapacity: { reception: 1, food: 1, drinks: 1, relax: 1, oceanView: 1 },
  queuePressurePerLostStar: 4
} as const;

function tick(state: BootstrapState): BootstrapState {
  return applyBootstrapCommand(state, { type: 'ADVANCE_SIMULATION', deltaMs: 200 });
}

function expectDemandConserved(state: BootstrapState): void {
  for (const need of state.normalWave.activeNeedIds) {
    expect(
      state.normalWave.servedByNeed[need] +
      state.normalWave.activeByNeed[need] +
      state.normalWave.queueByNeed[need]
    ).toBe(state.normalWave.releasedByNeed[need]);
  }
}

describe('FR-009 non-punitive active normal wave', () => {
  it('keeps waiting demand in the service system without abandonment and exposes no active-wave Satisfaction result', () => {
    let state = createInitialBootstrapState('fr-009-non-punitive', tuning);
    state = applyBootstrapCommand(state, { type: 'START_WAVE' });

    let sawQueue = false;
    let activeTicks = 0;

    while (state.normalWave.phase !== 'complete' && activeTicks < 64) {
      state = tick(state);
      activeTicks += 1;

      if (state.normalWave.phase !== 'complete') {
        sawQueue ||= NORMAL_SERVICE_IDS.some((need) => state.normalWave.queueByNeed[need] > 0);
        expect(state.normalWave.result).toBeNull();
        expectDemandConserved(state);
      }
    }

    expect(sawQueue).toBe(true);
    expect(activeTicks).toBeLessThan(64);
    expect(state.normalWave.phase).toBe('complete');
    expect(state.normalWave.releasedDemand).toBeGreaterThan(0);
    expect(
      state.normalWave.activeNeedIds.reduce((sum, need) => sum + state.normalWave.servedByNeed[need], 0)
    ).toBe(
      state.normalWave.activeNeedIds.reduce((sum, need) => sum + state.normalWave.releasedByNeed[need], 0)
    );
    expect(state.normalWave.result?.satisfaction.basis).toBe('accumulated_wait');
  });
});

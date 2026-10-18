import { describe, expect, it } from 'vitest';
import {
  NORMAL_WAVE_PROOF_WORKER_ID,
  applyBootstrapCommand,
  createInitialBootstrapState,
  normalNeedBottleneckCause,
  type BootstrapState
} from './state';

const tuning = {
  totalDemand: 6,
  releasePerTick: 3,
  baseServiceCapacity: { reception: 10, food: 1, drinks: 10, relax: 1, oceanView: 1 },
  queuePressurePerLostStar: 4
} as const;

function startAndTick(state: BootstrapState): BootstrapState {
  let next = applyBootstrapCommand(state, { type: 'START_WAVE' });
  next = applyBootstrapCommand(next, { type: 'ADVANCE_SIMULATION', deltaMs: 200 });
  return next;
}

describe('FR-007 live bottleneck diagnosis', () => {
  it('distinguishes staffing shortage from insufficient capacity while queues are active', () => {
    const staffing = startAndTick(createInitialBootstrapState('fr-007-staffing', tuning));

    expect(staffing.normalWave.queueByNeed.food).toBeGreaterThan(0);
    expect(normalNeedBottleneckCause(staffing, 'food')).toBe('staffing');

    let capacity = createInitialBootstrapState('fr-007-capacity', tuning);
    capacity = applyBootstrapCommand(capacity, {
      type: 'REASSIGN_WORKER',
      workerId: NORMAL_WAVE_PROOF_WORKER_ID,
      to: 'food'
    });
    capacity = startAndTick(capacity);

    expect(capacity.normalWave.queueByNeed.food).toBeGreaterThan(0);
    expect(normalNeedBottleneckCause(capacity, 'food')).toBe('capacity');

    let settled = capacity;
    for (let guard = 0; guard < 16 && settled.normalWave.queueByNeed.food > 0; guard += 1) {
      settled = applyBootstrapCommand(settled, { type: 'ADVANCE_SIMULATION', deltaMs: 200 });
    }
    expect(settled.normalWave.queueByNeed.food).toBe(0);
    expect(normalNeedBottleneckCause(settled, 'food')).toBeNull();
  });
});

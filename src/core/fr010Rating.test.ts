import { describe, expect, it } from 'vitest';
import { NORMAL_WAVE_PROOF_WORKER_ID, applyBootstrapCommand, createInitialBootstrapState, type BootstrapState } from './state';

const tuning = {
  totalDemand: 12,
  releasePerTick: 4,
  baseServiceCapacity: { reception: 10, food: 1, drinks: 10, relax: 1, oceanView: 1 },
  queuePressurePerLostStar: 0.5,
  arrivalDurationMs: 1000,
  serviceDurationMs: 1000
} as const;

function complete(state: BootstrapState): BootstrapState {
  let next = applyBootstrapCommand(state, { type: 'START_WAVE' });
  let guard = 0;
  while (next.normalWave.phase !== 'complete' && guard < 256) {
    next = applyBootstrapCommand(next, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
    guard += 1;
  }
  expect(guard).toBeLessThan(256);
  return next;
}

describe('FR-010 completed normal-wave rating', () => {
  it('keeps a non-zero floor and distinguishes poor from well-managed play', () => {
    const poor = complete(createInitialBootstrapState('fr-010-poor', tuning));

    let managedStart = createInitialBootstrapState('fr-010-managed', tuning);
    expect(managedStart.normalWave.workerAssignments[NORMAL_WAVE_PROOF_WORKER_ID]).toBe('reception');
    managedStart = applyBootstrapCommand(managedStart, {
      type: 'REASSIGN_WORKER',
      workerId: NORMAL_WAVE_PROOF_WORKER_ID,
      to: 'food'
    });
    const managed = complete(managedStart);

    expect(poor.normalWave.result).not.toBeNull();
    expect(managed.normalWave.result).not.toBeNull();
    expect(poor.normalWave.result!.rating).toBeGreaterThanOrEqual(1);
    expect(managed.normalWave.result!.rating).toBeGreaterThan(poor.normalWave.result!.rating);
    expect(managed.normalWave.result!.totalQueuePressure).toBeLessThan(poor.normalWave.result!.totalQueuePressure);
  });
});

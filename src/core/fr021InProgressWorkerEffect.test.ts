import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, type BootstrapState } from './state';

const step = (state: BootstrapState) => applyBootstrapCommand(state, { type: 'ADVANCE_SIMULATION', deltaMs: 250 });

function partiallyServicedGuests(): BootstrapState {
  let state = applyBootstrapCommand(createInitialBootstrapState('fr021-progress'), { type: 'START_WAVE' });
  for (let i = 0; i < 450 && state.normalWave.phase !== 'complete'; i += 1) {
    const source = state.normalWave.serviceProgressByNeed.reception[0];
    const destination = state.normalWave.serviceProgressByNeed.food[0];
    if (source !== undefined && destination !== undefined && source > 0.03 && source < 0.70 && destination > 0.01 && destination < 0.70) return state;
    state = step(state);
  }
  throw new Error('FR021_SIMULTANEOUS_PARTIAL_SERVICE_NOT_REACHED');
}

describe('FR-021 service performance for guests already in progress', () => {
  it('preserves existing progress and immediately changes both per-guest service rates', () => {
    const before = partiallyServicedGuests();
    const sourceProgress = before.normalWave.serviceProgressByNeed.reception;
    const destinationProgress = before.normalWave.serviceProgressByNeed.food;
    expect(sourceProgress.length).toBeGreaterThan(0);
    expect(destinationProgress.length).toBeGreaterThan(0);
    const moved = applyBootstrapCommand(before, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'food' });
    expect(moved.normalWave.serviceProgressByNeed.reception).toEqual(sourceProgress);
    expect(moved.normalWave.serviceProgressByNeed.food).toEqual(destinationProgress);
    expect(moved.normalWave.activeByNeed).toEqual(before.normalWave.activeByNeed);
    expect(moved.simulationTick).toBe(before.simulationTick);
    expect(moved.elapsedSimulationMs).toBe(before.elapsedSimulationMs);
    expect(moved.normalWave.reassignments.at(-1)).toMatchObject({ from: 'reception', to: 'food', fromSpeedBefore: 1, fromSpeedAfter: 0.33, toSpeedBefore: 0.33, toSpeedAfter: 1 });
    const control = step(before);
    const reassigned = step(moved);
    expect(reassigned.normalWave.serviceProgressByNeed.reception[0]).toBeLessThan(control.normalWave.serviceProgressByNeed.reception[0]);
    expect(reassigned.normalWave.serviceProgressByNeed.food[0]).toBeGreaterThan(control.normalWave.serviceProgressByNeed.food[0]);
    expect(reassigned.normalWave.serviceProgressByNeed.reception[0]).toBeGreaterThan(sourceProgress[0]);
    expect(reassigned.normalWave.serviceProgressByNeed.food[0]).toBeGreaterThan(destinationProgress[0]);
    expect(reassigned.normalWave.releasedByNeed).toEqual(control.normalWave.releasedByNeed);
  });

  it('restores both in-progress rates immediately when the same Worker returns', () => {
    const before = partiallyServicedGuests();
    const moved = applyBootstrapCommand(before, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'food' });
    const returned = applyBootstrapCommand(moved, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'reception' });
    expect(returned.normalWave.serviceProgressByNeed).toEqual(before.normalWave.serviceProgressByNeed);
    expect(returned.normalWave.workerAssignments).toEqual(before.normalWave.workerAssignments);
    expect(returned.simulationTick).toBe(before.simulationTick);
    expect(returned.elapsedSimulationMs).toBe(before.elapsedSimulationMs);
    const baseline = step(before);
    const resumed = step(returned);
    expect(resumed.normalWave.serviceProgressByNeed.reception).toEqual(baseline.normalWave.serviceProgressByNeed.reception);
    expect(resumed.normalWave.serviceProgressByNeed.food).toEqual(baseline.normalWave.serviceProgressByNeed.food);
  });
});

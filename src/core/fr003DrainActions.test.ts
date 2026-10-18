import { describe, expect, it } from 'vitest';

import { BootstrapCore } from './runtime';
import { createInitialBootstrapState } from './state';

describe('FR-003 wave drain controls', () => {
  it('stops new arrivals while keeping applicable Worker and Energy actions available during drain', () => {
    const core = new BootstrapCore(createInitialBootstrapState('fr-003-drain-actions'));

    core.dispatch({ type: 'START_WAVE' });
    let guard = 0;
    while (core.getSnapshot().normalWave.phase !== 'complete' && guard < 64) {
      core.dispatch({ type: 'ADVANCE_SIMULATION', deltaMs: 200 });
      guard += 1;
    }

    const wave1Complete = core.getSnapshot();
    expect(guard).toBeLessThan(64);
    expect(wave1Complete.normalWave.phase).toBe('complete');
    expect(wave1Complete.energy).toBeGreaterThan(0);

    core.dispatch({ type: 'CONTINUE_TO_NEXT_WAVE' });
    core.dispatch({ type: 'START_WAVE' });

    guard = 0;
    while (core.getSnapshot().normalWave.phase === 'incoming' && guard < 32) {
      core.dispatch({ type: 'ADVANCE_SIMULATION', deltaMs: 200 });
      guard += 1;
    }

    const draining = core.getSnapshot();
    expect(guard).toBeLessThan(32);
    expect(draining.normalWave.phase).toBe('draining');
    const releasedAtDrain = draining.normalWave.releasedDemand;
    const outstandingAtDrain =
      Object.values(draining.normalWave.queueByNeed).reduce((sum, value) => sum + value, 0) +
      Object.values(draining.normalWave.activeByNeed).reduce((sum, value) => sum + value, 0);
    expect(outstandingAtDrain).toBeGreaterThan(0);
    expect(draining.normalWave.workerAssignments['worker-1']).toBe('reception');

    core.dispatch({ type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'food' });
    const reassigned = core.getSnapshot();
    expect(reassigned.normalWave.phase).toBe('draining');
    expect(reassigned.normalWave.releasedDemand).toBe(releasedAtDrain);
    expect(reassigned.normalWave.workerAssignments['worker-1']).toBe('food');
    expect(reassigned.normalWave.reassignments.at(-1)?.to).toBe('food');

    core.dispatch({ type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'reception' });
    const restored = core.getSnapshot();
    expect(restored.normalWave.phase).toBe('draining');
    expect(restored.normalWave.releasedDemand).toBe(releasedAtDrain);
    expect(restored.normalWave.workerAssignments['worker-1']).toBe('reception');

    const energyBefore = restored.energy;
    expect(energyBefore).toBeGreaterThan(0);
    core.dispatch({ type: 'ACTIVATE_ENERGY_MODE', need: 'reception' });
    const boosted = core.getSnapshot();
    expect(boosted.normalWave.phase).toBe('draining');
    expect(boosted.normalWave.releasedDemand).toBe(releasedAtDrain);
    expect(boosted.energy).toBe(energyBefore - 1);
    expect(boosted.normalWave.energyMode?.need).toBe('reception');

    core.dispatch({ type: 'ADVANCE_SIMULATION', deltaMs: 200 });
    expect(core.getSnapshot().normalWave.releasedDemand).toBe(releasedAtDrain);

    guard = 0;
    while (core.getSnapshot().normalWave.phase !== 'complete' && guard < 64) {
      core.dispatch({ type: 'ADVANCE_SIMULATION', deltaMs: 200 });
      guard += 1;
    }

    const complete = core.getSnapshot();
    expect(guard).toBeLessThan(64);
    expect(complete.normalWave.phase).toBe('complete');
    expect(complete.normalWave.releasedDemand).toBe(releasedAtDrain);
    expect(Object.values(complete.normalWave.queueByNeed).every(value => value === 0)).toBe(true);
    expect(Object.values(complete.normalWave.activeByNeed).every(value => value === 0)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';

import { BootstrapCore } from './runtime';
import { createInitialBootstrapState } from './state';

describe('FR-001 normal-wave lifecycle', () => {
  it('runs player start through incoming, draining, completion and result', () => {
    const core = new BootstrapCore(createInitialBootstrapState('fr-001-lifecycle'));

    expect(core.getSnapshot().normalWave.phase).toBe('awaiting');

    core.dispatch({ type: 'START_WAVE' });
    expect(core.getSnapshot().normalWave.phase).toBe('incoming');

    let guard = 0;
    while (core.getSnapshot().normalWave.phase === 'incoming' && guard < 200) {
      core.dispatch({ type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
      guard += 1;
    }

    const draining = core.getSnapshot();
    expect(guard).toBeLessThan(200);
    expect(draining.normalWave.phase).toBe('draining');
    expect(draining.normalWave.result).toBeNull();

    const releasedAtDrain = draining.normalWave.releasedDemand;
    const outstandingAtDrain = Object.values(draining.normalWave.queueByNeed).reduce((a, b) => a + b, 0) + Object.values(draining.normalWave.activeByNeed).reduce((a, b) => a + b, 0);
    expect(outstandingAtDrain).toBeGreaterThan(0);

    core.dispatch({ type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
    expect(core.getSnapshot().normalWave.releasedDemand).toBe(releasedAtDrain);

    while (core.getSnapshot().normalWave.phase !== 'complete' && guard < 500) {
      core.dispatch({ type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
      guard += 1;
    }

    const complete = core.getSnapshot();
    expect(guard).toBeLessThan(500);
    expect(complete.normalWave.phase).toBe('complete');
    expect(complete.normalWave.result).not.toBeNull();
    expect(Object.values(complete.normalWave.queueByNeed).every(value => value === 0)).toBe(true);
    expect(Object.values(complete.normalWave.activeByNeed).every(value => value === 0)).toBe(true);
  });
});

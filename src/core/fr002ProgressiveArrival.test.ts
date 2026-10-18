import { describe, expect, it } from 'vitest';

import { BootstrapCore } from './runtime';
import { createInitialBootstrapState } from './state';

describe('FR-002 progressive normal-wave arrival', () => {
  it('releases demand across multiple incoming simulation ticks rather than all at once', () => {
    const core = new BootstrapCore(createInitialBootstrapState('fr-002-progressive-arrival'));

    const awaiting = core.getSnapshot();
    expect(awaiting.normalWave.releasedDemand).toBe(0);
    expect(awaiting.normalWave.tuning.totalDemand).toBe(6);
    expect(awaiting.normalWave.tuning.releasePerTick).toBe(2);

    core.dispatch({ type: 'START_WAVE' });
    const started = core.getSnapshot();
    expect(started.normalWave.phase).toBe('incoming');
    expect(started.normalWave.releasedDemand).toBe(0);

    core.dispatch({ type: 'ADVANCE_SIMULATION', deltaMs: 200 });
    const firstArrivalTick = core.getSnapshot();
    expect(firstArrivalTick.normalWave.phase).toBe('incoming');
    expect(firstArrivalTick.normalWave.releasedDemand).toBe(2);
    expect(firstArrivalTick.normalWave.releasedDemand).toBeGreaterThan(0);
    expect(firstArrivalTick.normalWave.releasedDemand).toBeLessThan(firstArrivalTick.normalWave.tuning.totalDemand);
    expect(firstArrivalTick.normalWave.releasedByNeed.reception).toBe(2);

    core.dispatch({ type: 'ADVANCE_SIMULATION', deltaMs: 200 });
    const secondArrivalTick = core.getSnapshot();
    expect(secondArrivalTick.normalWave.phase).toBe('incoming');
    expect(secondArrivalTick.normalWave.releasedDemand).toBe(4);
    expect(secondArrivalTick.normalWave.releasedDemand).toBeGreaterThan(firstArrivalTick.normalWave.releasedDemand);
    expect(secondArrivalTick.normalWave.releasedDemand).toBeLessThan(secondArrivalTick.normalWave.tuning.totalDemand);
    expect(secondArrivalTick.normalWave.releasedByNeed.reception).toBe(4);

    core.dispatch({ type: 'ADVANCE_SIMULATION', deltaMs: 200 });
    const arrivalTargetReached = core.getSnapshot();
    expect(arrivalTargetReached.normalWave.releasedDemand).toBe(6);
    expect(arrivalTargetReached.normalWave.releasedDemand).toBe(arrivalTargetReached.normalWave.tuning.totalDemand);
    expect(arrivalTargetReached.normalWave.releasedByNeed.reception).toBe(6);
    expect(arrivalTargetReached.normalWave.phase).not.toBe('incoming');
  });
});

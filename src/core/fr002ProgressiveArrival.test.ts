import { describe, expect, it } from 'vitest';
import { BootstrapCore } from './runtime';
import { createInitialBootstrapState } from './state';

describe('FR-002 progressive normal-wave arrival', () => {
  it('uses elapsed milliseconds and per-need cumulative arrivals, not number of ticks', () => {
    const core = new BootstrapCore(createInitialBootstrapState('fr-002-progressive-arrival'));
    expect(core.getSnapshot().normalWave.tuning.arrivalDurationMs).toBe(90_000);
    expect(core.getSnapshot().normalWave.demandTargetByNeed).toMatchObject({ reception: 8, food: 6, drinks: 8 });
    core.dispatch({ type: 'START_WAVE' });
    core.dispatch({ type: 'ADVANCE_SIMULATION', deltaMs: 30_000 });
    const first = core.getSnapshot().normalWave;
    expect(first.phase).toBe('incoming');
    expect(first.releasedDemand).toBe(4);
    expect(first.releasedByNeed).toMatchObject({ reception: 2, food: 2, drinks: 2 });
    core.dispatch({ type: 'ADVANCE_SIMULATION', deltaMs: 30_000 });
    const second = core.getSnapshot().normalWave;
    expect(second.releasedDemand).toBe(8);
    expect(second.releasedByNeed.reception).toBe(5);
    core.dispatch({ type: 'ADVANCE_SIMULATION', deltaMs: 30_000 });
    const last = core.getSnapshot().normalWave;
    expect(last.releasedDemand).toBe(12);
    expect(last.releasedByNeed).toMatchObject({ reception: 8, food: 6, drinks: 8 });
    expect(last.phase).toBe('draining');
    expect(last.result).toBeNull();
  });
});

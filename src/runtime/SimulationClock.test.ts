import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BootstrapCore } from '../core/runtime';
import { createInitialBootstrapState } from '../core/state';
import { SimulationClock } from './SimulationClock';

describe('SimulationClock freeze boundary', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('does not advance exact wave state while stopped and resumes without wall-time catch-up', () => {
    const core = new BootstrapCore(createInitialBootstrapState('clock-freeze'));
    core.dispatch({ type: 'START_WAVE' });
    const clock = new SimulationClock(core, 1000);
    clock.start();
    vi.advanceTimersByTime(1000);
    clock.stop();
    const frozen = core.getSnapshot();
    vi.advanceTimersByTime(60_000);
    expect(core.getSnapshot()).toBe(frozen);
    expect(core.getSnapshot()).toEqual(frozen);
    clock.start();
    vi.advanceTimersByTime(1000);
    expect(core.getSnapshot().simulationTick).toBe(frozen.simulationTick + 1);
  });
});

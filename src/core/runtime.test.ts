import { describe, expect, it, vi } from 'vitest';
import { BootstrapCore } from './runtime';
import { createInitialBootstrapState } from './state';

describe('BootstrapCore', () => {
  it('owns canonical non-gameplay state transitions', () => {
    const core = new BootstrapCore(
      createInitialBootstrapState('test-boot')
    );

    const listener = vi.fn();
    const unsubscribe = core.subscribe(listener);

    core.dispatch({
      type: 'ADVANCE_SIMULATION',
      deltaMs: 200
    });

    expect(core.getSnapshot()).toEqual({
      schema: 'resort-bootstrap-state/v1',
      bootId: 'test-boot',
      simulationTick: 1,
      elapsedSimulationMs: 200
    });

    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('rejects an invalid simulation delta', () => {
    const core = new BootstrapCore(
      createInitialBootstrapState('test-boot')
    );

    expect(() => {
      core.dispatch({
        type: 'ADVANCE_SIMULATION',
        deltaMs: 0
      });
    }).toThrow('BOOTSTRAP_DELTA_INVALID');
  });
});

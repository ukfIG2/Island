import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  DebugRingBufferSink,
  DebugTransport
} from '../debug/DebugTransport';

import {
  BootstrapCore,
  type BootstrapDebugEvents
} from './runtime';

import {
  NORMAL_WAVE_PROOF_WORKER_ID,
  createInitialBootstrapState,
  normalWaveServiceCapacity
} from './state';

function advance(
  core: BootstrapCore,
  count = 1
): void {
  for (let index = 0; index < count; index += 1) {
    core.dispatch({
      type: 'ADVANCE_SIMULATION',
      deltaMs: 200
    });
  }
}

function runWithoutReassignment(): ReturnType<BootstrapCore['getSnapshot']> {
  const core = new BootstrapCore(
    createInitialBootstrapState('control-wave')
  );

  core.dispatch({ type: 'START_WAVE' });

  let guard = 0;
  while (
    core.getSnapshot().normalWave.phase !== 'complete' &&
    guard < 16
  ) {
    advance(core);
    guard += 1;
  }

  expect(guard).toBeLessThan(16);
  return core.getSnapshot();
}

describe(
  'BootstrapCore',
  () => {
    it(
      'owns canonical state transitions through the existing runtime',
      () => {
        const core = new BootstrapCore(
          createInitialBootstrapState('test-boot')
        );

        const listener = vi.fn();
        const unsubscribe = core.subscribe(listener);

        core.dispatch({
          type: 'ADVANCE_SIMULATION',
          deltaMs: 200
        });

        expect(core.getSnapshot()).toMatchObject({
          schema: 'resort-bootstrap-state/v1',
          bootId: 'test-boot',
          simulationTick: 1,
          elapsedSimulationMs: 200,
          normalWave: {
            phase: 'awaiting'
          }
        });

        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
      }
    );

    it(
      'emits a factual transition observation without owning state',
      () => {
        const sink = new DebugRingBufferSink(8);

        const debug = new DebugTransport<BootstrapDebugEvents>({
          enabledCategories: ['core.transition'],
          sinks: [sink]
        });

        const core = new BootstrapCore(
          createInitialBootstrapState('debug-boot'),
          debug
        );

        core.dispatch({
          type: 'ADVANCE_SIMULATION',
          deltaMs: 200
        });

        expect(sink.snapshot()).toEqual([
          {
            sequence: 1,
            category: 'core.transition',
            payload: {
              commandType: 'ADVANCE_SIMULATION',
              simulationTick: 1,
              elapsedSimulationMs: 200
            }
          }
        ]);

        expect(core.getSnapshot()).toMatchObject({
          bootId: 'debug-boot',
          simulationTick: 1,
          elapsedSimulationMs: 200,
          normalWave: {
            phase: 'awaiting'
          }
        });
      }
    );

    it(
      'rejects an invalid simulation delta',
      () => {
        const core = new BootstrapCore(
          createInitialBootstrapState('test-boot')
        );

        expect(() => {
          core.dispatch({
            type: 'ADVANCE_SIMULATION',
            deltaMs: 0
          });
        }).toThrow('BOOTSTRAP_DELTA_INVALID');
      }
    );

    it(
      'proves the normal-wave bottleneck, immediate Worker reassignment, drain, and causal result',
      () => {
        const control = runWithoutReassignment();

        const core = new BootstrapCore(
          createInitialBootstrapState('reassigned-wave')
        );

        expect(core.getSnapshot().normalWave.phase).toBe('awaiting');

        core.dispatch({ type: 'START_WAVE' });
        expect(core.getSnapshot().normalWave.phase).toBe('incoming');

        advance(core, 2);

        const bottleneck = core.getSnapshot();
        expect(bottleneck.normalWave.releasedDemand).toBe(4);
        expect(bottleneck.normalWave.queueByNeed.food).toBe(2);
        expect(bottleneck.normalWave.queueByNeed.reception).toBe(0);
        expect(normalWaveServiceCapacity(bottleneck, 'food')).toBe(1);

        core.dispatch({
          type: 'REASSIGN_WORKER',
          workerId: NORMAL_WAVE_PROOF_WORKER_ID,
          to: 'food'
        });

        const reassigned = core.getSnapshot();
        expect(normalWaveServiceCapacity(reassigned, 'food')).toBe(2);
        expect(normalWaveServiceCapacity(reassigned, 'reception')).toBe(1);
        expect(reassigned.normalWave.reassignments).toHaveLength(1);
        expect(reassigned.normalWave.reassignments[0]).toMatchObject({
          workerId: NORMAL_WAVE_PROOF_WORKER_ID,
          from: 'reception',
          to: 'food',
          fromCapacityBefore: 2,
          fromCapacityAfter: 1,
          toCapacityBefore: 1,
          toCapacityAfter: 2,
          targetQueueAtChange: 2
        });

        advance(core);

        const arrivalsEnded = core.getSnapshot();
        expect(arrivalsEnded.normalWave.releasedDemand).toBe(
          arrivalsEnded.normalWave.tuning.totalDemand
        );
        expect(arrivalsEnded.normalWave.phase).toBe('draining');
        expect(
          arrivalsEnded.normalWave.queueByNeed.reception +
          arrivalsEnded.normalWave.queueByNeed.food
        ).toBeGreaterThan(0);

        advance(core);

        const completed = core.getSnapshot();
        expect(completed.normalWave.phase).toBe('complete');
        expect(completed.normalWave.queueByNeed).toEqual({
          reception: 0,
          food: 0
        });
        expect(completed.normalWave.result).not.toBeNull();
        expect(completed.normalWave.result?.bottleneckNeed).toBe('food');
        expect(completed.normalWave.result?.reassignments).toHaveLength(1);
        expect(
          completed.normalWave.result?.explanation.some(
            line => line.includes('reception->food')
          )
        ).toBe(true);

        expect(control.normalWave.result).not.toBeNull();
        expect(completed.normalWave.result!.totalQueuePressure).toBeLessThan(
          control.normalWave.result!.totalQueuePressure
        );
        expect(completed.normalWave.result!.rating).toBeGreaterThan(
          control.normalWave.result!.rating
        );
        expect(completed.simulationTick).toBeLessThan(
          control.simulationTick
        );
      }
    );
  }
);

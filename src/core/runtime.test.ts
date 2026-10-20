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
      deltaMs: 1000
    });
  }
}

function advanceUntilComplete(
  core: BootstrapCore,
  guardLimit = 650
): ReturnType<BootstrapCore['getSnapshot']> {
  let guard = 0;

  while (
    core.getSnapshot().normalWave.phase !== 'complete' &&
    guard < guardLimit
  ) {
    advance(core);
    guard += 1;
  }

  expect(guard).toBeLessThan(guardLimit);
  return core.getSnapshot();
}

function runWithoutReassignment(): ReturnType<BootstrapCore['getSnapshot']> {
  const core = new BootstrapCore(
    createInitialBootstrapState('control-wave', {
      totalDemand: 6,
      releasePerTick: 2,
      baseServiceCapacity: { reception: 1, food: 1, drinks: 10, relax: 1, oceanView: 1 },
      queuePressurePerLostStar: 2.75, arrivalDurationMs: 2000, serviceDurationMs: 1000
    })
  );

  core.dispatch({ type: 'START_WAVE' });
  return advanceUntilComplete(core);
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
      'keeps waiting distinct from active service and owns accumulated wait history',
      () => {
        const core = new BootstrapCore(
          createInitialBootstrapState('service-state', { totalDemand: 6, releasePerTick: 3, baseServiceCapacity: { reception: 1, food: 1, drinks: 1, relax: 1, oceanView: 1 }, queuePressurePerLostStar: 2.75, arrivalDurationMs: 2000, serviceDurationMs: 1000 })
        );

        core.dispatch({ type: 'START_WAVE' });
        advance(core);

        const admitted = core.getSnapshot().normalWave;

        expect(admitted.releasedDemand).toBeGreaterThan(0);
        expect(
          admitted.activeByNeed.reception +
          admitted.activeByNeed.food +
          admitted.activeByNeed.drinks
        ).toBeGreaterThan(0);
        expect(admitted.servedByNeed).toEqual({
          reception: 0,
          food: 0,
          drinks: 0,
          relax: 0,
          oceanView: 0
        });
        expect(admitted.queueByNeed.food).toBeGreaterThan(0);
        expect(admitted.activeByNeed.food).toBeGreaterThan(0);
        expect(admitted.activeByNeed.food).toBe(
          normalWaveServiceCapacity(core.getSnapshot(), 'food')
        );
        expect(admitted.accumulatedWaitByNeed.food).toBeGreaterThan(0);

        advance(core, 4);

        const progressed = core.getSnapshot().normalWave;
        expect(progressed.servedByNeed.food).toBeGreaterThan(0);
        expect(progressed.accumulatedWaitByNeed.food).toBeGreaterThanOrEqual(
          admitted.accumulatedWaitByNeed.food
        );
      }
    );

    it(
      'allows free immediate pre-wave reassignment and preserves anonymous Worker placement into the next wave',
      () => {
        const core = new BootstrapCore(
          createInitialBootstrapState('worker-foundation')
        );

        const initial = core.getSnapshot().normalWave;
        expect(initial.workerSlotsByNeed).toEqual({
          reception: 1,
          food: 1,
          drinks: 1,
          relax: 1,
          oceanView: 1
        });
        expect(Object.keys(initial.workerAssignments)).toHaveLength(2);
        expect(
          Object.keys(initial.workerAssignments).length
        ).toBeLessThan(
          initial.workerSlotsByNeed.reception +
          initial.workerSlotsByNeed.food +
          initial.workerSlotsByNeed.drinks
        );

        core.dispatch({
          type: 'REASSIGN_WORKER',
          workerId: NORMAL_WAVE_PROOF_WORKER_ID,
          to: 'food'
        });

        expect(
          core.getSnapshot().normalWave.workerAssignments[
            NORMAL_WAVE_PROOF_WORKER_ID
          ]
        ).toBe('food');

        core.dispatch({ type: 'START_WAVE' });
        const completed = advanceUntilComplete(core);

        expect(
          completed.normalWave.workerAssignments[
            NORMAL_WAVE_PROOF_WORKER_ID
          ]
        ).toBe('food');

        core.dispatch({ type: 'CONTINUE_TO_NEXT_WAVE' });

        const next = core.getSnapshot().normalWave;
        expect(next.phase).toBe('awaiting');
        expect(next.workerAssignments[NORMAL_WAVE_PROOF_WORKER_ID]).toBe('food');
        expect(next.queueByNeed).toEqual({ reception: 0, food: 0, drinks: 0, relax: 0, oceanView: 0 });
        expect(next.activeByNeed).toEqual({ reception: 0, food: 0, drinks: 0, relax: 0, oceanView: 0 });
        expect(next.accumulatedWaitByNeed).toEqual({ reception: 0, food: 0, drinks: 0, relax: 0, oceanView: 0 });
        expect(next.result).toBeNull();
      }
    );

    it(
      'distinguishes staffing pressure from capacity pressure and returns causal guidance',
      () => {
        const staffing = runWithoutReassignment();

        expect(staffing.normalWave.result).not.toBeNull();
        expect(staffing.normalWave.result?.bottleneckCause).toBe('staffing');
        expect(
          staffing.normalWave.result?.guidance.toLowerCase()
        ).toContain('worker');

        const capacityCore = new BootstrapCore(
          createInitialBootstrapState(
            'capacity-wave',
            {
              totalDemand: 6,
              releasePerTick: 3,
              baseServiceCapacity: { reception: 10, food: 1, drinks: 10, relax: 1, oceanView: 1 },
              queuePressurePerLostStar: 2.75, arrivalDurationMs: 2000, serviceDurationMs: 1000
            }
          )
        );

        capacityCore.dispatch({
          type: 'REASSIGN_WORKER',
          workerId: NORMAL_WAVE_PROOF_WORKER_ID,
          to: 'food'
        });
        capacityCore.dispatch({ type: 'START_WAVE' });

        const capacity = advanceUntilComplete(capacityCore);

        expect(capacity.normalWave.result).not.toBeNull();
        expect(capacity.normalWave.result?.bottleneckNeed).toBe('food');
        expect(capacity.normalWave.result?.bottleneckCause).toBe('capacity');
        expect(
          capacity.normalWave.result?.guidance.toLowerCase()
        ).toContain('upgrade');
      }
    );

    it(
      'preserves the accepted causal improvement from timely in-wave Worker reassignment',
      () => {
        const control = runWithoutReassignment();

        const core = new BootstrapCore(
          createInitialBootstrapState('reassigned-wave', {
            totalDemand: 6,
            releasePerTick: 2,
            baseServiceCapacity: { reception: 1, food: 1, drinks: 10, relax: 1, oceanView: 1 },
            queuePressurePerLostStar: 2.75, arrivalDurationMs: 2000, serviceDurationMs: 1000
          })
        );

        core.dispatch({ type: 'START_WAVE' });
        advance(core, 2);

        const bottleneck = core.getSnapshot();

        expect(bottleneck.normalWave.queueByNeed.food).toBeGreaterThan(0);
        expect(normalWaveServiceCapacity(bottleneck, 'food')).toBe(1);

        core.dispatch({
          type: 'REASSIGN_WORKER',
          workerId: NORMAL_WAVE_PROOF_WORKER_ID,
          to: 'food'
        });

        const reassigned = core.getSnapshot();
        expect(normalWaveServiceCapacity(reassigned, 'food')).toBe(1);
        expect(normalWaveServiceCapacity(reassigned, 'reception')).toBe(1);
        expect(reassigned.normalWave.reassignments).toHaveLength(1);
        expect(reassigned.normalWave.reassignments[0]).toMatchObject({
          workerId: NORMAL_WAVE_PROOF_WORKER_ID,
          from: 'reception',
          to: 'food',
          fromCapacityBefore: 1,
          fromCapacityAfter: 1,
          toCapacityBefore: 1,
          toCapacityAfter: 1,
          fromSpeedBefore: 1,
          fromSpeedAfter: 0.33,
          toSpeedBefore: 0.33,
          toSpeedAfter: 1
        });

        const completed = advanceUntilComplete(core);

        expect(completed.normalWave.queueByNeed).toEqual({
          reception: 0,
          food: 0,
          drinks: 0,
          relax: 0,
          oceanView: 0
        });
        expect(completed.normalWave.activeByNeed).toEqual({
          reception: 0,
          food: 0,
          drinks: 0,
          relax: 0,
          oceanView: 0
        });
        expect(completed.normalWave.result).not.toBeNull();
        expect(completed.normalWave.result?.bottleneckNeed).toBeDefined();
        expect(completed.normalWave.result?.reassignments).toHaveLength(1);

        expect(control.normalWave.result).not.toBeNull();
        expect(completed.normalWave.result!.totalQueuePressure).toBeLessThan(
          control.normalWave.result!.totalQueuePressure
        );
        expect(completed.normalWave.result!.rating).toBeGreaterThan(
          control.normalWave.result!.rating
        );
        expect(completed.simulationTick).toBeLessThanOrEqual(
          control.simulationTick
        );
      }
    );
  }
);

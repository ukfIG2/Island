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
  createInitialBootstrapState
} from './state';

describe(
  'BootstrapCore',
  () => {
    it(
      'owns canonical non-gameplay state transitions',
      () => {
        const core =
          new BootstrapCore(
            createInitialBootstrapState(
              'test-boot'
            )
          );

        const listener =
          vi.fn();

        const unsubscribe =
          core.subscribe(
            listener
          );

        core.dispatch({
          type:
            'ADVANCE_SIMULATION',
          deltaMs: 200
        });

        expect(
          core.getSnapshot()
        ).toEqual({
          schema:
            'resort-bootstrap-state/v1',
          bootId:
            'test-boot',
          simulationTick: 1,
          elapsedSimulationMs:
            200
        });

        expect(
          listener
        ).toHaveBeenCalledTimes(
          1
        );

        unsubscribe();
      }
    );

    it(
      'emits a factual transition observation without owning state',
      () => {
        const sink =
          new DebugRingBufferSink(
            8
          );

        const debug =
          new DebugTransport<
            BootstrapDebugEvents
          >({
            enabledCategories: [
              'core.transition'
            ],
            sinks: [sink]
          });

        const core =
          new BootstrapCore(
            createInitialBootstrapState(
              'debug-boot'
            ),
            debug
          );

        core.dispatch({
          type:
            'ADVANCE_SIMULATION',
          deltaMs: 200
        });

        expect(
          sink.snapshot()
        ).toEqual([
          {
            sequence: 1,
            category:
              'core.transition',
            payload: {
              commandType:
                'ADVANCE_SIMULATION',
              simulationTick: 1,
              elapsedSimulationMs:
                200
            }
          }
        ]);

        expect(
          core.getSnapshot()
        ).toEqual({
          schema:
            'resort-bootstrap-state/v1',
          bootId:
            'debug-boot',
          simulationTick: 1,
          elapsedSimulationMs:
            200
        });
      }
    );

    it(
      'rejects an invalid simulation delta',
      () => {
        const core =
          new BootstrapCore(
            createInitialBootstrapState(
              'test-boot'
            )
          );

        expect(() => {
          core.dispatch({
            type:
              'ADVANCE_SIMULATION',
            deltaMs: 0
          });
        }).toThrow(
          'BOOTSTRAP_DELTA_INVALID'
        );
      }
    );
  }
);

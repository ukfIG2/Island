import {
  describe,
  expect,
  it,
  vi
} from 'vitest';

import {
  DebugRingBufferSink,
  DebugTransport,
  type DebugSink
} from './DebugTransport';

interface TestEvents {
  readonly test:
    Readonly<{
      value: number;
    }>;
}

describe(
  'DebugTransport',
  () => {
    it(
      'does not construct payloads for disabled categories',
      () => {
        const sink =
          new DebugRingBufferSink(4);

        const transport =
          new DebugTransport<TestEvents>({
            enabledCategories: [],
            sinks: [sink]
          });

        const payloadFactory =
          vi.fn(
            () => ({
              value: 1
            })
          );

        expect(
          transport.emit(
            'test',
            payloadFactory
          )
        ).toBe(false);

        expect(
          payloadFactory
        ).not.toHaveBeenCalled();

        expect(
          sink.size()
        ).toBe(0);

        expect(
          sink.snapshot()
        ).toEqual([]);
      }
    );

    it(
      'keeps bounded ordered history and isolates sink failure',
      () => {
        const failingSink:
          DebugSink = {
            write: () => {
              throw new Error(
                'DEBUG_SINK_FAILURE'
              );
            }
          };

        const ring =
          new DebugRingBufferSink(2);

        const transport =
          new DebugTransport<TestEvents>({
            enabledCategories: [
              'test'
            ],
            sinks: [
              failingSink,
              ring
            ]
          });

        transport.emit(
          'test',
          () => ({
            value: 1
          })
        );

        transport.emit(
          'test',
          () => ({
            value: 2
          })
        );

        transport.emit(
          'test',
          () => ({
            value: 3
          })
        );

        const events =
          ring.snapshot();

        expect(
          ring.size()
        ).toBe(2);

        expect(events).toEqual([
          {
            sequence: 2,
            category: 'test',
            payload: {
              value: 2
            }
          },
          {
            sequence: 3,
            category: 'test',
            payload: {
              value: 3
            }
          }
        ]);

        expect(
          Object.isFrozen(events)
        ).toBe(true);

        expect(
          Object.isFrozen(
            events[0]
          )
        ).toBe(true);

        expect(
          Object.isFrozen(
            events[0].payload
          )
        ).toBe(true);
      }
    );
  }
);

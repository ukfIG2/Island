export interface DebugEvent {
  readonly sequence: number;
  readonly category: string;
  readonly payload: unknown;
}

export interface DebugSink {
  write(event: DebugEvent): void;
}

export interface DebugTransportOptions<
  TEvents extends object
> {
  readonly enabledCategories: Iterable<
    Extract<keyof TEvents, string>
  >;

  readonly sinks: readonly DebugSink[];
}

function freezePayload<T>(
  payload: T
): T {
  if (
    typeof payload === 'object' &&
    payload !== null
  ) {
    return Object.freeze(payload);
  }

  return payload;
}

export class DebugTransport<
  TEvents extends object
> {
  private readonly enabledCategories:
    ReadonlySet<string>;

  private readonly sinks:
    readonly DebugSink[];

  private sequence = 0;

  constructor(
    options: DebugTransportOptions<TEvents>
  ) {
    this.enabledCategories =
      new Set<string>(
        options.enabledCategories
      );

    this.sinks = [
      ...options.sinks
    ];
  }

  readonly isEnabled = (
    category:
      Extract<keyof TEvents, string>
  ): boolean =>
    this.enabledCategories.has(
      category
    );

  readonly emit = <
    K extends Extract<
      keyof TEvents,
      string
    >
  >(
    category: K,
    payloadFactory:
      () => TEvents[K]
  ): boolean => {
    if (
      !this.enabledCategories.has(
        category
      )
    ) {
      return false;
    }

    const event:
      DebugEvent =
      Object.freeze({
        sequence:
          ++this.sequence,

        category,

        payload:
          freezePayload(
            payloadFactory()
          )
      });

    for (
      const sink of this.sinks
    ) {
      try {
        sink.write(event);
      } catch {
        // Debug observation failure must never
        // become gameplay/runtime authority.
      }
    }

    return true;
  };
}

export class DebugRingBufferSink
implements DebugSink {
  private readonly items:
    DebugEvent[] = [];

  constructor(
    readonly capacity: number
  ) {
    if (
      !Number.isInteger(capacity) ||
      capacity <= 0
    ) {
      throw new Error(
        'DEBUG_CAPACITY_INVALID'
      );
    }
  }

  readonly write = (
    event: DebugEvent
  ): void => {
    this.items.push(event);

    const overflow =
      this.items.length -
      this.capacity;

    if (overflow > 0) {
      this.items.splice(
        0,
        overflow
      );
    }
  };

  readonly snapshot = ():
    readonly DebugEvent[] =>
      Object.freeze([
        ...this.items
      ]);
}

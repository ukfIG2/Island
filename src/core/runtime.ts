import type {
  DebugTransport
} from '../debug/DebugTransport';

import {
  applyBootstrapCommand,
  type BootstrapCommand,
  type BootstrapState
} from './state';

export type BootstrapListener =
  () => void;

export interface BootstrapDebugEvents {
  readonly 'core.transition':
    Readonly<{
      commandType:
        BootstrapCommand['type'];

      simulationTick:
        number;

      elapsedSimulationMs:
        number;
    }>;
}

export class BootstrapCore {
  private state:
    BootstrapState;

  private readonly listeners =
    new Set<BootstrapListener>();

  constructor(
    initialState:
      BootstrapState,

    private readonly debug?:
      DebugTransport<
        BootstrapDebugEvents
      >
  ) {
    this.state =
      initialState;
  }

  readonly getSnapshot =
    (): BootstrapState =>
      this.state;

  readonly subscribe = (
    listener:
      BootstrapListener
  ): (() => void) => {
    this.listeners.add(
      listener
    );

    return () => {
      this.listeners.delete(
        listener
      );
    };
  };

  readonly replaceState = (
    nextState:
      BootstrapState
  ): BootstrapState => {
    if (nextState === this.state) {
      return this.state;
    }

    this.state = nextState;

    for (
      const listener
      of this.listeners
    ) {
      listener();
    }

    return this.state;
  };

  readonly dispatch = (
    command:
      BootstrapCommand
  ): BootstrapState => {
    const next =
      applyBootstrapCommand(
        this.state,
        command
      );

    if (
      next !== this.state
    ) {
      this.state =
        next;

      this.debug?.emit(
        'core.transition',
        () => ({
          commandType:
            command.type,

          simulationTick:
            next.simulationTick,

          elapsedSimulationMs:
            next.elapsedSimulationMs
        })
      );

      for (
        const listener
        of this.listeners
      ) {
        listener();
      }
    }

    return this.state;
  };
}

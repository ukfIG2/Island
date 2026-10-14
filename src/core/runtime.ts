import {
  applyBootstrapCommand,
  type BootstrapCommand,
  type BootstrapState
} from './state';

export type BootstrapListener = () => void;

export class BootstrapCore {
  private state: BootstrapState;
  private readonly listeners = new Set<BootstrapListener>();

  constructor(initialState: BootstrapState) {
    this.state = initialState;
  }

  readonly getSnapshot = (): BootstrapState => this.state;

  readonly subscribe = (
    listener: BootstrapListener
  ): (() => void) => {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly dispatch = (
    command: BootstrapCommand
  ): BootstrapState => {
    const next = applyBootstrapCommand(this.state, command);

    if (next !== this.state) {
      this.state = next;

      for (const listener of this.listeners) {
        listener();
      }
    }

    return this.state;
  };
}

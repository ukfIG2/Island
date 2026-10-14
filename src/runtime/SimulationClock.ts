import type { BootstrapCore } from '../core/runtime';

export class SimulationClock {
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly core: BootstrapCore,
    readonly periodMs: number
  ) {}

  start(): void {
    if (this.timer !== null) {
      return;
    }

    this.timer = setInterval(() => {
      this.core.dispatch({
        type: 'ADVANCE_SIMULATION',
        deltaMs: this.periodMs
      });
    }, this.periodMs);
  }

  stop(): void {
    if (this.timer === null) {
      return;
    }

    clearInterval(this.timer);
    this.timer = null;
  }

  status(): Readonly<{
    running: boolean;
    periodMs: number;
  }> {
    return {
      running: this.timer !== null,
      periodMs: this.periodMs
    };
  }
}

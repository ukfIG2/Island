import {
  Application,
  Graphics,
  Text
} from 'pixi.js';
import type { BootstrapState } from '../core/state';

export class PixiProjection {
  private app: Application | null = null;
  private disposed = false;

  async mount(
    host: HTMLElement,
    readState: () => BootstrapState
  ): Promise<void> {
    const app = new Application();

    await app.init({
      resizeTo: host,
      antialias: true,
      background: 0x0f1720
    });

    if (this.disposed) {
      app.destroy(true);
      return;
    }

    this.app = app;
    host.replaceChildren(app.canvas);

    const frame = new Graphics()
      .roundRect(32, 32, 420, 180, 18)
      .fill(0x183244);

    const title = new Text({
      text: 'Pixi render projection',
      style: {
        fill: 0xffffff,
        fontSize: 24
      }
    });

    title.position.set(56, 56);

    const status = new Text({
      text: '',
      style: {
        fill: 0xb7d9ec,
        fontSize: 18
      }
    });

    status.position.set(56, 108);

    const note = new Text({
      text: 'No gameplay content — bootstrap boundary only',
      style: {
        fill: 0x8fa9b8,
        fontSize: 14
      }
    });

    note.position.set(56, 154);

    app.stage.addChild(frame, title, status, note);

    let renderedTick = -1;

    app.ticker.add(() => {
      const snapshot = readState();

      if (snapshot.simulationTick === renderedTick) {
        return;
      }

      renderedTick = snapshot.simulationTick;
      status.text =
        'Simulation tick: ' +
        snapshot.simulationTick +
        ' · elapsed: ' +
        snapshot.elapsedSimulationMs +
        ' ms';
    });
  }

  destroy(): void {
    this.disposed = true;

    if (this.app !== null) {
      this.app.destroy(true);
      this.app = null;
    }
  }
}

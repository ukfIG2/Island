import {
  Application,
  Graphics,
  Text
} from 'pixi.js';

import {
  NORMAL_WAVE_PROOF_WORKER_ID,
  normalWaveServiceCapacity,
  type BootstrapState,
  type NormalWaveNeedId
} from '../core/state';

function labelNeed(need: NormalWaveNeedId): string {
  return need === 'reception' ? 'Reception' : 'Food';
}

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

    const header = new Graphics()
      .roundRect(32, 32, 560, 120, 18)
      .fill(0x183244);

    const receptionFrame = new Graphics()
      .roundRect(32, 176, 270, 240, 18)
      .fill(0x152934);

    const foodFrame = new Graphics()
      .roundRect(322, 176, 270, 240, 18)
      .fill(0x152934);

    const title = new Text({
      text: 'Resort service flow',
      style: {
        fill: 0xffffff,
        fontSize: 24
      }
    });
    title.position.set(56, 52);

    const waveStatus = new Text({
      text: '',
      style: {
        fill: 0xb7d9ec,
        fontSize: 16
      }
    });
    waveStatus.position.set(56, 96);

    const receptionStatus = new Text({
      text: '',
      style: {
        fill: 0xe9f1f5,
        fontSize: 18,
        lineHeight: 30
      }
    });
    receptionStatus.position.set(56, 202);

    const foodStatus = new Text({
      text: '',
      style: {
        fill: 0xe9f1f5,
        fontSize: 18,
        lineHeight: 30
      }
    });
    foodStatus.position.set(346, 202);

    const resultStatus = new Text({
      text: '',
      style: {
        fill: 0x92bed4,
        fontSize: 17,
        lineHeight: 27,
        wordWrap: true,
        wordWrapWidth: 536
      }
    });
    resultStatus.position.set(56, 446);

    app.stage.addChild(
      header,
      receptionFrame,
      foodFrame,
      title,
      waveStatus,
      receptionStatus,
      foodStatus,
      resultStatus
    );

    let renderedSignature = '';

    app.ticker.add(() => {
      const snapshot = readState();
      const wave = snapshot.normalWave;
      const workerNeed = wave.workerAssignments[NORMAL_WAVE_PROOF_WORKER_ID];
      const signature = JSON.stringify([
        snapshot.simulationTick,
        wave.phase,
        wave.releasedDemand,
        wave.queueByNeed.reception,
        wave.queueByNeed.food,
        wave.activeByNeed.reception,
        wave.activeByNeed.food,
        wave.servedByNeed.reception,
        wave.servedByNeed.food,
        workerNeed,
        wave.result?.rating ?? null,
        wave.result?.bottleneckCause ?? null,
        wave.result?.guidance ?? null
      ]);

      if (signature === renderedSignature) {
        return;
      }

      renderedSignature = signature;

      waveStatus.text =
        `Phase: ${wave.phase} · demand ${wave.releasedDemand}/${wave.tuning.totalDemand}`;

      const serviceText = (need: NormalWaveNeedId): string => [
        labelNeed(need),
        `Waiting: ${wave.queueByNeed[need]}`,
        `Active: ${wave.activeByNeed[need]}`,
        `Capacity: ${normalWaveServiceCapacity(snapshot, need)}/tick`,
        `Served: ${wave.servedByNeed[need]}`,
        workerNeed === need ? 'Worker assigned' : 'No Worker'
      ].join('\n');

      receptionStatus.text = serviceText('reception');
      foodStatus.text = serviceText('food');

      resultStatus.text = wave.result === null
        ? 'Waiting, active service and Worker movement project canonical core state.'
        : [
            `Result: ${wave.result.rating}★ · bottleneck ${labelNeed(wave.result.bottleneckNeed)}`,
            `Cause: ${wave.result.bottleneckCause}. ${wave.result.guidance}`
          ].join('\n');
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

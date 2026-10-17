import {
  Application,
  Container,
  Graphics,
  Text
} from 'pixi.js';

import {
  NORMAL_SERVICE_CATALOG,
  NORMAL_SERVICE_IDS,
  normalWaveServiceCapacity,
  type BootstrapState,
  type NormalWaveNeedId
} from '../core/state';

function labelNeed(need: NormalWaveNeedId): string {
  const service = NORMAL_SERVICE_CATALOG[need];
  return `${service.buildingLabel} · ${service.needLabel}`;
}


export class PixiProjection {
  private app: Application | null = null;
  private disposed = false;
  private frameRequest: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  async mount(
    host: HTMLElement,
    readState: () => BootstrapState,
    onSelectNeed?: (need: NormalWaveNeedId) => void
  ): Promise<void> {
    const app = new Application();
    const maxBackingPixels = 1_500_000;

    await app.init({
      width: 1,
      height: 1,
      resolution: 1,
      autoDensity: true,
      antialias: true,
      autoStart: false,
      background: 0x0f1720
    });

    if (this.disposed) {
      app.destroy(true);
      return;
    }

    this.app = app;
    host.replaceChildren(app.canvas);

    const resizeRenderer = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      const resolution = Math.min(
        1,
        Math.max(0.5, Math.sqrt(maxBackingPixels / (width * height)))
      );
      app.renderer.resize(width, height, resolution);
      app.renderer.render(app.stage);
    };

    this.resizeObserver = new ResizeObserver(resizeRenderer);
    this.resizeObserver.observe(host);
    resizeRenderer();

    const island = new Graphics()
      .ellipse(520, 350, 430, 270)
      .fill(0x2d765f)
      .ellipse(520, 370, 355, 215)
      .fill(0x5f9d68);

    const lagoon = new Graphics()
      .ellipse(450, 430, 150, 72)
      .fill(0x38a8ba);

    const header = new Graphics()
      .roundRect(32, 32, 560, 120, 18)
      .fill(0x183244);

    const serviceLayer = new Container();
    const servicePositions: Record<NormalWaveNeedId, readonly [number, number]> = {
      reception: [520, 180], food: [310, 330], drinks: [735, 330], relax: [420, 475], oceanView: [720, 505]
    };
    let serviceNeedKey = '';
    let serviceStatuses: Array<{ need: NormalWaveNeedId; frame: Graphics; status: Text }> = [];
    const reconcileServices = (needs: readonly NormalWaveNeedId[]) => {
      const key = needs.join('|');
      if (key === serviceNeedKey) return;
      for (const child of serviceLayer.removeChildren()) child.destroy();
      serviceStatuses = needs.map((need) => {
        const [x, y] = servicePositions[need];
        const frame = new Graphics()
          .poly([-78, 18, 0, -26, 78, 18, 0, 62])
          .fill(0x315e4c)
          .roundRect(-58, -44, 116, 72, 14)
          .fill(0x183b43)
          .rect(-44, -56, 88, 16)
          .fill(0xd8c59a);
        frame.position.set(x, y);
        frame.eventMode = 'static';
        frame.cursor = 'pointer';
        frame.on('pointertap', () => onSelectNeed?.(need));
        const status = new Text({ text: '', style: { fill: 0xf7fbf4, fontSize: 14, lineHeight: 20, align: 'center' } });
        status.anchor.set(0.5, 0);
        status.position.set(x, y - 30);
        serviceLayer.addChild(frame, status);
        return { need, frame, status };
      });
      serviceNeedKey = key;
    };
    reconcileServices(NORMAL_SERVICE_IDS);

    const title = new Text({
      text: 'SUNSHORE RESORT',
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
      island,
      lagoon,
      header,
      serviceLayer,
      title,
      waveStatus,
      resultStatus
    );

    let renderedSignature = '';

    const renderFrame = () => {
      if (this.disposed) return;
      this.frameRequest = requestAnimationFrame(renderFrame);
      const snapshot = readState();
      const wave = snapshot.normalWave;
      reconcileServices(NORMAL_SERVICE_IDS);
      const workerAssignments = Object.entries(wave.workerAssignments);
      const signature = JSON.stringify([
        wave.phase,
        wave.releasedDemand,
        ...wave.activeNeedIds.flatMap(need => [
          wave.queueByNeed[need],
          wave.activeByNeed[need],
          wave.servedByNeed[need]
        ]),
        ...workerAssignments.flat(),
        wave.result?.rating ?? null,
        wave.result?.bottleneckCause ?? null,
        wave.result?.guidance ?? null
      ]);

      if (signature === renderedSignature) {
        return;
      }

      renderedSignature = signature;

      waveStatus.text =
        `${wave.phase === 'awaiting' ? 'Ready for guests' : wave.phase === 'complete' ? 'Day complete' : `Guests ${wave.releasedDemand}/${wave.tuning.totalDemand}`}`;

      const serviceText = (need: NormalWaveNeedId): string => {
        const unlocked = need === 'relax' ? snapshot.purchasedAreas.pool : need === 'oceanView' ? snapshot.purchasedAreas.bungalows : true;
        if (!unlocked) return [NORMAL_SERVICE_CATALOG[need].buildingLabel, 'LOCKED'].join('\n');
        const assigned = workerAssignments.filter(([, assignedNeed]) => assignedNeed === need).length;
        const waiting = wave.queueByNeed[need];
        return [
          NORMAL_SERVICE_CATALOG[need].buildingLabel.toUpperCase(),
          NORMAL_SERVICE_CATALOG[need].needLabel,
          waiting > 0 ? waiting + ' waiting' : 'Flowing',
          assigned + ' worker' + (assigned === 1 ? '' : 's')
        ].join('\n');
      };

      for (const { need, frame, status } of serviceStatuses) {
        const unlocked = need === 'relax' ? snapshot.purchasedAreas.pool : need === 'oceanView' ? snapshot.purchasedAreas.bungalows : true;
        const waiting = wave.queueByNeed[need];
        const bottleneck = wave.result?.bottleneckNeed === need;
        frame.alpha = unlocked ? 1 : 0.38;
        frame.tint = bottleneck ? 0xffc857 : waiting >= 3 ? 0xff8066 : waiting > 0 ? 0xffcf70 : 0xffffff;
        frame.scale.set(bottleneck ? 1.08 : waiting > 0 ? 1.035 : 1);
        status.text = serviceText(need);
        status.alpha = unlocked ? 1 : 0.55;
      }

      resultStatus.text = wave.result === null
        ? 'Tap a resort building to manage it.'
        : [
            `Result: ${wave.result.rating}★ · bottleneck ${labelNeed(wave.result.bottleneckNeed)}`,
            `Cause: ${wave.result.bottleneckCause}. ${wave.result.guidance}`
          ].join('\n');

      app.renderer.render(app.stage);
    };

    this.frameRequest = requestAnimationFrame(renderFrame);
  }

  destroy(): void {
    this.disposed = true;

    if (this.frameRequest !== null) {
      cancelAnimationFrame(this.frameRequest);
      this.frameRequest = null;
    }

    if (this.resizeObserver !== null) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.app !== null) {
      this.app.destroy(true);
      this.app = null;
    }
  }
}

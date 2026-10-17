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
    onSelectNeed?: (need: NormalWaveNeedId) => void,
    readSelectedNeed?: () => NormalWaveNeedId
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
      const worldScale = Math.min(width / 1040, height / 650);
      app.stage.scale.set(worldScale);
      app.stage.position.set((width - 1040 * worldScale) / 2, Math.max(0, (height - 650 * worldScale) / 2));
      app.renderer.render(app.stage);
    };

    this.resizeObserver = new ResizeObserver(resizeRenderer);
    this.resizeObserver.observe(host);
    resizeRenderer();

    const ocean = new Graphics()
      .rect(0, 0, 1040, 650).fill(0x197b91)
      .ellipse(150, 92, 125, 20).fill(0x35a0ae)
      .ellipse(890, 142, 145, 24).fill(0x35a0ae)
      .ellipse(120, 555, 150, 22).fill(0x35a0ae);

    const beach = new Graphics()
      .ellipse(520, 355, 458, 292).fill(0xe6d29a);

    const island = new Graphics()
      .ellipse(520, 350, 424, 262).fill(0x367a59)
      .ellipse(520, 370, 350, 210).fill(0x67a866);

    const paths = new Graphics()
      .poly([500,600,540,600,548,496,529,392,520,220,500,220,497,392,480,496]).fill(0xd6bd87)
      .poly([510,350,335,320,315,338,500,382]).fill(0xd6bd87)
      .poly([530,350,715,320,735,338,540,382]).fill(0xd6bd87)
      .poly([520,390,404,470,424,492,535,408]).fill(0xd6bd87)
      .poly([540,392,700,486,722,465,550,370]).fill(0xd6bd87);

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
        const frame = new Graphics();
        if (need === 'reception') {
          frame.roundRect(-62,-38,124,78,14).fill(0xf2dfb1)
            .poly([-72,-38,0,-78,72,-38]).fill(0xb96348)
            .roundRect(-15,4,30,36,6).fill(0x755943)
            .rect(-45,-18,25,22).fill(0x6bb5c2)
            .rect(20,-18,25,22).fill(0x6bb5c2);
        } else if (need === 'food') {
          frame.roundRect(-68,-32,136,68,16).fill(0xf0d3a1)
            .poly([-77,-32,0,-68,77,-32]).fill(0xd97e4d)
            .rect(-45,-8,28,30).fill(0x68aeb5)
            .rect(17,-8,28,30).fill(0x68aeb5)
            .roundRect(-11,3,22,33,5).fill(0x77523d);
        } else if (need === 'drinks') {
          frame.roundRect(-64,-22,128,58,18).fill(0xe7c680)
            .rect(-72,-34,144,16).fill(0x73b7b0)
            .roundRect(-13,2,26,34,5).fill(0x76513c)
            .ellipse(-38,-3,12,12).fill(0xe58469)
            .ellipse(38,-3,12,12).fill(0xe58469);
        } else if (need === 'relax') {
          frame.ellipse(0,5,76,49).fill(0xd8c79a)
            .ellipse(0,7,60,36).fill(0x48bfd0)
            .rect(-65,47,130,8).fill(0xb69360);
        } else {
          frame.roundRect(-58,-30,116,66,12).fill(0xf3d7aa)
            .poly([-66,-30,0,-70,66,-30]).fill(0xbd694c)
            .rect(-15,2,30,34).fill(0x76513c)
            .rect(-43,-11,22,20).fill(0x67aebb)
            .rect(21,-11,22,20).fill(0x67aebb);
        }
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

    const areaLayer = new Container();
    const queueLayer = new Container();
    let areaKey = '';
    let queueKey = '';
    const reconcileAreas = (state: BootstrapState) => {
      const key = (state.purchasedAreas.pool ? '1' : '0') + (state.purchasedAreas.bungalows ? '1' : '0');
      if (key === areaKey) return;
      for (const child of areaLayer.removeChildren()) child.destroy();
      if (state.purchasedAreas.pool) {
        areaLayer.addChild(new Graphics().roundRect(332,414,180,124,24).fill(0xd8c79a).ellipse(422,472,68,39).fill(0x48bfd0).ellipse(422,472,50,27).fill(0x79dce7));
      } else {
        areaLayer.addChild(new Graphics().roundRect(332,414,180,124,24).stroke({width:3,color:0xffffff,alpha:0.18}));
      }
      if (state.purchasedAreas.bungalows) {
        areaLayer.addChild(new Graphics().roundRect(646,452,82,54,10).fill(0xf0d8a9).poly([638,452,687,416,736,452]).fill(0xb96f4d).roundRect(744,486,82,54,10).fill(0xf0d8a9).poly([736,486,785,450,834,486]).fill(0xb96f4d));
      } else {
        areaLayer.addChild(new Graphics().roundRect(632,424,214,138,24).stroke({width:3,color:0xffffff,alpha:0.18}));
      }
      areaKey = key;
    };

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
      ocean,
      beach,
      island,
      paths,
      lagoon,
      areaLayer,
      queueLayer,
      serviceLayer
    );

    let renderedSignature = '';

    const renderFrame = () => {
      if (this.disposed) return;
      this.frameRequest = requestAnimationFrame(renderFrame);
      const snapshot = readState();
      const wave = snapshot.normalWave;
      const visibleNeeds = NORMAL_SERVICE_IDS.filter((need) => need === 'relax' ? snapshot.purchasedAreas.pool : need === 'oceanView' ? snapshot.purchasedAreas.bungalows : true);
      reconcileServices(visibleNeeds);
      reconcileAreas(snapshot);
      const workerAssignments = Object.entries(wave.workerAssignments);
    const selectedNeed = readSelectedNeed?.() ?? null;
      const signature = JSON.stringify([
      selectedNeed,
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
      const selected = selectedNeed === need;
        frame.alpha = unlocked ? 1 : 0.38;
      frame.tint = bottleneck ? 0xffc857 : selected ? 0xffe7a0 : waiting >= 3 ? 0xff8066 : waiting > 0 ? 0xffcf70 : 0xffffff;
      frame.scale.set(bottleneck ? 1.08 : selected ? 1.065 : waiting > 0 ? 1.035 : 1);
      status.scale.set(selected ? 1.04 : 1);
        status.text = serviceText(need);
        status.alpha = unlocked ? 1 : 0.55;
      }

      const nextQueueKey = visibleNeeds.map((need) => need + ':' + wave.queueByNeed[need]).join('|');
      if (nextQueueKey !== queueKey) {
        for (const child of queueLayer.removeChildren()) child.destroy();
        for (const need of visibleNeeds) {
          const waiting = Math.min(8, wave.queueByNeed[need]);
          const pos = servicePositions[need];
          for (let i = 0; i < waiting; i += 1) {
            const guest = new Graphics().ellipse(0,0,7,9).fill(i % 2 === 0 ? 0xffd086 : 0xf8ede0).ellipse(0,-11,4,4).fill(0xe9b58f);
            guest.position.set(pos[0] - 30 + (i % 4) * 20, pos[1] + 58 + Math.floor(i / 4) * 24);
            queueLayer.addChild(guest);
          }
        }
        queueKey = nextQueueKey;
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

import {
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
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
  return `${service.buildingLabel} / ${service.needLabel}`;
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

    const sceneryLayer = new Container();
    const vegetation = new Graphics()
      .rect(168,205,7,30).fill(0x765d3e).circle(171,198,19).fill(0x2f7b58).circle(157,205,13).fill(0x3b8c63).circle(185,207,13).fill(0x3b8c63)
      .rect(858,236,7,31).fill(0x765d3e).circle(861,228,20).fill(0x2f7b58).circle(846,236,13).fill(0x3b8c63).circle(876,237,13).fill(0x3b8c63)
      .rect(174,486,7,29).fill(0x765d3e).circle(177,479,18).fill(0x2f7b58).circle(164,486,12).fill(0x3b8c63).circle(190,487,12).fill(0x3b8c63)
      .rect(855,500,7,30).fill(0x765d3e).circle(858,492,19).fill(0x2f7b58).circle(844,500,12).fill(0x3b8c63).circle(873,501,12).fill(0x3b8c63);
    vegetation.alpha = 0.92;
    const shoreAccents = new Graphics()
      .ellipse(520,592,250,10).fill(0xf4e5b4)
      .ellipse(515,606,190,5).fill(0xfff0c8)
      .ellipse(92,130,58,5).fill(0x6dc8cc)
      .ellipse(930,188,64,5).fill(0x6dc8cc);
    shoreAccents.alpha = 0.48;
    sceneryLayer.addChild(vegetation, shoreAccents);

    const header = new Graphics()
      .roundRect(32, 32, 560, 120, 18)
      .fill(0x183244);

    const loadWorldTexture = async (path: string) => {
      try { return await Assets.load(path); } catch { return null; }
    };
    const [receptionTexture, restaurantTexture, beachBarTexture, poolTexture, bungalowsTexture] = await Promise.all([
      loadWorldTexture('/assets/world/buildings/reception.svg'),
      loadWorldTexture('/assets/world/buildings/restaurant.svg'),
      loadWorldTexture('/assets/world/buildings/beach-bar.svg'),
      loadWorldTexture('/assets/world/areas/pool.svg'),
      loadWorldTexture('/assets/world/areas/bungalows.svg')
    ]);
    const serviceAssetTextures: Partial<Record<NormalWaveNeedId, typeof receptionTexture>> = {
      reception: receptionTexture, food: restaurantTexture, drinks: beachBarTexture
    };

    const serviceLayer = new Container();
    const servicePositions: Record<NormalWaveNeedId, readonly [number, number]> = {
      reception: [520, 180], food: [310, 330], drinks: [735, 330], relax: [420, 475], oceanView: [720, 505]
    };
    let serviceNeedKey = '';
    let serviceStatuses: Array<{ need: NormalWaveNeedId; frame: Graphics; status: Text; levelDecor: Graphics; art?: Sprite }> = [];
    const reconcileServices = (needs: readonly NormalWaveNeedId[]) => {
      const key = needs.join('|');
      if (key === serviceNeedKey) return;
      for (const child of serviceLayer.removeChildren()) child.destroy();
      serviceStatuses = needs.map((need) => {
        const [x, y] = servicePositions[need];
        const frame = new Graphics();
        const texture = serviceAssetTextures[need];
        if (texture) frame.hitArea = new Rectangle(-77, -61.5, 154, 109);
        if (!texture) {
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
        }
        let art: Sprite | undefined;
        if (texture) {
          art = new Sprite(texture);
          art.anchor.set(0.5);
          art.position.set(0, -7);
          art.width = 154;
          art.height = 109;
          art.eventMode = 'none';
          frame.addChild(art);
        }
        const levelDecor = new Graphics();
        levelDecor.position.set(x, y);
        const plot = new Graphics().ellipse(0, 34, 82, 24).fill(0x315f51);
        plot.alpha = 0.34;
        plot.position.set(x, y);
        const plate = new Graphics().roundRect(-76, -22, 152, 44, 10).fill(0x102f3a);
        plate.alpha = 0.92;
        plate.position.set(x, y - 82);
        frame.position.set(x, y);
        frame.eventMode = 'static';
        frame.cursor = 'pointer';
        frame.on('pointerdown', () => frame.scale.set(0.96));
        frame.on('pointerup', () => frame.scale.set(1));
        frame.on('pointerupoutside', () => frame.scale.set(1));
        frame.on('pointerout', () => frame.scale.set(1));
        frame.on('pointertap', () => { burst('SELECT', need, 0xffe08a); onSelectNeed?.(need); });
        const status = new Text({ text: '', style: { fill: 0xf7fbf4, fontSize: 13, lineHeight: 16, fontWeight: '700', align: 'center' } });
        status.anchor.set(0.5);
        status.position.set(x, y - 82);
        serviceLayer.addChild(plot, levelDecor, frame, plate, status);
        return { need, frame, status, levelDecor, art };
      });
      serviceNeedKey = key;
    };
    reconcileServices(NORMAL_SERVICE_IDS);

    const areaLayer = new Container();
    const motionLayer = new Container();
    const queueLayer = new Container();
    const occupancyLayer = new Container();
    const workerLayer = new Container();
    const effectLayer = new Container();
    let areaKey = '';
    let queueKey = '';
    let occupancyKey = '';
    let workerKey = '';
    let motionKey = '';
    let movers: Array<{ node: Graphics; need: NormalWaveNeedId; offset: number; speed: number }> = [];
    const effects: Array<{ node: Container; x: number; y: number; at: number }> = [];
    const burst = (label: string, need: NormalWaveNeedId | null, color = 0xffe08a) => {
      const [x,y] = need === null ? [520,270] : servicePositions[need];
      const node = new Container();
      const ring = new Graphics().circle(0,0,28).stroke({width:3,color,alpha:0.9});
      const text = new Text({text:label,style:{fill:color,fontSize:15,fontWeight:'700'}}); text.anchor.set(0.5); text.y=-40;
      node.position.set(x,y); node.addChild(ring,text); effectLayer.addChild(node); effects.push({node,x,y,at:performance.now()});
    };
    const guestColors=[0xffd086,0xf8ede0,0x8fd0c7,0xe99a7a,0x9cb8ef];
    const makeGuest=(i:number,scale=1)=>{const g=new Graphics().ellipse(0,9,8,3).fill(0x164855).ellipse(0,0,7,10).fill(guestColors[i%guestColors.length]).circle(0,-11,4).fill(0xe9b58f);g.scale.set(scale);return g;};
    const syncMovers=(wave:BootstrapState['normalWave'],needs:readonly NormalWaveNeedId[])=>{
      const active=wave.phase==='incoming'?needs:[];
      const count=active.length===0?0:Math.min(6,Math.max(0,wave.tuning.totalDemand-wave.releasedDemand));
      const key=wave.phase+'|'+wave.releasedDemand+'|'+active.join('|');if(key===motionKey)return;
      for(const child of motionLayer.removeChildren())child.destroy();movers=[];
      for(let i=0;i<count;i++){const need=active[i%active.length];const node=makeGuest(i,.9);motionLayer.addChild(node);movers.push({node,need,offset:count<=1?0:i/count,speed:.11+(i%3)*.012});}
      motionKey=key;
    };
    const animateWorld = (now: number, wave: BootstrapState['normalWave'], selected: NormalWaveNeedId | null) => {
      const sec=now/1000;
      for(const m of movers){const [tx,ty]=servicePositions[m.need],p=(sec*m.speed+m.offset)%1,arc=Math.sin(p*Math.PI),sx=520+Math.sin(m.offset*Math.PI*2)*54;m.node.position.set(sx+(tx-sx)*p+Math.sin(p*Math.PI*2+m.offset*9)*5,610+(ty-610)*p-arc*20);m.node.alpha=Math.min(.9,Math.min(p*5,(1-p)*5));m.node.scale.set(.85+arc*.18);}
      queueLayer.position.y=Math.sin(sec*3.2)*2;
      for(const {need,frame} of serviceStatuses){const q=wave.queueByNeed[need],level=wave.buildingLevelsByNeed[need],growth=1+(level-1)*.085,base=wave.result?.bottleneckNeed===need?1.08:selected===need?1.065:q>0?1.035:1,pulse=q>0?1+Math.sin(sec*4.5+NORMAL_SERVICE_IDS.indexOf(need))*Math.min(.025,.009+q*.003):1;frame.scale.set(base*growth*pulse);}
      for(let i=effects.length-1;i>=0;i--){const e=effects[i],p=(now-e.at)/900;if(p>=1){effectLayer.removeChild(e.node);e.node.destroy({children:true});effects.splice(i,1);}else{e.node.position.set(e.x,e.y-p*22);e.node.alpha=1-p;e.node.scale.set(.88+Math.sin(p*Math.PI)*.22);}}
    };
    const syncWorldActors=(state:BootstrapState,needs:readonly NormalWaveNeedId[])=>{
      const wave=state.normalWave;
      const qk=needs.map(n=>n+':'+wave.queueByNeed[n]).join('|');
      if(qk!==queueKey){for(const c of queueLayer.removeChildren())c.destroy();for(const n of needs){const [x,y]=servicePositions[n],count=Math.min(8,wave.queueByNeed[n]);for(let j=0;j<count;j++){const g=makeGuest(j);g.position.set(x-30+(j%4)*20,y+62+Math.floor(j/4)*24);queueLayer.addChild(g);}}queueKey=qk;}
      const ok=needs.map(n=>n+':'+wave.activeByNeed[n]+':'+normalWaveServiceCapacity(state,n)).join('|');
      if(ok!==occupancyKey){for(const c of occupancyLayer.removeChildren())c.destroy();for(const n of needs){const [x,y]=servicePositions[n],cap=Math.min(6,normalWaveServiceCapacity(state,n)),active=Math.min(cap,wave.activeByNeed[n]);for(let j=0;j<cap;j++){const slot=new Graphics().ellipse(0,0,10,5).fill(j<active?0x367a59:0xbcae82);slot.alpha=j<active?.9:.45;slot.position.set(x-(cap-1)*9+j*18,y+42);occupancyLayer.addChild(slot);if(j<active){const g=makeGuest(j+2,.82);g.position.set(slot.x,slot.y-8);occupancyLayer.addChild(g);}}}occupancyKey=ok;}
      const wk=needs.map(n=>n+':'+Object.entries(wave.workerAssignments).filter(([,v])=>v===n).map(([id])=>id).join(',')).join('|');
      if(wk!==workerKey){for(const c of workerLayer.removeChildren())c.destroy();for(const n of needs){const [x,y]=servicePositions[n],assigned=Object.entries(wave.workerAssignments).filter(([,v])=>v===n);assigned.forEach(([,id],j)=>{const w=new Container(),body=new Graphics().ellipse(0,7,7,3).fill(0x164855).roundRect(-6,-8,12,18,4).fill(0x4f8f6b).circle(0,-13,5).fill(0xdca77f).rect(-6,-19,12,4).fill(0xffd56d),badge=new Text({text:'W',style:{fill:0xffffff,fontSize:8,fontWeight:'700'}});badge.anchor.set(.5);w.addChild(body,badge);w.position.set(x-52+j*18,y-42);w.label=id;workerLayer.addChild(w);});}workerKey=wk;}
    };

    const reconcileAreas = (state: BootstrapState) => {
      const key = (state.purchasedAreas.pool ? '1' : '0') + (state.purchasedAreas.bungalows ? '1' : '0');
      if (key === areaKey) return;
      for (const child of areaLayer.removeChildren()) child.destroy();
      if (state.purchasedAreas.pool) {
        if (poolTexture) {
          const poolArt = new Sprite(poolTexture); poolArt.anchor.set(0.5); poolArt.position.set(423,473); poolArt.width=206; poolArt.height=144; poolArt.eventMode='none'; areaLayer.addChild(poolArt);
        } else areaLayer.addChild(new Graphics().roundRect(320,402,206,142,28).fill(0xd8c79a).ellipse(422,472,72,42).fill(0x48bfd0).ellipse(422,472,54,30).fill(0x79dce7).rect(342,430,34,8).fill(0xf6e8ba).rect(468,430,34,8).fill(0xf6e8ba).circle(352,421,12).fill(0xe8906f).circle(492,421,12).fill(0xe8906f).rect(349,422,6,25).fill(0x8b6948).rect(489,422,6,25).fill(0x8b6948));
      } else {
        areaLayer.addChild(new Graphics().roundRect(332,414,180,124,24).stroke({width:3,color:0xffffff,alpha:0.18}));
      }
      if (state.purchasedAreas.bungalows) {
        if (bungalowsTexture) {
          const bungalowArt = new Sprite(bungalowsTexture); bungalowArt.anchor.set(0.5); bungalowArt.position.set(736,485); bungalowArt.width=240; bungalowArt.height=155; bungalowArt.eventMode='none'; areaLayer.addChild(bungalowArt);
        } else areaLayer.addChild(new Graphics().roundRect(620,406,232,158,26).fill(0xd8c79a).roundRect(638,448,82,54,10).fill(0xf0d8a9).poly([630,448,679,412,728,448]).fill(0xb96f4d).roundRect(744,486,82,54,10).fill(0xf0d8a9).poly([736,486,785,450,834,486]).fill(0xb96f4d).roundRect(730,414,72,46,9).fill(0xf4dfb8).poly([723,414,766,383,809,414]).fill(0xc17855).circle(662,526,12).fill(0x3b8c63).circle(815,443,13).fill(0x3b8c63).circle(826,527,11).fill(0x3b8c63));
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
      sceneryLayer,
      areaLayer,
      motionLayer,
      queueLayer,
      serviceLayer,
      occupancyLayer,
      workerLayer,
      effectLayer
    );

    type VisualState = { phase:string; waveNumber:number; pool:boolean; bungalows:boolean; energy:NormalWaveNeedId|null; workers:Record<string,NormalWaveNeedId|undefined>; levels:Record<NormalWaveNeedId,number>; queues:Record<NormalWaveNeedId,number> };
    let previousVisual: VisualState | null = null;
    const visual = (state: BootstrapState): VisualState => ({phase:state.normalWave.phase,waveNumber:state.currentWaveNumber,pool:state.purchasedAreas.pool,bungalows:state.purchasedAreas.bungalows,energy:state.normalWave.energyMode?.need??null,workers:{...state.normalWave.workerAssignments},levels:{...state.normalWave.buildingLevelsByNeed},queues:{...state.normalWave.queueByNeed}});
    const emitChanges = (before: VisualState, after: VisualState) => {
      if(!before.pool&&after.pool){burst('POOL OPEN','relax',0x8ce7ef);burst('RESORT EXPANDS',null,0x8ce7ef);} if(!before.bungalows&&after.bungalows){burst('BUNGALOWS OPEN','oceanView',0xffd99b);burst('RESORT EXPANDS',null,0xffd99b);} if(before.energy!==after.energy&&after.energy)burst('BOOST',after.energy,0x8ce7ef);
      for(const need of NORMAL_SERVICE_IDS){const bw=Object.values(before.workers).filter(v=>v===need).length,aw=Object.values(after.workers).filter(v=>v===need).length;if(aw>bw)burst('WORKER +1',need,0xa7f3b4);if(after.levels[need]>before.levels[need])burst('LEVEL UP',need);if(before.queues[need]===0&&after.queues[need]>0)burst('QUEUE',need,0xff9b7f);}
      if(before.phase!=='complete'&&after.phase==='complete'){const final=after.waveNumber>=8,color=final?0xffdf86:0xa7f3b4;burst(final?'RESORT COMPLETE':'WAVE CLEAR',null,color);for(const need of NORMAL_SERVICE_IDS){if(need==='relax'&&!after.pool)continue;if(need==='oceanView'&&!after.bungalows)continue;burst('',need,color);}}
    };
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
        snapshot.currentWaveNumber,
        snapshot.purchasedAreas.pool,
        snapshot.purchasedAreas.bungalows,
        wave.phase,
        wave.releasedDemand,
        wave.energyMode?.need ?? null,
        ...NORMAL_SERVICE_IDS.map(need => wave.buildingLevelsByNeed[need]),
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

      if (signature !== renderedSignature) {
        const currentVisual = visual(snapshot);
        if (previousVisual !== null) emitChanges(previousVisual, currentVisual);
        previousVisual = currentVisual;
        renderedSignature = signature;

      waveStatus.text =
        `${wave.phase === 'awaiting' ? 'Ready for guests' : wave.phase === 'complete' ? 'Day complete' : `Guests ${wave.releasedDemand}/${wave.tuning.totalDemand}`}`;

      const serviceText = (need: NormalWaveNeedId): string => {
        const unlocked = need === 'relax' ? snapshot.purchasedAreas.pool : need === 'oceanView' ? snapshot.purchasedAreas.bungalows : true;
        const building = NORMAL_SERVICE_CATALOG[need].buildingLabel.toUpperCase();
        if (!unlocked) return [building, 'LOCKED'].join('\n');
        const assigned = workerAssignments.filter(([, assignedNeed]) => assignedNeed === need).length;
        const waiting = wave.queueByNeed[need];
        const level = wave.buildingLevelsByNeed[need];
        return [building, 'LV' + level + ' | ' + (waiting > 0 ? waiting + ' WAITING' : 'FLOWING') + ' | ' + assigned + 'W'].join('\n');
      };

      for (const { need, frame, status, levelDecor } of serviceStatuses) {
        const unlocked = need === 'relax' ? snapshot.purchasedAreas.pool : need === 'oceanView' ? snapshot.purchasedAreas.bungalows : true;
        const waiting = wave.queueByNeed[need];
        const level = wave.buildingLevelsByNeed[need];
        levelDecor.clear();
        if(unlocked&&level>=2)levelDecor.roundRect(-100,-24,30,64,9).fill(0xd9bb7a).roundRect(70,-24,30,64,9).fill(0xd9bb7a).roundRect(-92,22,184,30,11).fill(0xc6a76b).roundRect(-94,-36,188,94,22).stroke({width:5,color:0xe4c879,alpha:.66});
        if(unlocked&&level>=3)levelDecor.roundRect(-112,-34,24,78,8).fill(0xf0cf7a).roundRect(88,-34,24,78,8).fill(0xf0cf7a).poly([-92,-44,0,-94,92,-44]).fill(0xc96f4c).stroke({width:3,color:0xffe4a0,alpha:.9}).circle(-78,-60,7).fill(0xffd56d).circle(0,-78,8).fill(0xffd56d).circle(78,-60,7).fill(0xffd56d);
        const bottleneck = wave.result?.bottleneckNeed === need;
      const selected = selectedNeed === need;
        frame.alpha = unlocked ? 1 : 0.38;
      frame.tint = bottleneck ? 0xffc857 : selected ? 0xffe7a0 : waiting >= 3 ? 0xff8066 : waiting > 0 ? 0xffcf70 : 0xffffff;
      frame.scale.set(bottleneck ? 1.08 : selected ? 1.065 : waiting > 0 ? 1.035 : 1);
      status.scale.set(selected ? 1.04 : 1);
        status.text = serviceText(need);
        status.alpha = unlocked ? 1 : 0.55;
      }

      syncWorldActors(snapshot, visibleNeeds);

      resultStatus.text = wave.result === null
        ? 'Tap a resort building to manage it.'
        : [
            `Result: ${wave.result.rating}/5 | bottleneck ${labelNeed(wave.result.bottleneckNeed)}`,
            `Cause: ${wave.result.bottleneckCause}. ${wave.result.guidance}`
          ].join('\n');

      }

      syncMovers(wave, visibleNeeds.filter(need => wave.activeNeedIds.includes(need)));
      animateWorld(performance.now(), wave, selectedNeed);
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

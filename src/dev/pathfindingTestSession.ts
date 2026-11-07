import {pmoRouteStepsConflict} from '../render/spatialMeta/pmoRouteConflict';
import type {PmoLiftTransit} from '../render/spatialMeta/pmoLiftTransit';
/** RRH dev pathfinding harness. Uses the production PMO terrain connector +
 *  compiled brush graph; it cannot mutate the game Core or authored registry. */
import {
  planBrushCorridorRoute,
  type BrushGraph, type PmoTerrainConnector, type SpatialPoint,
} from '../render/spatialMeta/pmoBrushCorridors';
import { PmoPedestrianRuntime, type PedestrianSnapshot } from '../render/spatialMeta/pmoPedestrianRuntime';
import { generatePmoDevBuildings, seededRandom, type BuildingScenario, type CanonicalPmoBuildingSite } from './pmoDevBuildings';
import { certifyWalkMotion } from './pmoWalkMotionAudit';

export const BEACH_STAIRS_SOURCE_ID = 'pmo-3ae6a767-a0f4-40af-b982-ec36346bebe6';
export const AUTHORED_BEACH_STAIRS_FOOT: SpatialPoint = [1.6739, -2.2456, 4.5734];
const distance = (a:readonly number[],b:readonly number[]) => Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

/** Must be truly on PMO-authorized *beach* terrain, not a surrogate inland node. */
export function choosePmoBeachStart(graph: BrushGraph, foot: SpatialPoint = AUTHORED_BEACH_STAIRS_FOOT): SpatialPoint | null {
  const beach = graph.nodes.filter(n => n.point[1] < -1.65 && distance(n.point,foot) <= 0.85);
  beach.sort((a,b)=>distance(a.point,foot)-distance(b.point,foot));
  return beach.length ? [...beach[0].point] : null;
}

export interface TestRuntimeResult { accepted:number; queued:number; rejected:readonly string[]; }
interface PendingGuest { name:string; seed:number; attempts:number; }
export interface WaveProgress { queued:number; emitted:number; rejected:readonly string[]; holdReason:string|null; }

export class PathfindingTestSession {
  readonly pedestrians: PmoPedestrianRuntime;
  readonly beachStart: SpatialPoint;
  scenario: BuildingScenario | null = null;
  private nextGuest = 0;
  private pending:PendingGuest[]=[];
  private pendingClock=0;
  private emitted=0;
  private waveRejects:string[]=[];
  private readonly beachNodes:readonly SpatialPoint[];
  private destinations = new Map<string, string>();
  private readonly graph: BrushGraph;
  private readonly connector: PmoTerrainConnector;
  private readonly buildingZones: readonly CanonicalPmoBuildingSite[];
  private readonly liftTransit?:PmoLiftTransit;

  constructor(graph: BrushGraph, connector: PmoTerrainConnector, beachStart: SpatialPoint,
    samplePhysicalHelper?: NonNullable<ConstructorParameters<typeof PmoPedestrianRuntime>[2]>['samplePhysicalHelper'],
    buildingZones: readonly CanonicalPmoBuildingSite[] = [],liftTransit?:PmoLiftTransit) {
    this.graph=graph;this.connector=connector;this.beachStart=[...beachStart];
    this.buildingZones=buildingZones;this.liftTransit=liftTransit;
    this.pedestrians=new PmoPedestrianRuntime(graph,connector,{collisionSpacing:0.075,
      canEnterHelper:(helper,from,actor)=>helper.kind!=='lift'||!!liftTransit?.reserve(helper,from,actor),
      onHelperExit:(helper,actor)=>{if(helper.kind==='lift')liftTransit?.release(helper,actor);},
      samplePhysicalHelper:(helper,t,from,to,actor)=>helper.kind==='lift'
        ?liftTransit?.ride(helper,t,from,to,actor)??null
        :samplePhysicalHelper?.(helper,t,from,to,actor)??null});
    // Only true connected beach PMO nodes are permitted to spawn. Cache once.
    const first=graph.nodes.reduce((best,node)=>distance(node.point,beachStart)<distance(graph.nodes[best].point,beachStart)?node.id:best,0);
    const component=new Set<number>([first]), queue=[first];
    for(let head=0;head<queue.length;head++)for(const edge of graph.neighbors[queue[head]]){
      if(!component.has(edge.to)){component.add(edge.to);queue.push(edge.to);}
    }
    this.beachNodes=graph.nodes.filter(node=>component.has(node.id)&&node.point[1]<-1.65&&
      distance(node.point,beachStart)<0.82).map(node=>[...node.point]);
  }
  private motionSafeRoute(from: SpatialPoint, to: SpatialPoint): boolean {
    // The route must be selected using the same directed microstep attachment
    // gate as PmoPedestrianRuntime.plan(). Otherwise a coarse shortest path can
    // pick an unsafe start/end attachment, then fail our post-hoc audit even
    // when a longer, physically certified attachment is available.
    const candidate=planBrushCorridorRoute(this.graph,this.connector,from,to,0.26,
      (a,b)=>certifyWalkMotion(a,b,this.graph,this.connector)===null);
    if(candidate.status!=='READY')return false;
    // Interior walking edges have already been microstep-audited by the
    // production compiled graph adaptor; retain the fail-closed check here.
    return candidate.steps.every(step=>step.kind!=='walk'||
      certifyWalkMotion(step.from,step.to,this.graph,this.connector)===null);
  }
  /** Relayout only active journeys. Completed guests do not start a second journey:
   *  bulk-resurrecting arrived guests bypassed single-lane admission, producing
   *  the 9 waiting / 2 blocked congestion seen in the canonical 9/9 stand.
   *  Preview all active routes before committing the new layout. */
  shuffle(seed:number): { scenario:BuildingScenario; rerouted:number; blocked:number } {
    const makeLayout=(candidateSeed:number)=>generatePmoDevBuildings(this.graph,this.connector,candidateSeed,{
      desiredEntry:this.beachStart,minBuildingSpacing:0.66,requireReachable:false,
      allowedSites:this.buildingZones
    });
    const snapshots=this.pedestrians.snapshots();
    if(snapshots.some(actor=>actor.status==='blocked'))
      throw Error('PMO_TEST_STALLED_ACTORS_RESET_REQUIRED');
    const active=snapshots.filter(actor=>actor.status!=='arrived');
    let next:BuildingScenario|null=null;
    for(let attempt=0;attempt<=64;attempt++){
      const candidate=makeLayout((seed+Math.imul(attempt,0x9e3779b9))>>>0);
      if(candidate.buildings.length!==5)
        throw Error('PMO_TEST_RESHUFFLE_NEEDS_FIVE_AUTHORED_SITES:'+candidate.failures.join(','));
      if(candidate.stats.reachableBuildings===0)continue;
      // A certified beach route is necessary but not sufficient when an actor
      // is already standing elsewhere. Reject the proposed layout *without*
      // changing any actor or the committed scenario if it has no safe replan.
      const safe=active.every(actor=>{
        const name=this.destinations.get(actor.id);
        const target=candidate.buildings.find(b=>b.name===name);
        if(!target||target.routeStatus!=='READY'||!target.arrivalPoint)return false;
        const preview=this.pedestrians.previewReroute(actor.id,target.arrivalPoint);
        return preview.status==='READY' && (actor.helperId!==null||
          preview.steps.every(step=>step.kind!=='walk'||
            certifyWalkMotion(step.from,step.to,this.graph,this.connector)===null));
      });
      if(safe){next=candidate;break;}
    }
    if(!next)throw Error('PMO_TEST_RESHUFFLE_NO_PHYSICALLY_SAFE_LAYOUT');
    this.scenario=next;
    let rerouted=0,blocked=0;
    for(const actor of active){
      const name=this.destinations.get(actor.id);
      const target=next.buildings.find(b=>b.name===name)!;
      const result=this.pedestrians.reroute(actor.id,target.arrivalPoint!);
      if(result.status==='READY')rerouted++;
      else {this.pedestrians.halt(actor.id,'RESHUFFLE_'+result.reason);blocked++;}
    }
    return {scenario:next,rerouted,blocked};
  }
  // Release guests progressively. The old implementation placed twelve bodies
  // into a narrow PMO footpath within one frame and could mutually obstruct them.
  // Spawn still occurs ONLY on real connected beach walk nodes, with no jump.
  spawnWave(count=12,seed=0x51feed): TestRuntimeResult {
    if(!Number.isInteger(count)||count<1||count>40)throw Error('PMO_TEST_INVALID_WAVE_SIZE');
    const targets=this.scenario?.buildings.filter(b=>b.routeStatus==='READY'&&b.arrivalPoint)??[];
    if(!targets.length)throw Error('PMO_TEST_NO_REACHABLE_BUILDINGS');
    if(!this.beachNodes.length)throw Error('PMO_TEST_NO_CONNECTED_BEACH_SPAWN');
    if(this.pending.length+count>160)throw Error('PMO_TEST_WAVE_QUEUE_FULL');
    if(this.pedestrians.snapshots().some(actor => actor.status==='blocked'))
      throw Error('PMO_TEST_STALLED_ACTORS_RESET_REQUIRED');
    if(this.pending.length)
      throw Error('PMO_TEST_CURRENT_WAVE_STILL_SPAWNING');
    const rand=seededRandom(seed);
    for(let i=0;i<count;i++)this.pending.push({name:targets[Math.floor(rand()*targets.length)].name,seed:Math.floor(rand()*0xffffffff),attempts:0});
    // Admit one immediately to make the motion trace observable, then use timed
    // beach arrivals instead of simultaneous overlapping actors.
    const before=this.emitted;
    this.admitOne();
    return {accepted:this.emitted-before,queued:this.pending.length,rejected:[...this.waveRejects]};
  }
  private admitOne():void {
    // The authored beach-to-stairs throat cannot release an additional body
    // until every previous non-arrived body has left the spawn throat.
    // Holding the wave is preferable to a mutually blocked knot of pedestrians.
    const existing=this.pedestrians.snapshots();
    if(existing.some(actor => actor.status==='blocked')) return;
    if(existing.some(actor => actor.status==='waiting-space' &&
      distance(actor.position,this.beachStart)<0.92)) return;
    if(existing.some(actor => actor.status!=='arrived' &&
      distance(actor.position,this.beachStart)<0.66)) return;
    const item=this.pending[0];if(!item)return;
    const target=this.scenario?.buildings.find(b=>b.name===item.name);
    // Until single-lane traffic arbitration exists, the DEV acceptance wave
    // releases only one active pedestrian at a time. On the canonical island,
    // two pedestrians travelling in opposite directions can otherwise both
    // wait indefinitely at narrow PMO approaches. Preserve physical collision
    // and grade checks; never mark a stranded guest as arrived.
    const active=existing.filter(a=>a.status!=='arrived'&&a.status!=='blocked');
    const reservations=active.map(actor=>{
      if(actor.helperId!==null)return null;
      const site=this.scenario?.buildings.find(b=>b.name===this.destinations.get(actor.id));
      if(!site?.arrivalPoint)return null;
      const route=this.pedestrians.previewReroute(actor.id,site.arrivalPoint);
      return route.status==='READY'?route.steps:null;
    });
    if(reservations.some(route=>route===null))return;
    if(!target||target.routeStatus!=='READY'||!target.arrivalPoint){
      this.waveRejects.push(item.name+':NO_CERTIFIED_DESTINATION');this.pending.shift();return;
    }
    const occupied=this.pedestrians.snapshots().filter(p=>p.status!=='arrived'&&p.status!=='blocked').map(p=>p.position);
    const rand=seededRandom(item.seed+item.attempts >>> 0);
    const candidates=this.beachNodes.filter(p=>!occupied.some(q=>distance(q,p)<0.15));
    if(!candidates.length){
      if(++item.attempts>150){this.waveRejects.push(item.name+':BEACH_SPAWN_SATURATED');this.pending.shift();}
      return;
    }
    for(let j=0;j<Math.min(35,candidates.length);j++){
      const p=candidates[Math.floor(rand()*candidates.length)];
      if(!this.motionSafeRoute(p,target.arrivalPoint)) {
        this.waveRejects.push(item.name+':MICROSTEP_ROUTE_UNSAFE_AT_BEACH_SPAWN');
        continue;
      }
      const candidate=planBrushCorridorRoute(this.graph,this.connector,p,target.arrivalPoint,0.26,
        (from,to)=>certifyWalkMotion(from,to,this.graph,this.connector)===null);
      if(candidate.status!=='READY'||reservations.some(route=>pmoRouteStepsConflict(candidate.steps,route!)))continue;
      const id='pmo-test-guest-'+(this.nextGuest+1);
      const result=this.pedestrians.add({id,from:[...p],to:target.arrivalPoint,speed:0.34+rand()*0.12});
      if(result.status==='READY'){
        this.nextGuest++;this.destinations.set(id,item.name);this.pending.shift();this.emitted++;return;
      }
      if(result.reason!=='SPAWN_COLLIDES_WITH_ACTOR'){
        // This is a route/physics error, not spawn congestion.
        this.waveRejects.push(item.name+':'+result.reason);
      }
    }
    if(++item.attempts>150){this.waveRejects.push(item.name+':NO_CERTIFIED_BEACH_SPAWN');this.pending.shift();}
  }
  tick(dt:number):void {
    // The mounted PmoNavigationScope owns the single shared lift clock.
    this.pedestrians.tick(dt);
    this.pendingClock+=dt;
    if(this.pending.length&&this.pendingClock>=0.85){
      this.pendingClock=0;
      this.admitOne();
    }
  }
  /** Development-only, same scenario, no Core events or global state writes. */
  reset():void {
    for(const actor of this.pedestrians.snapshots()) this.pedestrians.remove(actor.id);
    this.destinations.clear();this.pending=[];this.pendingClock=0;
    this.nextGuest=0;this.emitted=0;this.waveRejects=[];
  }
  progress():WaveProgress{
    const actors=this.pedestrians.snapshots();
    let holdReason:string|null=null;
    if(this.pending.length){
      if(actors.some(a=>a.status==='blocked'))holdReason='PHYSICAL_BLOCKED_RESET_REQUIRED';
      else if(actors.some(a=>a.status==='waiting-space'&&distance(a.position,this.beachStart)<0.92))
        holdReason='BEACH_ENTRY_OCCUPIED';
      else if(actors.some(a=>a.status!=='arrived'&&distance(a.position,this.beachStart)<0.66))
        holdReason='AWAIT_LEAD_GUEST_CLEARANCE';
    }
    return {queued:this.pending.length,emitted:this.emitted,rejected:this.waveRejects.slice(-4),holdReason};
  }
  snapshots():readonly PedestrianSnapshot[]{return this.pedestrians.snapshots();}
}

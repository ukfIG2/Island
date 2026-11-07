import type {PmoWaveMotorPort} from './pmoWaveMotorPort';
/**
 * Concrete pedestrian kinematics on a compiled PMO route. This is NOT a Core
 * event or reward issuer: the authoritative witness admission stays elsewhere.
 * No React/R3F dependency; renderer reads snapshots and places instanced meshes.
 */
import {
  type BrushGraph, type HelperKind, HelperQueue,
  type PmoRouteHelper, type PmoTerrainConnector,
  type RouteResult, type RouteStep, type SpatialPoint,
  planBrushCorridorRoute,
} from './pmoBrushCorridors';
import {attemptCertifiedWalkStep,certifyDirectedWalk} from './pmoWalkKinematics';
import {PmoOccupancyGrid} from './pmoOccupancyGrid';

export type PedestrianStatus = 'walking' | 'waiting-helper' | 'crossing-helper' | 'waiting-space' | 'arrived' | 'blocked';
export interface PedestrianSnapshot {
  readonly id: string;
  readonly position: SpatialPoint;
  readonly status: PedestrianStatus;
  readonly stepIndex: number;
  readonly routeLength: number;
  readonly helperId: string | null;
  readonly fault: string | null;
}
export interface PedestrianSpawn {
  readonly id: string;
  readonly from: SpatialPoint;
  readonly to: SpatialPoint;
  readonly speed?: number;
}
export interface PedestrianRuntimeOptions {
  readonly collisionSpacing?: number;
  /** Lab-only physical route-step variation; no render-only offsets. */
  readonly varyRoute?: (id:string,route:RouteResult)=>RouteResult;
  /** Lab-only synchronized lift cohorts; default car travel is unaffected. */
  readonly liftBatch?: {
    enter(helper:PmoRouteHelper,from:SpatialPoint,to:SpatialPoint,id:string):boolean;
    sample(helper:PmoRouteHelper,from:SpatialPoint,to:SpatialPoint,id:string):{position:SpatialPoint;fraction:number}|null;
  };
  /** Replay fixed physically-certified 6mm trace, independent of render-frame remainder. */
  readonly followCertifiedWalkTrace?: boolean;
  /** Physical gate used by route attachment and frame movement, never coarse-only verify. */
  readonly certifyWalk?: (from: SpatialPoint,to: SpatialPoint)=>boolean;
  /** Mandatory before any special transition can physically proceed. */
  readonly samplePhysicalHelper?: (helper: PmoRouteHelper, t: number, from: SpatialPoint, to: SpatialPoint, actorId: string) => SpatialPoint | null;
  /** A lift requires a docked, idle car before a rider may occupy it. */
  readonly canEnterHelper?: (helper:PmoRouteHelper,from:SpatialPoint,actorId:string)=>boolean;
  readonly onHelperExit?: (helper:PmoRouteHelper,actorId:string)=>void;
}
interface Actor {
  id: string; position: SpatialPoint; speed: number; status: PedestrianStatus;
  stepIndex: number; steps: readonly RouteStep[]; helperFraction: number;
  helperId: string | null; fault: string | null; deferredGoal: SpatialPoint | null;
  trace: { stepIndex:number; points:readonly SpatialPoint[]; cursor:number; credit:number } | null;
}
const copy = (p: SpatialPoint): SpatialPoint => [p[0], p[1], p[2]];
const distance = (p: SpatialPoint, q: SpatialPoint) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
const horizontal = (p: SpatialPoint, q: SpatialPoint) => Math.hypot(p[0] - q[0], p[2] - q[2]);
// attemptCertifiedWalkStep cannot resolve movements smaller than this threshold.
// A sub-threshold remainder of the *frame budget* is never a terrain failure.
const MIN_CERTIFIABLE_FRAME_ADVANCE = 0.00012;
const isValid = (p: SpatialPoint | null): p is SpatialPoint => !!p && p.length === 3 && p.every(Number.isFinite);

export class PmoPedestrianRuntime implements PmoWaveMotorPort {
  private readonly actors = new Map<string, Actor>();
  private readonly queue: HelperQueue;
  private readonly collisionSpacing: number;
  private readonly occupancy: PmoOccupancyGrid<Actor> | null;
  /** Per-motor certified adjacency; never mutate the canonical compiled PMO graph. */
  private certifiedGraph: BrushGraph;
  private readonly nodeByCoordinate = new Map<string, number>();
  private readonly certifiedDirectedEdges = new Map<string, boolean>();
  constructor(
    private readonly graph: BrushGraph,
    private readonly connector: PmoTerrainConnector,
    private readonly options: PedestrianRuntimeOptions = {},
  ) {
    this.queue = new HelperQueue(graph.helpers);
    this.certifiedGraph = {...graph, neighbors: [...graph.neighbors]};
    for (const node of graph.nodes) this.nodeByCoordinate.set(this.pointKey(node.point), node.id);
    this.collisionSpacing = options.collisionSpacing ?? 0.11;
    if (!(this.collisionSpacing >= 0 && this.collisionSpacing < 1)) throw Error('PEDESTRIAN_INVALID_SPACING');
    this.occupancy = this.collisionSpacing > 0 ? new PmoOccupancyGrid<Actor>(this.collisionSpacing) : null;
  }
  private pointKey(p: SpatialPoint): string { return p.join('|'); }
  private edgeKey(a:SpatialPoint,b:SpatialPoint):string { return this.pointKey(a)+'>'+this.pointKey(b); }
  /** Exactly the 6mm runner preflight, cached for static terrain/PMO. A
   * composed Dijkstra route is NOT proof that each compiled walk edge can run.
   */
  private certifiedStep(a:SpatialPoint,b:SpatialPoint):boolean {
    const key=this.edgeKey(a,b),known=this.certifiedDirectedEdges.get(key);
    if(known!==undefined)return known;
    const safe=certifyDirectedWalk(a,b,this.graph,this.connector)===null;
    this.certifiedDirectedEdges.set(key,safe);
    return safe;
  }
  private unsafeWalkStep(route:RouteResult):RouteStep|null {
    if(route.status!=='READY')return null;
    for(const step of route.steps)if(step.kind==='walk'&&!this.certifiedStep(step.from,step.to))return step;
    return null;
  }
  private blockInvalidCompiledEdge(step:RouteStep):boolean {
    const from=this.nodeByCoordinate.get(this.pointKey(step.from));
    const to=this.nodeByCoordinate.get(this.pointKey(step.to));
    if(from===undefined||to===undefined)return false; // attachment failure, not a graph edge
    const neighbors=this.certifiedGraph.neighbors[from];
    const kept=neighbors.filter(edge=>!(edge.kind==='walk'&&edge.to===to));
    if(kept.length===neighbors.length)return false;
    const copy=[...this.certifiedGraph.neighbors];copy[from]=kept;
    this.certifiedGraph={...this.certifiedGraph,neighbors:copy};
    return true;
  }
  private plan(from:SpatialPoint,to:SpatialPoint):RouteResult {
    const certify=this.options.certifyWalk??((a:SpatialPoint,b:SpatialPoint)=>this.certifiedStep(a,b));
    // The compiled graph may contain older coarse-certified edges. Prune ONLY
    // actual failing directed WALK edges and try the next PMO route. No fake
    // topology, widened grade, teleport or silent invalid route acceptance.
    if(this.options.followCertifiedWalkTrace){
      for(let attempt=0;attempt<96;attempt++){
        const route=planBrushCorridorRoute(this.certifiedGraph,this.connector,from,to,0.26,certify);
        if(route.status!=='READY')return route;
        const bad=this.unsafeWalkStep(route);
        if(!bad)return route;
        if(!this.blockInvalidCompiledEdge(bad))
          return {status:'UNREACHABLE',reason:'PHYSICAL_WALK_ATTACHMENT_NOT_CERTIFIED'};
      }
      return {status:'UNREACHABLE',reason:'PHYSICAL_WALK_DETOUR_LIMIT'};
    }
    return planBrushCorridorRoute(this.graph,this.connector,from,to,0.26,certify);
  }
  /** Variation is optional, runner certification isn't. Never admit a
   * personalized edge solely because the envelope or graph node was valid. */
  private personalizeSafely(id:string,base:RouteResult):RouteResult {
    if(base.status!=='READY')return base;
    const personalized=this.options.varyRoute?.(id,base)??base;
    if(personalized.status!=='READY')return base;
    // Test every WALK segment including unchanged seams and short connectors.
    return this.unsafeWalkStep(personalized)?base:personalized;
  }
  add(spawn: PedestrianSpawn): RouteResult {
    if (!spawn.id || this.actors.has(spawn.id)) return { status: 'UNAUTHORIZED_ENDPOINT', reason: 'DUPLICATE_OR_MISSING_ACTOR_ID' };
    const rawRoute = this.plan(spawn.from, spawn.to);
    const route = this.personalizeSafely(spawn.id,rawRoute);
    if (route.status !== 'READY') return route;
    if (this.actors.size && this.collisionSpacing > 0 && [...this.actors.values()].some(a => distance(a.position, spawn.from) < this.collisionSpacing))
      return { status: 'UNAUTHORIZED_ENDPOINT', reason: 'SPAWN_COLLIDES_WITH_ACTOR' };
    const speed = spawn.speed ?? 0.3;
    if (!(Number.isFinite(speed) && speed > 0 && speed <= 10)) return { status: 'UNAUTHORIZED_ENDPOINT', reason: 'INVALID_WALK_SPEED' };
    this.actors.set(spawn.id, { id: spawn.id, position: copy(spawn.from), speed, status: 'walking', stepIndex: 0, steps: route.steps, helperFraction: 0, helperId: null, fault: null, deferredGoal: null, trace:null });
    return route;
  }
  /** Non-mutating route preview for atomic building reshuffles. While an actor
   * is physically aboard a helper, the only safe replan origin is its exit.
   * This uses EXACTLY the same planner/attachment certification as reroute(). */
  previewReroute(id: string, goal: SpatialPoint): RouteResult {
    const actor=this.actors.get(id);
    if(!actor)return {status:'UNAUTHORIZED_ENDPOINT',reason:'MISSING_ACTOR'};
    const from=actor.helperId && actor.helperFraction>0
      ? actor.steps[actor.stepIndex].to : actor.position;
    const planned=this.plan(from,goal);
    return this.personalizeSafely(id,planned);
  }
  /** Replan from exact observed position. During a physical helper crossing, defer
   * until reaching its authored exit; never teleport out of a lift/bridge/stair. */
  reroute(id: string, goal: SpatialPoint): RouteResult {
    const actor=this.actors.get(id);
    if(!actor)return {status:'UNAUTHORIZED_ENDPOINT',reason:'MISSING_ACTOR'};
    if(actor.helperId && actor.helperFraction>0){
      const candidate=this.previewReroute(id,goal);
      if(candidate.status!=='READY')return candidate;
      actor.deferredGoal=copy(goal);
      return candidate;
    }
    const route=this.previewReroute(id,goal);
    if(route.status!=='READY'){ this.fail(actor,'REPLAN_'+route.reason); return route; }
    if(actor.helperId){const h=this.graph.helpers[actor.helperId];if(h)this.options.onHelperExit?.(h,actor.id);this.queue.cancel(actor.helperId,actor.id);}
    actor.steps=route.steps;actor.stepIndex=0;actor.helperFraction=0;
    actor.helperId=null;actor.fault=null;actor.deferredGoal=null;actor.trace=null;actor.status='walking';
    return route;
  }
  /** Change the ACTUAL walking speed of a pedestrian, not the render animation.
   * Used by the dev crowd's slow leisure detours. No speed mutation is
   * performed on other pedestrian runtimes unless explicitly requested.
   */
  setSpeed(id:string,speed:number):boolean {
    const actor=this.actors.get(id);
    if(!actor||actor.status==='blocked'||!Number.isFinite(speed)||speed<=0||speed>10)return false;
    actor.speed=speed;
    return true;
  }
  /** Explicit fail-closed stop when a building is moved onto an unreachable
   *  authored site. Never leaves an actor walking toward a stale destination.
   *  This does not modify its physical coordinates. */
  halt(id: string, reason: string): void {
    const actor=this.actors.get(id);
    if (!actor) return;
    this.fail(actor, reason || 'DESTINATION_UNREACHABLE');
  }
  remove(id: string): void {
    const actor = this.actors.get(id);
    if (!actor) return;
    if (actor.helperId) {const h=this.graph.helpers[actor.helperId];if(h)this.options.onHelperExit?.(h,actor.id);this.queue.cancel(actor.helperId, actor.id);}
    this.occupancy?.remove(actor);
    this.actors.delete(id);
  }
  snapshots(): readonly PedestrianSnapshot[] {
    return [...this.actors.values()].map(a => ({ id: a.id, position: copy(a.position), status: a.status, stepIndex: a.stepIndex, routeLength: a.steps.length, helperId: a.helperId, fault: a.fault }));
  }
  diagnostic(id:string): string {
    const a=this.actors.get(id);
    if(!a)return 'MISSING_ACTOR';
    const step=a.steps[a.stepIndex];
    return JSON.stringify({position:a.position,stepIndex:a.stepIndex,routeLength:a.steps.length,
      stepKind:step?.kind??null,stepFrom:step?.from??null,stepTo:step?.to??null,
      traceCursor:a.trace?.cursor??null,traceLength:a.trace?.points.length??null,fault:a.fault});
  }
  helperStatus(helperId: string): { active: readonly string[]; pending: readonly string[] } { return this.queue.status(helperId); }
  private fail(actor: Actor, code: string): void {
    if (actor.helperId) {const h=this.graph.helpers[actor.helperId];if(h)this.options.onHelperExit?.(h,actor.id);this.queue.cancel(actor.helperId, actor.id);}
    actor.helperId = null; actor.trace=null; actor.status = 'blocked'; actor.fault = code;
    this.occupancy?.sync(actor);
  }
  private occupied(actor: Actor, next: SpatialPoint): boolean {
    return this.occupancy?.occupied(actor,next) ?? false;
  }
  tick(seconds: number): void {
    if (!(seconds > 0 && seconds <= 1 && Number.isFinite(seconds))) throw Error('PEDESTRIAN_INVALID_DELTA');
    this.occupancy?.rebuild(this.actors.values());
    for (const actor of this.actors.values()) {
      try {
      if (actor.status === 'arrived' || actor.status === 'blocked') continue;
      const step = actor.steps[actor.stepIndex];
      if (!step) { actor.status = 'arrived'; continue; }
      if (step.kind !== 'walk') { this.walkHelper(actor, step, seconds); continue; }
      if (this.options.followCertifiedWalkTrace) {this.walkCertifiedTrace(actor,step,seconds);continue;}
      const remaining = distance(actor.position, step.to);
      if (remaining < 0.0001) {
        actor.position = copy(step.to); actor.stepIndex++;
        if (actor.stepIndex === actor.steps.length) actor.status = 'arrived';
        continue;
      }
      // Real frames and preflight graph audit execute identical <=6mm physical
      // increments. A slow/render-stalled frame may execute several; no frame
      // can leap across a short steep seam between 0.07m compiler samples.
      let budget=Math.min(actor.speed*seconds,0.07),stuck=false;
      for(let micro=0;micro<16&&budget>1e-7;micro++){
        const before=copy(actor.position);
        const stepDistance=distance(before,step.to);
        if(stepDistance<0.0005){actor.stepIndex++;if(actor.stepIndex===actor.steps.length)actor.status='arrived';break;}
        // Frame quantization is not physical obstruction. The validator has an
        // explicit 0.12mm lower bound: asking it to move e.g. 0.05mm always
        // returns NO_FORWARD_PROGRESS even on perfectly flat ground. Consume
        // this tiny time-budget remainder without blocking the pedestrian.
        // Genuine failures at certifiable advances still fail closed below.
        if(budget<MIN_CERTIFIABLE_FRAME_ADVANCE)break;
        const attempt=attemptCertifiedWalkStep(before,step.to,this.graph,this.connector,
          Math.min(0.006,budget));
        if(!attempt.next){this.fail(actor,'WALK_'+attempt.fault);stuck=true;break;}
        if(this.occupied(actor,attempt.next)){actor.status='waiting-space';stuck=true;break;}
        actor.position=copy(attempt.next);actor.status='walking';
        budget-=Math.max(1e-6,distance(before,attempt.next));
        if(distance(actor.position,step.to)<0.0005){
          actor.position=copy(step.to);actor.stepIndex++;
          if(actor.stepIndex===actor.steps.length)actor.status='arrived';
          break;
        }
      }
      if(stuck)continue;
      } finally { this.occupancy?.sync(actor); }
    }
  }
  /** Certify a whole directed walk from the actor's REAL current position
   * before movement. Replaying its audited 6mm points removes frame-dependent
   * sampling drift without relaxing projection, grade, verify, or collision.
   * The trace is invalidated by reroutes and helper transitions.
   */
  private walkCertifiedTrace(actor:Actor,step:RouteStep,seconds:number):void {
    if(!actor.trace || actor.trace.stepIndex!==actor.stepIndex){
      const points:SpatialPoint[]=[];
      const failure=certifyDirectedWalk(actor.position,step.to,this.graph,this.connector,0.006,points);
      if(failure){this.fail(actor,'WALK_TRACE_'+failure.fault);return;}
      if(points.length<2 || distance(points[0],actor.position)>0.000001){
        this.fail(actor,'WALK_TRACE_INVALID');return;
      }
      actor.trace={stepIndex:actor.stepIndex,points,cursor:1,credit:0};
    }
    const trace=actor.trace;
    // Keep the unused frame-time distance: at 60 FPS a single frame can
    // legitimately permit <6mm, which MUST NOT permanently freeze an actor.
    // Cap stored credit to one normal micro-batch; it is discarded on collision.
    let budget=Math.min(0.07,trace.credit+Math.min(actor.speed*seconds,0.07));
    for(let micro=0;micro<16 && trace.cursor<trace.points.length;micro++){
      const next=trace.points[trace.cursor];const length=distance(actor.position,next);
      if(length>budget+1e-9)break; // no interpolation onto a non-certified point
      if(this.occupied(actor,next)){trace.credit=0;actor.status='waiting-space';return;}
      actor.position=copy(next);actor.status='walking';trace.cursor++;
      budget=Math.max(0,budget-length);
    }
    trace.credit=budget;
    if(trace.cursor===trace.points.length){
      actor.position=copy(step.to);actor.stepIndex++;actor.trace=null;
      if(actor.stepIndex===actor.steps.length)actor.status='arrived';
    }
  }
  /** Physical group lift: every rider samples the SAME shared car position.
   * Legacy HelperQueue and solo lift ride remain untouched unless opted in. */
  private walkBatchLift(actor:Actor,step:RouteStep,helper:PmoRouteHelper):void {
    const cohort=this.options.liftBatch!;
    if(distance(actor.position,step.from)>0.06 && actor.helperId===null){this.fail(actor,'HELPER_ENTRY_NOT_REACHED');return;}
    actor.helperId=helper.id;
    if(!cohort.enter(helper,step.from,step.to,actor.id)){actor.status='waiting-helper';return;}
    const sample=cohort.sample(helper,step.from,step.to,actor.id);
    if(!sample||!isValid(sample.position)||!Number.isFinite(sample.fraction)||
       sample.fraction<actor.helperFraction-1e-7||sample.fraction>1+1e-8){
      this.fail(actor,'LIFT_BATCH_SAMPLE_INVALID');return;
    }
    const expected:SpatialPoint=[
      step.from[0]+(step.to[0]-step.from[0])*sample.fraction,
      step.from[1]+(step.to[1]-step.from[1])*sample.fraction,
      step.from[2]+(step.to[2]-step.from[2])*sample.fraction];
    if(distance(actor.position,sample.position)>.101||distance(expected,sample.position)>.075){
      this.fail(actor,'LIFT_BATCH_CAR_DISCONTINUITY');return;
    }
    // Passenger collision is disabled separately in this stress experiment;
    // no fake walking through walls and no releasing the cab for one rider.
    actor.position=copy(sample.position);actor.helperFraction=sample.fraction;
    actor.status='crossing-helper';
    if(sample.fraction>=1-1e-8){
      if(distance(sample.position,step.to)>.07){this.fail(actor,'HELPER_EXIT_NOT_AT_AUTHORED_PORT');return;}
      this.options.onHelperExit?.(helper,actor.id);
      actor.helperId=null;actor.stepIndex++;actor.helperFraction=0;actor.trace=null;
      actor.status=actor.stepIndex===actor.steps.length?'arrived':'walking';
      if(actor.deferredGoal){
        const goal=copy(actor.deferredGoal);actor.deferredGoal=null;
        const nextRoute=this.reroute(actor.id,goal);
        if(nextRoute.status!=='READY')this.fail(actor,'DEFERRED_REPLAN_'+nextRoute.reason);
      }
    }
  }
  private walkHelper(actor: Actor, step: RouteStep, seconds: number): void {
    const helper = step.helperId ? this.graph.helpers[step.helperId] : undefined;
    if (!helper) { this.fail(actor, 'MISSING_HELPER_IDENTITY'); return; }
    if(helper.kind==='lift'&&this.options.liftBatch){this.walkBatchLift(actor,step,helper);return;}
    if (!this.options.samplePhysicalHelper) { actor.status = 'waiting-helper'; return; }
    // The agent must actually be at the exact authored boarding/access point.
    if (distance(actor.position, step.from) > 0.06 && actor.helperId === null) { this.fail(actor, 'HELPER_ENTRY_NOT_REACHED'); return; }
    if (!this.queue.enter(helper.id, actor.id)) { actor.status = 'waiting-helper'; actor.helperId = helper.id; return; }
    if (actor.helperFraction===0 &&
        this.options.canEnterHelper && !this.options.canEnterHelper(helper,step.from,actor.id)) {
      this.queue.leave(helper.id,actor.id);actor.status='waiting-helper';return;
    }
    actor.helperId = helper.id;
    const length = Math.max(0.01, distance(step.from, step.to));
    const fraction = Math.min(1, actor.helperFraction + Math.min(actor.speed * seconds, 0.07) / length);
    const next = this.options.samplePhysicalHelper(helper, fraction, step.from, step.to,actor.id);
    if (!isValid(next)) { this.fail(actor, 'HELPER_NO_PHYSICAL_SURFACE_SAMPLE'); return; }
    const increment = distance(actor.position, next);
    if (increment > 0.10 || distance(next, [
      step.from[0] + (step.to[0] - step.from[0]) * fraction,
      step.from[1] + (step.to[1] - step.from[1]) * fraction,
      step.from[2] + (step.to[2] - step.from[2]) * fraction,
    ]) > 0.15) {
      this.fail(actor, 'HELPER_MOTION_NOT_CONTINUOUS'); return;
    }
    if (this.occupied(actor, next)) { actor.status = 'waiting-space'; return; }
    actor.position = copy(next); actor.status = 'crossing-helper'; actor.helperFraction = fraction;
    if (fraction >= 1 - 1e-8) {
      if (distance(next, step.to) > 0.07) { this.fail(actor, 'HELPER_EXIT_NOT_AT_AUTHORED_PORT'); return; }
      this.queue.leave(helper.id, actor.id); this.options.onHelperExit?.(helper,actor.id); actor.helperId = null;
      actor.position = copy(step.to); actor.stepIndex++; actor.helperFraction = 0;
      actor.status = actor.stepIndex === actor.steps.length ? 'arrived' : 'walking';
      if(actor.deferredGoal){
        const goal=copy(actor.deferredGoal);actor.deferredGoal=null;
        const nextRoute=this.reroute(actor.id,goal);
        if(nextRoute.status!=='READY')this.fail(actor,'DEFERRED_REPLAN_'+nextRoute.reason);
      }
    }
  }
}

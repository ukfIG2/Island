/** Resource-agnostic, deterministic admission for physical crowd movement.
 * A resource can be a staircase throat, bridge, lift, service approach or
 * ferry boarding gate. This never issues movement, teleports, or Core rewards.
 * Callers must validate an actual PMO path and choose physical waiting places.
 */
export type BottleneckKind='stairs'|'bridge'|'lift'|'service'|'boarding'|'corridor';
export interface BottleneckSpec {
  id:string;kind:BottleneckKind;capacity:number;
  /** Estimated seconds each holder retains the restricted resource. */
  averageHoldSeconds:number;
}
export type BottleneckAdvice='wait'|'consider-replan'|'consider-wander';
export interface BottleneckView {
  id:string;kind:BottleneckKind;capacity:number;occupied:number;queued:number;
  firstWaiting:string|null;estimatedQueueSeconds:number;
}
interface Resource {
  spec:BottleneckSpec;
  occupants:Set<string>;
  queue:string[];
}
export class PmoBottleneckDirector {
  private readonly resources=new Map<string,Resource>();
  private readonly ownership=new Map<string,Set<string>>();
  constructor(specs:readonly BottleneckSpec[]){
    for(const spec of specs){
      if(!spec.id||this.resources.has(spec.id)||!Number.isInteger(spec.capacity)||spec.capacity<1||spec.capacity>1000||
        !Number.isFinite(spec.averageHoldSeconds)||spec.averageHoldSeconds<=0)
        throw Error('BOTTLENECK_INVALID_RESOURCE:'+spec.id);
      this.resources.set(spec.id,{spec,occupants:new Set(),queue:[]});
    }
  }
  private get(id:string):Resource {
    const r=this.resources.get(id);if(!r)throw Error('BOTTLENECK_UNKNOWN_RESOURCE:'+id);return r;
  }
  enqueue(actorId:string,resourceId:string):void {
    if(!actorId)throw Error('BOTTLENECK_EMPTY_ACTOR');
    const r=this.get(resourceId);
    if(!r.occupants.has(actorId)&&!r.queue.includes(actorId))r.queue.push(actorId);
  }
  /** FIFO without bypass: an unregistered actor cannot skip earlier waiters. */
  tryAcquire(actorId:string,resourceId:string):boolean {
    const r=this.get(resourceId);
    if(r.occupants.has(actorId))return true;
    this.enqueue(actorId,resourceId);
    if(r.queue[0]!==actorId||r.occupants.size>=r.spec.capacity)return false;
    r.queue.shift();r.occupants.add(actorId);
    let owned=this.ownership.get(actorId);if(!owned){owned=new Set();this.ownership.set(actorId,owned);}
    owned.add(resourceId);
    // Admit other queued callers on subsequent actual spawn attempts, not by
    // silently converting a queue record into a physical actor.
    return true;
  }
  /** Release a lease after leaving its PHYSICALLY checked exit. */
  release(actorId:string,resourceId:string):void {
    const r=this.get(resourceId);r.occupants.delete(actorId);
    const owned=this.ownership.get(actorId);owned?.delete(resourceId);
    if(owned&&owned.size===0)this.ownership.delete(actorId);
  }
  /** Physical spawn failed because the launch position is occupied; keep FIFO
   * priority without treating the actor as admitted. */
  yieldUnlaunched(actorId:string,resourceId:string):void {
    const r=this.get(resourceId);
    this.release(actorId,resourceId);
    if(!r.queue.includes(actorId))r.queue.unshift(actorId);
  }
  /** Remove the actor from ALL leases/queues; used for cleanup/fail closed. */
  cancel(actorId:string):void {
    for(const r of this.resources.values()){
      r.occupants.delete(actorId);
      const index=r.queue.indexOf(actorId);if(index>=0)r.queue.splice(index,1);
    }
    this.ownership.delete(actorId);
  }
  /** Never treat an infinite or unsafe route as a replan option. An advice is
   * advisory until caller proves a different physical route and executes it. */
  advise(actorId:string,resourceId:string,options:{patienceSeconds:number;alternativePhysicalRoute:boolean;safeWanderArea:boolean;mandatory:boolean}):BottleneckAdvice {
    const r=this.get(resourceId),index=r.queue.indexOf(actorId);
    if(index<0||r.occupants.has(actorId))return 'wait';
    const ahead=index+r.occupants.size;
    const estimated=Math.ceil(ahead/r.spec.capacity)*r.spec.averageHoldSeconds;
    const patience=Math.max(0,options.patienceSeconds);
    if(estimated<=patience||options.mandatory)return 'wait';
    // Stable per-actor variation; waiting guests do not change their mind on
    // every frame. Delays dominate the decision, not an arbitrary die roll.
    const h=[...actorId+'|'+resourceId].reduce((v,c)=>Math.imul(v^c.charCodeAt(0),16777619)>>>0,2166136261) / 0xffffffff;
    if(options.alternativePhysicalRoute && (estimated>patience*2 || h<0.6))return 'consider-replan';
    if(options.safeWanderArea && (estimated>patience*1.5 || h<0.35))return 'consider-wander';
    return 'wait';
  }
  view(resourceId:string):BottleneckView {
    const r=this.get(resourceId);
    return {id:r.spec.id,kind:r.spec.kind,capacity:r.spec.capacity,
      occupied:r.occupants.size,queued:r.queue.length,firstWaiting:r.queue[0]??null,
      estimatedQueueSeconds:Math.ceil((r.queue.length+r.occupants.size)/r.spec.capacity)*r.spec.averageHoldSeconds};
  }
  views():BottleneckView[]{return [...this.resources.keys()].map(id=>this.view(id));}
  owns(actorId:string,resourceId:string):boolean{return this.get(resourceId).occupants.has(actorId);}
}

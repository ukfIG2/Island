/** A physical, single-car lift controller shared by navigation and R3F rendering.
 * No autonomous decorative animation. The cabin moves empty to the requested
 * authored dock, and carries one reserved actor between the same two docks.
 */
import type {SpatialPoint} from './registry';
import type {PmoStructure} from './pmoTransitionStructures';
import type {PmoTransitionAccess} from './pmoTransitionAccess';
import type {PmoDockExtension} from './pmoTransitionDockRepair';
import type {PmoTerrainConnector,PmoRouteHelper} from './pmoBrushCorridors';

interface Car {
  readonly from:SpatialPoint; readonly to:SpatialPoint;
  fraction:number; occupiedBy:string|null; requested:0|1|null;
}
const lerp=(a:SpatialPoint,b:SpatialPoint,t:number):SpatialPoint=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const dist=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export class PmoLiftTransit {
  private cars=new Map<string,Car>();
  readonly rejected:string[]=[];
  constructor(structures:readonly PmoStructure[],accesses:readonly PmoTransitionAccess[],connector:PmoTerrainConnector,docks:readonly PmoDockExtension[]=[]){
    for(const s of structures.filter(item=>item.kind==='lift')){
      const access=accesses.find(a=>a.sourceId===s.sourceId&&a.edgeId===s.edgeId);
      const from=connector.project([...s.from]),to=connector.project([...s.to]);
      const dockReady=(side:0|1)=>docks.some(d=>d.structureSourceId===s.sourceId&&d.side===side&&
        dist(d.to,side===0?s.from:s.to)<0.00001&&d.physicalSamples.length>=3);
      if(!access?.attached||!access.geometryContinuous||!access.eligibleForPhysicalReview||
        !((from&&dist(from,s.from)<=0.035)||dockReady(0))||
        !((to&&dist(to,s.to)<=0.035)||dockReady(1))){
        this.rejected.push(s.sourceId+':LIFT_DOCK_NOT_AUTHORIZED');continue;
      }
      this.cars.set(s.sourceId,{from:[...s.from],to:[...s.to],fraction:0,occupiedBy:null,requested:null});
    }
  }
  has(id:string){return this.cars.has(id);}
  ids():string[]{return [...this.cars.keys()];}
  position(id:string):SpatialPoint|null {const c=this.cars.get(id);return c?lerp(c.from,c.to,c.fraction):null;}
  /** Call before the queue token is granted; the car may first travel empty. */
  reserve(helper:PmoRouteHelper,from:SpatialPoint,actor:string):boolean{
    const c=this.cars.get(helper.sourceId);if(!c||helper.kind!=='lift')return false;
    const dock=dist(from,c.from)<0.06?0:dist(from,c.to)<0.06?1:-1;
    if(dock!==0&&dock!==1)return false;
    if(c.occupiedBy===actor)return true;
    if(c.occupiedBy)return false;
    const target=dock===0?0:1;
    if(Math.abs(c.fraction-target)>1e-5){if(c.requested===null)c.requested=dock;return false;}
    c.occupiedBy=actor;c.requested=null;return true;
  }
  /** The actor's helper progress is the *only* occupied-car motion authority. */
  ride(helper:PmoRouteHelper,progress:number,from:SpatialPoint,to:SpatialPoint,actor:string):SpatialPoint|null{
    const c=this.cars.get(helper.sourceId);if(!c||c.occupiedBy!==actor||progress<0||progress>1)return null;
    if(dist(from,c.from)<0.06&&dist(to,c.to)<0.06)c.fraction=progress;
    else if(dist(from,c.to)<0.06&&dist(to,c.from)<0.06)c.fraction=1-progress;
    else return null;
    return this.position(helper.sourceId);
  }
  release(helper:PmoRouteHelper,actor:string):void{
    const c=this.cars.get(helper.sourceId);if(c?.occupiedBy===actor){c.occupiedBy=null;c.requested=null;}
  }
  /** Empty car travel (with visible platform) to the requested boarding dock. */
  tick(dt:number):void{
    if(!Number.isFinite(dt)||dt<0)return;
    for(const c of this.cars.values()){
      if(c.occupiedBy||c.requested===null)continue;
      const target=c.requested===0?0:1;
      const length=Math.max(0.05,dist(c.from,c.to));
      const step=Math.min(0.06,dt*0.6)/length;
      c.fraction=target===0?Math.max(0,c.fraction-step):Math.min(1,c.fraction+step);
      if(Math.abs(c.fraction-target)<1e-8)c.requested=null;
    }
  }
  reset(){for(const c of this.cars.values()){c.fraction=0;c.occupiedBy=null;c.requested=null;}}
}

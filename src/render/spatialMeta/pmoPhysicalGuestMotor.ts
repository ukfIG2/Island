/** Production physical guest motor: the certified lab mechanisms, without DEV imports,
 * DEV service timers, fake guest economics or a second gameplay authority.
 * The canonical TypeScript Core alone supplies demand and queue pressure.
 */
import type {BrushGraph,PmoTerrainConnector,SpatialPoint,PmoRouteHelper} from './pmoBrushCorridors';
import type {PmoLiftTransit} from './pmoLiftTransit';
import {PmoPedestrianRuntime} from './pmoPedestrianRuntime';
import {certifyDirectedWalk} from './pmoWalkKinematics';
import {CrowdRouteVariation} from './pmoRouteVariation';
import {PmoCrowdLiftBatch} from './pmoLiftGroup';

const d3=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
export interface PhysicalGuestMotor {
  readonly pedestrians:PmoPedestrianRuntime;
  readonly variation:CrowdRouteVariation;
  readonly liftBatch:PmoCrowdLiftBatch;
  tick(dt:number):void;
  seat(id:string):number|null;
  speed(id:string):number;
  dispose():void;
}
export function createPhysicalGuestMotor(
  graph:BrushGraph,connector:PmoTerrainConnector,
  physical:ReadonlyMap<string,readonly SpatialPoint[]>,lift:PmoLiftTransit,
):PhysicalGuestMotor {
  const certify=(from:SpatialPoint,to:SpatialPoint)=>
    certifyDirectedWalk(from,to,graph,connector)===null;
  const variation=new CrowdRouteVariation(graph,connector,certify,.52,.5);
  const liftBatch=new PmoCrowdLiftBatch(lift,10,1.1,.65);
  const pedestrians=new PmoPedestrianRuntime(graph,connector,{
    collisionSpacing:.075,
    followCertifiedWalkTrace:true,
    certifyWalk:certify,
    varyRoute:(id,route)=>variation.apply(id,route),
    liftBatch,
    // Group cabin reservations and transitions are owned exclusively by liftBatch;
    // the shared scope advances the actual PmoLiftTransit car exactly once.
    onHelperExit:(helper,id)=>{if(helper.kind==='lift')liftBatch.release(helper,id);},
    samplePhysicalHelper:(helper:PmoRouteHelper,t,from,to,id)=>{
      if(helper.kind==='lift')return lift.ride(helper,t,from,to,id);
      const points=physical.get(helper.sourceId);if(!points?.length)return null;
      const reverse=d3(from,helper.to)<.08;
      const x=(reverse?1-t:t)*(points.length-1);
      const i=Math.floor(x),j=Math.min(points.length-1,i+1),k=x-i;
      return [points[i][0]+(points[j][0]-points[i][0])*k,
        points[i][1]+(points[j][1]-points[i][1])*k,
        points[i][2]+(points[j][2]-points[i][2])*k];
    },
  });
  return {
    pedestrians,variation,liftBatch,
    tick(dt:number){liftBatch.tick(dt);pedestrians.tick(dt);},
    seat(id:string){return liftBatch.seat(id);},
    speed(id:string){return variation.speed(id);},
    dispose(){for(const a of pedestrians.snapshots())pedestrians.remove(a.id);liftBatch.reset();},
  };
}

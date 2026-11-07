/** DEV-only adapter: one owner for laboratory motor policies, never Core.
 * This module configures the shared physical motor without duplicating its
 * stepping or the PmoNavigationScope lift clock.
 */
import {PmoPedestrianRuntime} from '../render/spatialMeta/pmoPedestrianRuntime';
import type {BrushGraph,PmoTerrainConnector,SpatialPoint,PmoRouteHelper} from '../render/spatialMeta/pmoBrushCorridors';
import type {PmoLiftTransit} from '../render/spatialMeta/pmoLiftTransit';
import {certifyWalkMotion} from './pmoWalkMotionAudit';
import {PmoCrowdLiftBatch} from './pmoCrowdLiftBatch';
import {CrowdRouteVariation} from './pmoCrowdRouteVariation';

export interface DevMotorInputs {
  graph: BrushGraph;
  connector: PmoTerrainConnector;
  liftTransit: PmoLiftTransit;
  samplePhysicalHelper: (h:PmoRouteHelper,t:number,from:SpatialPoint,to:SpatialPoint,actorId?:string)=>SpatialPoint|null;
  collisionSpacing: number;
  synchronizedLift: boolean;
}
export function createDevPedestrianMotor(input:DevMotorInputs){
  const {graph,connector,liftTransit,samplePhysicalHelper,collisionSpacing,synchronizedLift}=input;
  const certifyWalk=(a:SpatialPoint,b:SpatialPoint)=>certifyWalkMotion(a,b,graph,connector)===null;
  const liftBatch=synchronizedLift?new PmoCrowdLiftBatch(liftTransit,10,2.0,.65):null;
  const variation=synchronizedLift?new CrowdRouteVariation(graph,connector,certifyWalk,.52,.5):null;
  const motor=new PmoPedestrianRuntime(graph,connector,{
    collisionSpacing,followCertifiedWalkTrace:true,certifyWalk,
    ...(variation?{varyRoute:(id:string,route:import('../render/spatialMeta/pmoBrushCorridors').RouteResult)=>variation.apply(id,route)}:{}),
    ...(liftBatch?{liftBatch}:{}),
    canEnterHelper:(helper,from,actor)=>helper.kind!=='lift'||liftTransit.reserve(helper,from,actor),
    onHelperExit:(helper,actor)=>{if(helper.kind==='lift'){
      if(liftBatch)liftBatch.release(helper,actor);
      else liftTransit.release(helper,actor);
    }},
    samplePhysicalHelper:(helper,t,from,to,actor)=>helper.kind==='lift'
      ?liftTransit.ride(helper,t,from,to,actor)
      :samplePhysicalHelper(helper,t,from,to,actor),
  });
  return {motor,liftBatch,variation};
}

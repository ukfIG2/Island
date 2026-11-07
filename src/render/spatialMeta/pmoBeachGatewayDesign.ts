/** One built entrance, projected from the same certified source geometry used by
 * the PMO graph. This module never alters navigation or grants walk permission.
 * Top surfaces remain precisely those sampled by pmoTransitionSurface / supported routes.
 */
import type { PmoStructure } from './pmoTransitionStructures';
import type { PmoLandingExtension } from './pmoLandingRepair';
import type { PmoDockExtension } from './pmoTransitionDockRepair';
import type { SpatialPoint } from './registry';

export const BEACH_GATEWAY_ID = 'pmo-3ae6a767-a0f4-40af-b982-ec36346bebe6';
export type GatewayStone = {
  readonly id:string;
  readonly center:SpatialPoint;
  readonly top:number;
  readonly yaw:number;
  readonly width:number;
  readonly length:number;
  /** Solid stone *below* the certified top, never above the physical surface. */
  readonly baseDepth:number;
  readonly family:'main'|'landing'|'dock';
};
export type BeachGatewayDesign = {
  readonly stones:readonly GatewayStone[];
  readonly physicalSources:readonly string[];
  readonly first:SpatialPoint;
  readonly last:SpatialPoint;
};
const finite=(p:readonly number[])=>p.every(Number.isFinite);
/** A solid architectural treatment of EXISTING physical steps. No broad cap
 * polygon across unsupported terrain, no unverified extra last-step bridge. */
export function designPmoBeachGateway(
  stair:PmoStructure,
  landings:readonly PmoLandingExtension[],
  docks:readonly PmoDockExtension[],
):BeachGatewayDesign|null {
  if(stair.sourceId!==BEACH_GATEWAY_ID||stair.kind!=='stairs'||stair.segments.length<3||
    !finite(stair.from)||!finite(stair.to))return null;
  const stones:GatewayStone[]=[];
  for(let i=0;i<stair.segments.length;i++){
    const s=stair.segments[i];
    if(!finite(s.center)||!(s.width>=0.20&&s.length>0))return null;
    const top=s.center[1]+0.017;
    const depth=Math.max(0.20,Math.min(0.46,0.30+Math.abs(stair.to[1]-stair.from[1])*.12));
    stones.push({id:stair.edgeId+':'+i,center:[...s.center],top,yaw:s.yaw,width:s.width,
      length:s.length,baseDepth:depth,family:'main'});
  }
  const seen=new Set<string>([stair.sourceId]);
  for(const extension of landings.filter(e=>e.sourceId===BEACH_GATEWAY_ID)){
    if(extension.physicalSamples.length<3||!extension.treads.length||!finite(extension.from)||!finite(extension.to))return null;
    seen.add(extension.id);
    for(let i=0;i<extension.treads.length;i++){
      const s=extension.treads[i];
      if(!finite(s.center)||!Number.isFinite(s.top)||s.length<=0||s.width<0.2)return null;
      stones.push({id:extension.id+':'+i,center:[...s.center],top:s.top,yaw:s.yaw,
        width:s.width,length:s.length,baseDepth:0.10,family:'landing'});
    }
  }
  for(const extension of docks.filter(d=>d.structureSourceId===BEACH_GATEWAY_ID)){
    if(extension.physicalSamples.length<3)return null;
    seen.add(extension.id);
    for(let i=0;i<extension.treads.length;i++){
      const s=extension.treads[i];
      if(!finite(s.center)||s.length<=0||s.width<0.2)return null;
      stones.push({id:extension.id+':'+i,center:[...s.center],top:s.center[1]+0.017,
        yaw:s.yaw,width:s.width,length:s.length,baseDepth:0.10,family:'dock'});
    }
  }
  // Catch inadvertent coordinates/pitch mismatches without damaging live PMO.
  if(!stones.length||!stones.every(s=>finite(s.center)&&Number.isFinite(s.top)))return null;
  return {stones,physicalSources:[...seen],first:[...stair.from],last:[...stair.to]};
}

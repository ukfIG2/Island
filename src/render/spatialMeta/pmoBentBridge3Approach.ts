/** Opt-in visual-lab alternative to the problematic straight place-3 bridge dock.
 * This is a derived, physically rendered two-leg deck, NOT a change to the
 * authored PMO or an invisible edge. It can be enabled only in the DEV stand.
 */
import type { SpatialPoint } from './registry';
import type { TerrainProjector } from './navigation';
import type { PmoTerrainConnector } from './pmoBrushCorridors';
import type { PmoDockExtension } from './pmoTransitionDockRepair';
import { avoidsBuildingFootprint } from './pmoDerivedStructureClearance';

const dist=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const horizontal=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const lerp=(a:SpatialPoint,b:SpatialPoint,t:number):SpatialPoint=>[
  a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
export interface BentDockGeometry {
  physicalSamples:SpatialPoint[];
  treads:PmoDockExtension['treads'];
  via:SpatialPoint;
  cost:number;
}

/** The canonical GLB admits an outside-of-building turn near x=.9,z=2.9.
 * We independently validate it at <0.025m microsteps; a different island,
 * footprint or PMO fails closed, never silently adds an edge.
 */
export function certifyBentBridge3Approach(
  walk:SpatialPoint,bridgePort:SpatialPoint,building:SpatialPoint,
  connector:PmoTerrainConnector,terrain:TerrainProjector,
):BentDockGeometry|null {
  if(Math.hypot(building[0]-1.0643,building[2]-2.557)>.002 ||
     Math.hypot(bridgePort[0]-.5513,bridgePort[2]-2.7778)>.002)return null;
  const via=terrain.project(.9,2.9,-.96);
  if(!via||Math.abs(via[1]+.9557)>.045)return null;
  if(!connector.project(walk)||dist(connector.project(walk)!,walk)>.035)return null;
  if(!avoidsBuildingFootprint(walk,via,building,.31)||
     !avoidsBuildingFootprint(via,bridgePort,building,.31))return null;
  const out:SpatialPoint[]=[],treads:PmoDockExtension['treads']=[];
  for(const [a,b] of [[walk,via],[via,bridgePort]] as const){
    const dx=b[0]-a[0],dz=b[2]-a[2],flat=horizontal(a,b);
    if(flat<.07||flat>1.25||Math.abs(b[1]-a[1])>.25)return null;
    const pieces=Math.max(5,Math.ceil(flat/.025),Math.ceil(Math.abs(b[1]-a[1])/.04));
    const yaw=Math.atan2(dx,dz);
    for(let i=0;i<=pieces;i++){
      const p=lerp(a,b,i/pieces);
      const sample=terrain.project(p[0],p[2],p[1]);
      if(!sample||sample[1]-p[1]>.050||p[1]-sample[1]>.38)return null;
      if(i===0 && out.length)continue;
      out.push(p);
      if(i){
        const from=lerp(a,b,(i-.5)/pieces);
        treads.push({center:[from[0],from[1]-.017,from[2]],yaw,
          length:flat/pieces*1.11,width:.27});
      }
    }
  }
  if(out.length<10||treads.length<10)return null;
  return {physicalSamples:out,treads,via,cost:dist(walk,via)+dist(via,bridgePort)};
}

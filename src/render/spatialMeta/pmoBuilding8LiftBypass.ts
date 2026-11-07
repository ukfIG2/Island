/** A physical, outside-footprint transfer around authored building_8.
 * The former straight lift pickup connected (-0.84,-0.936,3.36) to
 * (-2.0794,-0.9096,2.9613), crossing the building footprint at x=-1.368,z=3.190.
 * This module supplies the SAME navigation helper with certified, rendered bent
 * physical samples; it never changes PMO authoring or invents a walk-paint edge.
 */
import type { SpatialPoint } from './registry';
import type { TerrainProjector } from './navigation';
import type { PmoTerrainConnector } from './pmoBrushCorridors';
import type { PmoDockExtension } from './pmoTransitionDockRepair';
import { avoidsBuildingFootprint } from './pmoDerivedStructureClearance';

type Surface = Pick<PmoDockExtension,'kind'|'physicalSamples'|'treads'>;
const d3=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const xz=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const lerp=(a:SpatialPoint,b:SpatialPoint,t:number):SpatialPoint=>[
  a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const allowed=(p:SpatialPoint,q:SpatialPoint,building:SpatialPoint)=>
  // The 0.49m envelope contains building clearance AND deck half-width.
  avoidsBuildingFootprint(p,q,building,0.49);

export function certifyBuilding8LiftBypass(
  walk:SpatialPoint,liftPort:SpatialPoint,building:SpatialPoint,
  connector:PmoTerrainConnector,terrain:TerrainProjector,
):Surface|null {
  if(d3(building,[-1.4041,-.9461,3.3013])>.003||
     d3(liftPort,[-2.0794,-.9096,2.9613])>.003||
     xz(walk,[-.84,-.9358263742,3.36])>.13||
     Math.abs(walk[1]+.9358263742)>.06)return null;
  // Only the connector-end is an authored walk node. The intermediate deck
  // goes around the building and is NOT asserted to be PMO-painted ground.
  const approved=connector.project([...walk]);
  if(!approved||d3(approved,walk)>.035)return null;
  const waypoints:SpatialPoint[]=[
    [...walk],[-.80,-.90,2.65],[-1.82,-.90,2.60],[...liftPort]
  ];
  const physicalSamples:SpatialPoint[]=[],treads:PmoDockExtension['treads']=[];
  for(let leg=0;leg<waypoints.length-1;leg++){
    const a=waypoints[leg],b=waypoints[leg+1];
    if(!allowed(a,b,building))return null;
    const flat=xz(a,b),vertical=Math.abs(a[1]-b[1]);
    if(flat<.18||flat>1.20||vertical>.16)return null;
    const n=Math.max(6,Math.ceil(flat/.025),Math.ceil(vertical/.03));
    const yaw=Math.atan2(b[0]-a[0],b[2]-a[2]);
    let unsupportedSpan=0;
    for(let i=0;i<=n;i++){
      if(leg>0&&i===0)continue;
      const p=lerp(a,b,i/n);
      // Supports are *above* the imported terrain or bridge across a small
      // existing void. Never put a deck surface through solid terrain.
      const ground=terrain.project(p[0],p[2],p[1]);
      unsupportedSpan=ground?0:unsupportedSpan+flat/n;
      if(unsupportedSpan>.12)return null;
      if(ground&&ground[1]-p[1]>.047)return null;
      if(ground&&p[1]-ground[1]>.92)return null;
      physicalSamples.push(p);
      if(i>0){
        const mid=lerp(a,b,(i-.5)/n);
        treads.push({center:[mid[0],mid[1]-.017,mid[2]],length:flat/n*1.09,width:.29,yaw});
      }
    }
  }
  if(physicalSamples.length<30||treads.length<25||
     d3(physicalSamples[0],walk)>.00001||
     d3(physicalSamples[physicalSamples.length-1],liftPort)>.00001)return null;
  for(let i=1;i<physicalSamples.length;i++){
    if(d3(physicalSamples[i-1],physicalSamples[i])>.077||
       Math.abs(physicalSamples[i-1][1]-physicalSamples[i][1])>.056)return null;
  }
  return {kind:'bridge',physicalSamples,treads};
}

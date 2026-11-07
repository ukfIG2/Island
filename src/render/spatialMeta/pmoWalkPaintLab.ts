/** Experimental, NOT persisted: substitute real terrain PMO paint for generated stairs.
 * A brush makes terrain eligible for evaluation; it never grants a virtual edge.
 * All new samples are actual terrain hits near the old derived stair, and every
 * eventual walk edge must pass the production grade/microstep validator.
 */
import type { SpatialPoint, SpatialRegistry, SpatialMetaObject } from './registry';
import type { TerrainProjector, NavigationGraph } from './navigation';
import type { PmoLandingExtension } from './pmoLandingRepair';
import type { PmoDockExtension } from './pmoTransitionDockRepair';

const clone=(p:SpatialPoint):SpatialPoint=>[p[0],p[1],p[2]];
const gap=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const synthId='pmo-walk-paint-lab-derived-not-persisted';

export interface WalkPaintLabResult {
  registry:SpatialRegistry;
  stamps:readonly SpatialPoint[];
  diagnostics:readonly string[];
}

/** Build tiny walk paint strokes ONLY over measurable existing ground. Never paint
 * canyon air as traversable and never overwrite the authored registry. The
 * already-existing synthetic stairs are used as hypotheses to probe, not as
 * proof that a new ordinary path is walkable. */
export function buildWalkPaintLabRegistry(
  registry:SpatialRegistry, terrain:TerrainProjector,
  landings:readonly PmoLandingExtension[], docks:readonly PmoDockExtension[]
):WalkPaintLabResult {
  const footprints=registry.objects.filter(o=>/^building_\d+$/.test(o.name)&&o.geometry.type==='skeleton')
    .flatMap(o=>o.geometry.type==='skeleton'?Object.values(o.geometry.points):[]);
  const polyline=[...landings.map(e=>e.physicalSamples),
    ...docks.filter(e=>e.kind==='stairs').map(e=>e.physicalSamples)];
  // In particular include the near-bridge-3 turn outside the building footprint.
  // It remains a *probe*, not permission to cross steep/unsupported terrain.
  const bridge3:SpatialPoint[]=[
    [1.54,-.97,2.66],[.9,-.9557,2.9],[.5513,-1.0402,2.7778]
  ];
  polyline.push(bridge3);
  const points:SpatialPoint[]=[],seen=new Set<string>();
  let offGround=0,insideBuilding=0;
  const register=(p:SpatialPoint)=>{
    const hit=terrain.project(p[0],p[2],p[1]);
    if(!hit||Math.abs(hit[1]-p[1])>.055){offGround++;return;}
    // Do not add newly authorized pavement beneath the actual building bases.
    if(footprints.some(b=>Math.abs(b[1]-hit[1])<.85&&gap(b,hit)<.445)){
      insideBuilding++;return;
    }
    const key=[Math.round(hit[0]*100),Math.round(hit[1]*100),Math.round(hit[2]*100)].join(':');
    if(seen.has(key))return;
    seen.add(key);points.push(clone(hit));
  };
  for(const samples of polyline){
    for(let i=0;i<samples.length;i++){
      register(samples[i]);
      if(i===0)continue;
      const a=samples[i-1],b=samples[i];
      // Never interpolate painted coverage across a long discontinuous jump.
      if(gap(a,b)>.24||Math.abs(a[1]-b[1])>.20)continue;
      const steps=Math.ceil(gap(a,b)/.09);
      for(let j=1;j<steps;j++){
        const t=j/steps;
        register([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t]);
      }
    }
  }
  // Multiple discrete stamps preserve gaps when there is no terrain. The
  // compiler still rejects slopes > .72 and steps > .20 at fine resolution.
  const brush:SpatialMetaObject={
    id:synthId,name:'lab_terrain_walk_paint_not_authored',visible:false,revision:0,relations:[],
    metadata:{navigation:{walkable:true},experiment:'generated-stairs-to-terrain-paint',persisted:false},
    geometry:{type:'paint',strokes:points.map((p,i)=>({
      id:`lab-walk-${i}`,radius:.105,color:'#3be0c1',points:[p]
    }))}
  };
  const duplicate=registry.objects.some(o=>o.id===synthId);
  return {registry:duplicate?registry:{...registry,objects:[...registry.objects,brush]},stamps:points,
    diagnostics:[`PMO_WALK_PAINT_LAB_PROBES:${polyline.length}`,
      `PMO_WALK_PAINT_LAB_STAMPS:${points.length}`,
      `PMO_WALK_PAINT_LAB_REJECTED_OFF_GROUND:${offGround}`,
      `PMO_WALK_PAINT_LAB_REJECTED_BUILDING_FOOTPRINT:${insideBuilding}`]};
}

/** Retire every GENERATED stair surface and corresponding graph edge atomically.
 * The original authored PMO stairs remain unchanged. No hidden stair shortcut.
 */
export function retireGeneratedStairsForPaintLab(
  input:NavigationGraph, landings:readonly PmoLandingExtension[],docks:readonly PmoDockExtension[]
) {
  const retiredIds=new Set<string>([...landings.map(x=>x.id),
    ...docks.filter(x=>x.kind==='stairs').map(x=>x.id)]);
  const deletedPortals=new Set(landings.flatMap(l=>[l.portalA,l.portalB]));
  const nodes=Object.fromEntries(Object.entries(input.nodes).filter(([id])=>!deletedPortals.has(id)));
  const outgoing=Object.fromEntries(Object.entries(input.outgoing)
    .filter(([id])=>!deletedPortals.has(id))
    .map(([id,edges])=>[id,edges.filter(e=>!retiredIds.has(e.sourceId)&&!deletedPortals.has(e.to))]));
  const filteredDocks=docks.filter(d=>d.kind!=='stairs');
  return {graph:{...input,nodes,outgoing} as NavigationGraph,
    landings:[] as PmoLandingExtension[],docks:filteredDocks,
    diagnostics:[`PMO_WALK_PAINT_LAB_GENERATED_STAIRS_RETIRED:${retiredIds.size}`,
      `PMO_WALK_PAINT_LAB_AUTHORED_STAIRS_PRESERVED:yes`]};
}

/** Exact authored PMO infrastructure projection; geometry is NOT travel authorization. */
import type { SpatialPoint, SpatialRegistry } from './registry';
import type { TransitionKind } from './navigation';
import { annotateAuthoredPmoTransitions } from './pmoAuthoredTransitions';

export interface PmoStructureSegment {
  readonly center: SpatialPoint;
  readonly yaw: number;
  readonly pitch: number;
  readonly length: number;
  readonly width: number;
}
export interface PmoStructure {
  readonly sourceId: string;
  readonly edgeId: string;
  readonly kind: TransitionKind;
  readonly from: SpatialPoint;
  readonly to: SpatialPoint;
  readonly segments: readonly PmoStructureSegment[];
  readonly travelCertified: false;
}
const at = (a: SpatialPoint, b: SpatialPoint, t: number): SpatialPoint => [
  a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t
];
export function projectPmoTransitionStructures(registry: SpatialRegistry): PmoStructure[] {
  const typed = annotateAuthoredPmoTransitions(registry);
  const out: PmoStructure[] = [];
  const seen = new Set<string>();
  for (let i=0;i<registry.objects.length;i++) {
    const source=registry.objects[i], object=typed.objects[i];
    // Exactly identity-verified legacy authoring, not arbitrary named or user-edited objects.
    if (object === source || object.geometry.type !== 'skeleton') continue;
    const kind = (object.metadata.navigation as {transition?: unknown})?.transition;
    if (kind!=='bridge' && kind!=='stairs' && kind!=='lift') continue;
    if (object.geometry.edges.length!==1 || seen.has(object.id)) continue;
    const edge=object.geometry.edges[0];
    if (edge.directed!==false) continue;
    const from=object.geometry.points[edge.from],to=object.geometry.points[edge.to];
    if (!from || !to || ![...from,...to].every(Number.isFinite)) continue;
    const dx=to[0]-from[0],dy=to[1]-from[1],dz=to[2]-from[2];
    const horizontal=Math.hypot(dx,dz);
    if (horizontal<0.05 || horizontal>30) continue;
    const count=kind==='lift'?0:Math.max(2,Math.ceil(horizontal/0.12),kind==='stairs'?Math.ceil(Math.abs(dy)/0.07):2);
    const yaw=Math.atan2(dx,dz),pitch=kind==='stairs'?0:-Math.atan2(dy,horizontal);
    const segments:PmoStructureSegment[]=[];
    for(let j=0;j<count;j++)segments.push({center:at(from,to,(j+0.5)/count),yaw,pitch,
      length:horizontal/count*1.06,width:kind==='stairs'?0.25:0.32});
    out.push({sourceId:object.id,edgeId:edge.id,kind,from:[...from],to:[...to],segments,travelCertified:false});
    seen.add(object.id);
  }
  return out;
}

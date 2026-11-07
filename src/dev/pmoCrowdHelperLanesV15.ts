/** Crowd-only personal lanes on existing AUTHORED, physically sampled stairs and bridges.
 * The authoritative helper ports, helper identity, FIFO occupancy and native
 * physical center trace remain unchanged. No passenger collision or teleport.
 * Each actor gets one stable, deterministic lateral lane over the real box tops.
 */
import type {PmoStructure} from '../render/spatialMeta/pmoTransitionStructures';
import type {PmoRouteHelper,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';

export type BaseHelperSampler = (helper:PmoRouteHelper,t:number,from:SpatialPoint,to:SpatialPoint)=>SpatialPoint|null;
const copy=(p:SpatialPoint):SpatialPoint=>[p[0],p[1],p[2]];
const d3=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const hash=(s:string)=>{let v=2166136261;for(let i=0;i<s.length;i++)v=Math.imul(v^s.charCodeAt(i),16777619);return (v^(v>>>16))>>>0;};
const lerp=(a:SpatialPoint,b:SpatialPoint,t:number):SpatialPoint=>[
  a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
const EPS=1e-5;

/** Return true only when the point has support on the surface of an ACTUAL
 * rendered transition box. Stairs' boxes are horizontal and bridges may pitch.
 * Box X is transverse, Box Z longitudinal; yaw + pitch follow the authoring.
 */
export function supportedByAuthoredBox(p:SpatialPoint,structure:PmoStructure):boolean {
  for(const box of structure.segments){
    const dx=p[0]-box.center[0],dz=p[2]-box.center[2];
    const s=Math.sin(box.yaw),c=Math.cos(box.yaw);
    const across=dx*c-dz*s,along=dx*s+dz*c;
    if(Math.abs(across)>box.width/2+.0001||Math.abs(along)>box.length/2+.0001)continue;
    // The native center trace samples these exact same boxes. The profile in
    // local X is level: lateral displacement does not change the top height.
    // For pitched bridges, use the center trace's already certified elevation,
    // accepting only when it lies close to this exact authored top.
    const top=box.center[1]+.017+along*Math.tan(-box.pitch);
    if(Math.abs(top-p[1]) <= (structure.kind==='stairs'?.077:.065))return true;
  }
  return false;
}

/** Builds on the SAME authored geometry and native sampler used by Crowd Test.
 * For an unknown/custom landing or lift, keep exact original movement.
 */
export function createCrowdPersonalHelperLanes(
  structures:readonly PmoStructure[],
  native:BaseHelperSampler,
): (helper:PmoRouteHelper,t:number,from:SpatialPoint,to:SpatialPoint,actorId?:string)=>SpatialPoint|null {
  const authored=new Map(structures.filter(s=>s.kind==='stairs'||s.kind==='bridge').map(s=>[s.sourceId,s]));
  const chosen=new Map<string,number>();
  const stats={calls:0,shifted:0,centerFallbacks:0,uniqueActors:new Set<string>(),activeHelpers:new Set<string>()};
  const lane=[-1,-.75,-.5,-.25,0,.25,.5,.75,1];
  function point(helper:PmoRouteHelper,t:number,from:SpatialPoint,to:SpatialPoint,offset:number):SpatialPoint|null {
    const base=native(helper,t,from,to);
    if(!base)return null;
    if(!offset||t<=EPS||t>=1-EPS)return copy(base);
    const structure=authored.get(helper.sourceId);
    if(!structure)return copy(base);
    const seg=structure.segments[0];if(!seg)return copy(base);
    const lateral=Math.sin(Math.PI*Math.max(0,Math.min(1,t)))**2 * offset;
    const shifted:SpatialPoint=[base[0]+Math.cos(seg.yaw)*lateral,
      base[1],base[2]-Math.sin(seg.yaw)*lateral];
    return supportedByAuthoredBox(shifted,structure)?shifted:null;
  }
  function candidateSafe(helper:PmoRouteHelper,from:SpatialPoint,to:SpatialPoint,width:number):boolean {
    const structure=authored.get(helper.sourceId)!;
    let previous:SpatialPoint|null=null;
    for(let i=0;i<=120;i++){
      const t=i/120;
      const current=point(helper,t,from,to,width);
      const nativeAt=native(helper,t,from,to);
      if(!current||!nativeAt)return false;
      if(d3(current,nativeAt)>.085)return false;
      if(previous && d3(previous,current)>.092)return false;
      if(d3(current,lerp(from,to,t))>.145)return false;
      previous=current;
    }
    // Always land at EXACT port; never pick a lateral exit on a cliff edge.
    return !!structure;
  }
  return (helper,t,from,to,actorId)=>{
    if(!actorId||helper.kind==='lift'||!authored.has(helper.sourceId))return native(helper,t,from,to);
    stats.calls++;stats.uniqueActors.add(actorId);stats.activeHelpers.add(helper.sourceId);
    const identity=helper.id+'|'+actorId+'|'+(d3(from,helper.from)<.08?'f':'r');
    let width=chosen.get(identity);
    if(width===undefined){
      const structure=authored.get(helper.sourceId)!;
      const actualWidth=Math.min(...structure.segments.map(b=>b.width));
      const maximal=Math.min(.085,Math.max(0,actualWidth/2-.058));
      const desired=lane[hash(actorId+'|'+helper.sourceId)%lane.length]*maximal;
      width=0;
      for(const scale of [1,.78,.55,.35]){
        const attempt=desired*scale;
        if(Math.abs(attempt)<.006)break;
        if(candidateSafe(helper,from,to,attempt)){width=attempt;break;}
      }
      chosen.set(identity,width);
      if(!width)stats.centerFallbacks++;
    }
    const actual=point(helper,t,from,to,width)??native(helper,t,from,to);
    if(width&&t>.02&&t<.98)stats.shifted++;
    if(stats.calls===750||stats.calls===3000){
      console.info('RRH_PMO_HELPER_LANES_V15_LIVE',{
        calls:stats.calls,shifted:stats.shifted,centerFallbacks:stats.centerFallbacks,
        uniqueActors:stats.uniqueActors.size,activeHelpers:[...stats.activeHelpers]});
    }
    return actual;
  };
}

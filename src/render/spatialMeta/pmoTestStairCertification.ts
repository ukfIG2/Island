/** Dev-only physical inspection of the EXACT PMO-rendered stair treads.
 * Uses authored structures produced by strict identity-matched source bindings,
 * the production transition-access report and the island terrain connector.
 * It cannot authorize bridges, lifts, renamed/modified PMOs or arbitrary paint.
 *
 * The visual stairs use horizontal BoxGeometry(width, .034, length), with the
 * centres and orientation published by projectPmoTransitionStructures().
 * This analytic centreline sampler reads those precise box-top surfaces instead
 * of relying on scene Raycaster hits at extremely narrow tread boundaries.
 */
import type { SpatialPoint, PmoRouteHelper, PmoTerrainConnector } from './pmoBrushCorridors';
import type { PmoStructure } from './pmoTransitionStructures';
import type { PmoTransitionAccess } from './pmoTransitionAccess';

export interface CertifiedStairSurface {
  readonly kind: 'stairs';
  readonly edgeId: string;
  readonly points: readonly SpatialPoint[];
  readonly method: 'authored-visible-tread-top-sampling';
}
export type StairAudit = {
  readonly surfaces: Readonly<Record<string, CertifiedStairSurface>>;
  readonly accepted: readonly string[];
  readonly rejected: readonly string[];
};
const d3 = (a:readonly number[],b:readonly number[]) =>
  Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const near=(a:readonly number[],b:readonly number[],lim=0.08)=>d3(a,b)<=lim;
const lerp=(a:SpatialPoint,b:SpatialPoint,t:number):SpatialPoint=>[
  a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t
];

/** Checks a continuous chain of actual PMO box-tread tops, not an invented
 * terrain bridge or straight-line interpolation between stair endpoints. */
export function sampleAuthoredStairTreads(structure:PmoStructure): readonly SpatialPoint[] | null {
  if(structure.kind!=='stairs'||structure.segments.length<2||structure.segments.length>512) return null;
  const {from,to,segments}=structure;
  const dx=to[0]-from[0],dz=to[2]-from[2],length=Math.hypot(dx,dz);
  if(!Number.isFinite(length)||length<0.05||length>20)return null;
  const count=Math.ceil(length/0.025);
  const result:SpatialPoint[]=[];
  for(let i=0;i<=count;i++){
    const t=i/count;
    const candidate=lerp(from,to,t);
    // Ray from above exactly as the rendered BoxGeometry treads: select the
    // highest visible top whose Y is within the model's stair tolerance.
    let top=-Infinity;
    for(const segment of segments){
      if(Math.abs(segment.pitch)>1e-9||segment.width<0.2||segment.width>0.65||
        !(segment.length>0)||!segment.center.every(Number.isFinite)) return null;
      const ux=Math.sin(segment.yaw),uz=Math.cos(segment.yaw);
      const ox=candidate[0]-segment.center[0],oz=candidate[2]-segment.center[2];
      const along=ox*ux+oz*uz,lateral=ox*uz-oz*ux;
      if(Math.abs(along)>segment.length*0.5+1e-7 || Math.abs(lateral)>segment.width*0.5+1e-7)continue;
      const visibleTop=segment.center[1]+0.017; // PmoTransitionStructures BoxGeometry height .034
      if(Math.abs(visibleTop-candidate[1])<=0.075 && visibleTop>top)top=visibleTop;
    }
    if(!Number.isFinite(top))return null;
    const at:SpatialPoint=[candidate[0],top,candidate[2]];
    if(result.length && (d3(at,result[result.length-1])>0.11 ||
      Math.abs(at[1]-result[result.length-1][1])>0.076))return null;
    result.push(at);
  }
  if(!near(result[0],from)||!near(result[result.length-1],to))return null;
  return result;
}

export function certifyPmoTestStairs(
  structures:readonly PmoStructure[],accesses:readonly PmoTransitionAccess[],
  connector:PmoTerrainConnector
):StairAudit {
  const surfaces:Record<string,CertifiedStairSurface>={}, rejected:string[]=[];
  for(const structure of structures){
    if(structure.kind!=='stairs')continue;
    const access=accesses.find(a=>a.sourceId===structure.sourceId && a.edgeId===structure.edgeId);
    if(!access||!access.attached||!access.geometryContinuous||!access.eligibleForPhysicalReview){
      rejected.push(structure.sourceId+':PORTAL_OR_STRUCTURE_UNCERTIFIED:'+ (access?.issues.join('|')??'NO_ACCESS'));
      continue;
    }
    // Each port must be on the REAL imported terrain and authorized walking
    // paint. Access alone doesn't establish physical terrain ownership.
    const start=connector.project([...structure.from]),end=connector.project([...structure.to]);
    if(!start||!end||d3(start,structure.from)>0.025||d3(end,structure.to)>0.025){
      rejected.push(structure.sourceId+':PORTS_NOT_ON_AUTHORIZED_ISLAND');
      continue;
    }
    const points=sampleAuthoredStairTreads(structure);
    if(!points){rejected.push(structure.sourceId+':NO_CONTINUOUS_VISIBLE_TREAD_SURFACE');continue;}
    surfaces[structure.sourceId]={kind:'stairs',edgeId:structure.edgeId,points,method:'authored-visible-tread-top-sampling'};
  }
  return {surfaces,accepted:Object.keys(surfaces),rejected};
}

/** Helper is accepted only after both geometric certification above AND
 * compilePmoBrushCorridors has attached its exact ports to walkable nodes. */
export function stairRouteHelpers(
  structures:readonly PmoStructure[],surfaces:StairAudit['surfaces']
):PmoRouteHelper[]{
  return structures.filter(s=>s.kind==='stairs' && !!surfaces[s.sourceId]).map(s=>({
    id:s.sourceId,sourceId:s.sourceId,edgeId:s.edgeId,kind:'stairs' as const,
    from:[...s.from],to:[...s.to],capacity:4
  }));
}

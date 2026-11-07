/** Read-only PMO transition approach audit; authorization is not locomotion certification. */
import type { NavigationGraph, NavNode } from './navigation';
import type { SpatialPoint } from './registry';
import type { PmoStructure } from './pmoTransitionStructures';

export interface PmoTransitionAccess {
  sourceId: string;
  edgeId: string;
  kind: PmoStructure['kind'];
  attached: boolean;
  geometryContinuous: boolean;
  eligibleForPhysicalReview: boolean;
  travelCertified: false;
  issues: string[];
  walkNodeIds: [string | null, string | null];
}

const near = (a: SpatialPoint, b: SpatialPoint) =>
  Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]) < 1e-5;
const finite = (p: SpatialPoint) => p.every(Number.isFinite);

function walkAttachment(graph: NavigationGraph, portalId: string, expected: SpatialPoint,
  sourceId: string): string | null {
  const portal = graph.nodes[portalId];
  if (!portal || portal.role !== 'portal' || portal.sourceId !== sourceId ||
      !finite(portal.position) || !near(portal.position, expected)) return null;
  const neighbors = (graph.outgoing[portalId] ?? []).filter(edge => {
    const walk: NavNode | undefined = graph.nodes[edge.to];
    const authenticWalk=edge.mode==='walk'&&edge.sourceId===sourceId;
    const supportedDock=(edge.mode==='bridge'||edge.mode==='stairs')&&
      edge.sourceId.startsWith('pmo-dock:'+sourceId+':');
    return (authenticWalk||supportedDock) &&
      !!walk && walk.role === 'walk' && finite(walk.position) &&
      (graph.outgoing[edge.to] ?? []).some(reverse =>
        reverse.to === portalId && reverse.mode === edge.mode && reverse.sourceId === edge.sourceId);
  });
  return neighbors.length ? neighbors.sort((a,b) => a.to.localeCompare(b.to))[0].to : null;
}

/** Every tread/deck segment must cover the next in XZ and track its authored centerline.
 * Lift cabin synchronization is separately required and remains fail-closed.
 */
function structuralContinuity(structure: PmoStructure): boolean {
  // The rendered lift has a rigid cabin and a continuous straight rail between
  // its two authored docks. Boarding is certified separately by PmoLiftTransit.
  if (structure.kind === 'lift') {
    const horizontal=Math.hypot(structure.to[0]-structure.from[0],structure.to[2]-structure.from[2]);
    const height=Math.abs(structure.to[1]-structure.from[1]);
    return finite(structure.from)&&finite(structure.to)&&structure.segments.length===0&&
      horizontal>=0.05&&horizontal<=4&&height>=0.10&&height<=4;
  }
  const {from,to,segments} = structure;
  if (!finite(from) || !finite(to) || segments.length < 2) return false;
  const dx=to[0]-from[0],dz=to[2]-from[2],dy=to[1]-from[1];
  const distance=Math.hypot(dx,dz);
  if (!(distance>=0.05) || !Number.isFinite(distance)) return false;
  const expectedStep=distance/segments.length;
  const slope=structure.kind==='stairs' ? Math.abs(dy)/segments.length : 0;
  if (slope>0.075) return false;
  return segments.every((segment,index) => {
    const t=(index+0.5)/segments.length;
    const center:SpatialPoint=[from[0]+dx*t,from[1]+dy*t,from[2]+dz*t];
    return finite(segment.center) && near(segment.center,center) &&
      Number.isFinite(segment.length) && Number.isFinite(segment.width) &&
      Number.isFinite(segment.yaw) && Number.isFinite(segment.pitch) &&
      segment.length>=expectedStep*1.001 && segment.width>=0.2 &&
      segment.width<=0.65;
  });
}

export function assessPmoTransitionAccess(
  structures: readonly PmoStructure[], graph: NavigationGraph
): PmoTransitionAccess[] {
  return structures.map(structure => {
    const issues: string[]=[];
    const first=walkAttachment(graph,`portal:${structure.edgeId}:0`,structure.from,structure.sourceId);
    const second=walkAttachment(graph,`portal:${structure.edgeId}:1`,structure.to,structure.sourceId);
    const attached=!!first && !!second;
    if (!first) issues.push('FIRST_PORTAL_NOT_TERRAIN_ATTACHED');
    if (!second) issues.push('SECOND_PORTAL_NOT_TERRAIN_ATTACHED');
    const geometryContinuous=structuralContinuity(structure);
    if (!geometryContinuous) issues.push('DECK_STAIRS_OR_LIFT_TRACK_NOT_CONTINUOUS');
    // Explicitly no automatic movement promotion from authored geometry or graph.
    if (structure.kind !== 'lift') issues.push('SPECIAL_TRANSITION_RUNTIME_TRAVEL_NOT_CERTIFIED');
    else issues.push('LIFT_REQUIRES_RUNTIME_CABIN_RESERVATION');
    return {sourceId:structure.sourceId,edgeId:structure.edgeId,kind:structure.kind,
      attached,geometryContinuous,eligibleForPhysicalReview:attached && geometryContinuous,
      travelCertified:false,issues,walkNodeIds:[first,second]};
  });
}

/** Single physical walking gate shared by graph certification and actual actors.
 * Never turns a PMO mark or a terrain probe into permission to cross a steep seam.
 * Does NOT handle stairs, bridges or lifts: they require their own physical carrier.
 */
import type { BrushGraph, PmoTerrainConnector, SpatialPoint } from './pmoBrushCorridors';

const d3=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
const xz=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
export type WalkStepFault='PROJECT_FAILED'|'LOCAL_GRADE_OR_VERIFY_FAILED'|'NO_FORWARD_PROGRESS';
export type WalkAttempt={next:SpatialPoint; fault:null}|{next:null;fault:WalkStepFault;rejected?:SpatialPoint};

/** Accept exactly the attempted displacement. Both the runner and the static
 * route audit use this function, including its bounded substeps. */
export function attemptCertifiedWalkStep(
  at:SpatialPoint,to:SpatialPoint,graph:Pick<BrushGraph,'rules'>,
  connector:PmoTerrainConnector,requestedAdvance:number,
):WalkAttempt {
  if(!(requestedAdvance>0&&Number.isFinite(requestedAdvance)))return {next:null,fault:'NO_FORWARD_PROGRESS'};
  const remaining=d3(at,to);
  if(remaining<0.0005){
    if(!connector.verify(at,to)||!connector.verify(to,at))return {next:null,fault:'LOCAL_GRADE_OR_VERIFY_FAILED'};
    return {next:[...to],fault:null};
  }
  let advance=Math.min(requestedAdvance,0.07,remaining);
  let gradeFailure=false,projectionFailure=false;
  let rejected:SpatialPoint|undefined;
  for(let trial=0;trial<8&&advance>=0.00012;trial++,advance*=0.5){
    const fraction=advance/remaining;
    const candidate:SpatialPoint=[at[0]+(to[0]-at[0])*fraction,
      at[1]+(to[1]-at[1])*fraction,at[2]+(to[2]-at[2])*fraction];
    const projected=connector.project(candidate);
    if(!projected||projected.some(v=>!Number.isFinite(v))||xz(projected,candidate)>0.025){projectionFailure=true;continue;}
    const dx=xz(at,projected),dy=Math.abs(at[1]-projected[1]);
    // Vertical movement without horizontal support is not an ordinary walk.
    if(dy>graph.rules.maxStepY+1e-8 ||
      (dx<1e-8 ? dy>1e-8 : dy/dx>graph.rules.maxGrade+1e-8) ||
      !connector.verify(at,projected)||!connector.verify(projected,at)){
      gradeFailure=true;rejected??=[...projected];continue;
    }
    if(d3(at,projected)<1e-9)continue;
    return {next:[...projected],fault:null};
  }
  return {next:null,fault:gradeFailure?'LOCAL_GRADE_OR_VERIFY_FAILED':projectionFailure?'PROJECT_FAILED':'NO_FORWARD_PROGRESS',rejected};
}

/** Preflight a whole directed edge against EXACTLY the runner's local gate.
 * Both directions are audited separately by the graph adaptor. */
export function certifyDirectedWalk(
  from:SpatialPoint,to:SpatialPoint,graph:Pick<BrushGraph,'rules'>,
  connector:PmoTerrainConnector,increment=0.006,optionalTrace?:SpatialPoint[],
):{fault:WalkStepFault;at:SpatialPoint;toward:SpatialPoint;dx:number;dy:number;verifyForward:boolean;verifyReverse:boolean}|null{
  if(!(increment>0&&increment<=0.017))throw Error('PMO_MOTION_AUDIT_UNSAFE_INCREMENT');
  let at:SpatialPoint=[...from];
  optionalTrace?.push([...at]);
  const limit=Math.ceil(d3(from,to)/increment)*12+16;
  for(let i=0;i<limit;i++){
    if(d3(at,to)<0.0005){
      // IMPORTANT: route preflight and live trace replay MUST make the same
      // decision. Previously the last sub-0.5mm hop was verified only when
      // optionalTrace existed: preflight would accept an edge which the actual
      // pedestrian rejected with WALK_TRACE_LOCAL_GRADE_OR_VERIFY_FAILED.
      // Never infer permission from proximity alone.
      if(d3(at,to)>1e-8){
        const last=attemptCertifiedWalkStep(at,to,graph,connector,d3(at,to));
        if(!last.next){
          const probe=last.rejected??connector.project(to);
          return {fault:last.fault,at,toward:to,dx:probe?xz(at,probe):0,
            dy:probe?Math.abs(at[1]-probe[1]):0,
            verifyForward:connector.verify(at,to),verifyReverse:connector.verify(to,at)};
        }
      }
      optionalTrace?.push([...to]);
      return null;
    }
    const result=attemptCertifiedWalkStep(at,to,graph,connector,increment);
    if(!result.next){
      const probe=result.rejected??connector.project(to);
      return {fault:result.fault,at,toward:to,dx:probe?xz(at,probe):0,
        dy:probe?Math.abs(at[1]-probe[1]):0,
        verifyForward:connector.verify(at,to),verifyReverse:connector.verify(to,at)};
    }
    if(d3(at,result.next)<1e-9)break;
    at=result.next;optionalTrace?.push([...at]);
  }
  return {fault:'NO_FORWARD_PROGRESS',at,toward:to,dx:0,dy:0,verifyForward:false,verifyReverse:false};
}

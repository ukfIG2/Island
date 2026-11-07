import type {SpatialPoint,RouteStep} from './pmoBrushCorridors';
/** Conservatively treat two return paths as a shared single-lane resource if
 * their physically projected corridors overlap. Route comparison is ADMISSION
 * ONLY: navigation and the pedestrian collision gate remain authoritative.
 * Special transports cannot be inferred from endpoint segments, so they reserve
 * their full return path until their rider exits.
 */
function projectionToSegment(p:SpatialPoint,a:SpatialPoint,b:SpatialPoint):number {
  const dx=b[0]-a[0],dz=b[2]-a[2],denom=dx*dx+dz*dz;
  return denom<1e-12?0:Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[2]-a[2])*dz)/denom));
}
function nearReturnSegments(a:RouteStep,b:RouteStep):boolean {
  const points:[number,number][]=[];
  // Closest endpoint projections, plus an interior intersection candidate.
  for(const t of [0,1]){
    const p:SpatialPoint=[a.from[0]+(a.to[0]-a.from[0])*t,a.from[1]+(a.to[1]-a.from[1])*t,a.from[2]+(a.to[2]-a.from[2])*t];
    points.push([t,projectionToSegment(p,b.from,b.to)]);
  }
  for(const u of [0,1]){
    const p:SpatialPoint=[b.from[0]+(b.to[0]-b.from[0])*u,b.from[1]+(b.to[1]-b.from[1])*u,b.from[2]+(b.to[2]-b.from[2])*u];
    points.push([projectionToSegment(p,a.from,a.to),u]);
  }
  const ax=a.to[0]-a.from[0],az=a.to[2]-a.from[2],bx=b.to[0]-b.from[0],bz=b.to[2]-b.from[2];
  const cross=ax*bz-az*bx;
  if(Math.abs(cross)>1e-12){
    const cx=b.from[0]-a.from[0],cz=b.from[2]-a.from[2];
    const t=(cx*bz-cz*bx)/cross,u=(cx*az-cz*ax)/cross;
    if(t>=0&&t<=1&&u>=0&&u<=1)points.push([t,u]);
  }
  return points.some(([t,u])=>{
    const dx=a.from[0]+ax*t-(b.from[0]+bx*u);
    const dz=a.from[2]+az*t-(b.from[2]+bz*u);
    const dy=a.from[1]+(a.to[1]-a.from[1])*t-(b.from[1]+(b.to[1]-b.from[1])*u);
    return Math.hypot(dx,dz)<0.18 && Math.abs(dy)<0.22;
  });
}
export function pmoRouteStepsConflict(a:readonly RouteStep[],b:readonly RouteStep[]):boolean {
  if(a.some(s=>s.kind!=='walk')||b.some(s=>s.kind!=='walk'))return true;
  for(const x of a)for(const y of b)if(nearReturnSegments(x,y))return true;
  return false;
}

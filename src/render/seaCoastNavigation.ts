/** DEV sea navigation: physical shoreline SDF -> collision-constrained A* ->
 * line-of-sight reduction -> validated curve approximation.
 * The same island mask drives the visible ocean; no imaginary circular coast.
 * PMO entry stamps select the approach, they do not make land traversable.
 */
import type { IslandWaterBoundary } from './islandWaterBoundary';
import {seaBeachArcClearance,type BeachArcBoundary,type BeachArcBarrier} from './seaBeachCollisionArc';
import type { SpatialPoint } from './spatialMeta/registry';
export type SeaPoint = [number, number, number];
export interface SeaContourInput {
  readonly boundary: IslandWaterBoundary;
  /** Authored circular brush stamps, not flattened center points. */
  readonly beachStrokes: readonly SeaPaintStroke[];
  readonly clearance?: number;
  /** Optional deterministic random stream for reproducible test voyages. */
  readonly random?: () => number;
}
export interface SeaPaintStroke { readonly id:string;readonly radius:number;readonly points:readonly SpatialPoint[]; }
const SEA_Y = -2.35;
/** Actual land footprint is enlarged by 30%, about its measured SDF land centre.
 * This affects navigation/collision only, NOT the rendered island or ocean shader. */
export const SEA_COLLISION_ISLAND_SCALE = 1.30;
interface IslandFootprint { centerX:number;centerZ:number;diameter:number; }
const footprints = new WeakMap<IslandWaterBoundary,IslandFootprint>();
const arcBoxes = new WeakMap<BeachArcBarrier,{minX:number;maxX:number;minZ:number;maxZ:number}>();
function seaArcBoxDistance(arc:BeachArcBarrier,x:number,z:number):number {
  let b=arcBoxes.get(arc);
  if(!b){
    let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity;
    for(const p of arc.outline){minX=Math.min(minX,p[0]);maxX=Math.max(maxX,p[0]);minZ=Math.min(minZ,p[2]);maxZ=Math.max(maxZ,p[2]);}
    b={minX,maxX,minZ,maxZ};arcBoxes.set(arc,b);
  }
  return Math.hypot(Math.max(0,b.minX-x,x-b.maxX),Math.max(0,b.minZ-z,z-b.maxZ));
}
const EPS = 1e-8;
const horizontal=(a:readonly number[], b:readonly number[])=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const point=(x:number,z:number):SeaPoint=>[x,SEA_Y,z];
/** Decode the same two-channel signed distance mapping used by the ocean. */
function rawSeaClearance(boundary:IslandWaterBoundary,x:number,z:number):number {
  const image=boundary.distanceTexture.image;
  const width=image.width, height=image.height, data=image.data;
  if(!data || !width || !height)throw Error('SEA_BOUNDARY_TEXTURE_MISSING');
  const u=(x-boundary.origin.x)/boundary.extent.x;
  const v=(z-boundary.origin.y)/boundary.extent.y;
  if(u<0||u>1||v<0||v>1)return -Infinity; // never assume unobserved water
  const px=u*(width-1), py=v*(height-1);
  const x0=Math.floor(px), y0=Math.floor(py), x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1);
  const decode=(ix:number,iy:number):number=>{
    const k=(iy*width+ix)*4;
    return (((data[k]*256+data[k+1])/65535)*2-1)*boundary.distanceRange;
  };
  const tx=px-x0,ty=py-y0;
  return (decode(x0,y0)*(1-tx)+decode(x1,y0)*tx)*(1-ty)+
    (decode(x0,y1)*(1-tx)+decode(x1,y1)*tx)*ty;
}
/** Sample a coarse grid once, never treat the texture viewport as island geometry.
 * We bound ONLY cells with negative SDF; these define physical land extent. */
export function seaIslandFootprint(boundary:IslandWaterBoundary):IslandFootprint {
  const existing=footprints.get(boundary);if(existing)return existing;
  let left=Infinity,right=-Infinity,front=Infinity,back=-Infinity;
  const sx=boundary.extent.x,sz=boundary.extent.y;
  const stepX=sx/127,stepZ=sz/127;
  for(let iz=0;iz<=127;iz++)for(let ix=0;ix<=127;ix++){
    const x=boundary.origin.x+ix*stepX,z=boundary.origin.y+iz*stepZ;
    if(rawSeaClearance(boundary,x,z)<=0){
      left=Math.min(left,x);right=Math.max(right,x);
      front=Math.min(front,z);back=Math.max(back,z);
    }
  }
  if(!Number.isFinite(left))throw Error('SEA_LAND_FOOTPRINT_MISSING');
  const result={centerX:(left+right)*.5,centerZ:(front+back)*.5,
    diameter:Math.max(right-left+stepX,back-front+stepZ)*SEA_COLLISION_ISLAND_SCALE};
  footprints.set(boundary,result);return result;
}
export function sampleSeaClearance(boundary:IslandWaterBoundary,x:number,z:number):number {
  if(x<boundary.origin.x||x>boundary.origin.x+boundary.extent.x||
     z<boundary.origin.y||z>boundary.origin.y+boundary.extent.y)return -Infinity;
  const land=seaIslandFootprint(boundary);
  // Exact uniform dilation of the original geometric silhouette about its land
  // centre, including asymmetric bays/peninsulas (not a circular radius cutoff).
  const sampleX=land.centerX+(x-land.centerX)/SEA_COLLISION_ISLAND_SCALE;
  const sampleZ=land.centerZ+(z-land.centerZ)/SEA_COLLISION_ISLAND_SCALE;
  const shore=rawSeaClearance(boundary,sampleX,sampleZ)*SEA_COLLISION_ISLAND_SCALE;
  const arc=(boundary as BeachArcBoundary).beachArcBarrier;
  if(!arc)return shore;
  // AABB distance never exceeds the exact distance to any barrier segment.
  // The margin preserves a conservative decision at the comparison boundary.
  if(seaArcBoxDistance(arc,x,z)-arc.thickness>=shore+1e-8)return shore;
  return Math.min(shore,seaBeachArcClearance(arc,x,z));
}

/** Debug-only coastline of the 1.30x obstacle, not the ocean material shore.
 * Finds the last land cell on each radial from the measured land-centre. */
export function seaScaledIslandOutline(boundary:IslandWaterBoundary):SeaPoint[] {
  const land=seaIslandFootprint(boundary);
  const maxRadius=Math.min(boundary.extent.x,boundary.extent.y)*.495;
  const output:SeaPoint[]=[];
  for(let i=0;i<=96;i++){
    const a=i/96*Math.PI*2,ux=Math.cos(a),uz=Math.sin(a);
    let lastLand=-1;
    for(let r=.12;r<=maxRadius;r+=.11){
      if(sampleSeaClearance(boundary,land.centerX+ux*r,land.centerZ+uz*r)<=0)lastLand=r;
    }
    if(lastLand>0)output.push(point(land.centerX+ux*lastLand,land.centerZ+uz*lastLand));
  }
  return output;
}

/** Long, distant offshore maneuver region. Its chord spans 2x the scaled
 * island diameter. The bend is a shallow seaward bulge rather than an old
 * navigation ring around the island. */
export function seaManeuverLens(boundary:IslandWaterBoundary,dock:SeaPoint,clearance:number):SeaPoint[] {
  const land=seaIslandFootprint(boundary);
  const ox=dock[0]-land.centerX,oz=dock[2]-land.centerZ,n=Math.hypot(ox,oz);
  if(n<1e-5)throw Error('SEA_LENS_NO_OFFSHORE_AXIS');
  const ux=ox/n,uz=oz/n,sx=-uz,sz=ux;
  const length=land.diameter*2,halfWidth=length/2;
  const offset=Math.max(4.0,land.diameter*.46,clearance*3);
  return Array.from({length:41},(_,i)=>{
    const t=i/20-1;
    const spread=halfWidth*t;
    const bulge=land.diameter*.08*(1-t*t);
    return point(dock[0]+ux*(offset+bulge)+sx*spread,
                 dock[2]+uz*(offset+bulge)+sz*spread);
  });
}
/** Curved bow-forward half-turn after reversing away from the beach.
 * Initial tangent points toward the shore; final tangent points offshore.
 * Both port/starboard choices are checked against the scaled island SDF.
 */
export function seaOffshoreUTurn(boundary:IslandWaterBoundary,lensPoint:SeaPoint,
  dock:SeaPoint,outgoing:SeaPoint,clearance:number,
  candidateCheck?:(arc:SeaPoint[],outbound:SeaPoint[])=>boolean):{arc:SeaPoint[];exitStart:SeaPoint;outbound:SeaPoint[]} {
  const foot=seaIslandFootprint(boundary);
  const dx=dock[0]-lensPoint[0],dz=dock[2]-lensPoint[2],d=Math.hypot(dx,dz);
  if(d<1e-5)throw Error('SEA_TURN_INVALID_SHORE_AXIS');
  const hx=dx/d,hz=dz/d,nx=-hz,nz=hx;
  const candidates:{arc:SeaPoint[];exitStart:SeaPoint;score:number}[]=[];
  const inGrid=(p:SeaPoint)=>p[0]>=boundary.origin.x+.45&&p[0]<=boundary.origin.x+boundary.extent.x-.45&&
    p[2]>=boundary.origin.y+.45&&p[2]<=boundary.origin.y+boundary.extent.y-.45;
  for(const r of [foot.diameter*.18,foot.diameter*.14,foot.diameter*.10]){
    for(const direction of [-1,1]){
      const subdivisions=Math.max(48,Math.ceil(Math.PI*r/.065));
      const arc=Array.from({length:subdivisions+1},(_,i)=>{
        const a=Math.PI*i/subdivisions;
        return point(lensPoint[0]+r*(hx*Math.sin(a)+direction*nx*(1-Math.cos(a))),
                     lensPoint[2]+r*(hz*Math.sin(a)+direction*nz*(1-Math.cos(a))));
      });
      const end=arc[arc.length-1];
      const exitStart=point(end[0]-hx*Math.min(1.6,foot.diameter*.15),end[2]-hz*Math.min(1.6,foot.diameter*.15));
      if(!inGrid(exitStart)||!inGrid(end)||!validCurve(boundary,[...arc,exitStart],clearance))continue;
      // Rank all geometrically valid turns before expensive coastal replanning.
      candidates.push({arc,exitStart,score:horizontal(exitStart,outgoing)+r*.06});
    }
  }
  candidates.sort((a,b)=>a.score-b.score);
  // Lazy route construction preserves candidate ordering and all acceptance checks.
  // A safe earlier candidate avoids needless detours for lower-ranked turns.
  for(const candidate of candidates){
    let outbound:SeaPoint[];
    try{outbound=routeOnSea(boundary,candidate.exitStart,outgoing,clearance);}
    catch{continue;}
    if(candidateCheck&&!candidateCheck(candidate.arc,outbound))continue;
    return {arc:candidate.arc,exitStart:candidate.exitStart,outbound};
  }
  throw Error('SEA_LENS_TURN_NO_SAFE_ARC');
}

export function chooseSeaManeuverPoint(boundary:IslandWaterBoundary,dock:SeaPoint,
  incoming:SeaPoint,clearance:number):{lens:SeaPoint[];point:SeaPoint} {
  const lens=seaManeuverLens(boundary,dock,clearance);
  // Central portion offers a long straight bow-in berth approach. Sideways
  // offset merely permits boats from different camera edges to meet the lens.
  const indices=[20,18,22,16,24,14,26,12,28];
  let best:SeaPoint|null=null,score=Infinity;
  for(const i of indices){const p=lens[i];
    if(!seaSegmentClear(boundary,p,dock,clearance))continue;
    // Arrival can reach p by replan, even when direct camera chord crosses land.
    const merit=horizontal(incoming,p)+Math.abs(i-20)*.6;
    if(merit<score){score=merit;best=p;}
  }
  if(!best)throw Error('SEA_LENS_NO_SAFE_BOW_IN_APPROACH');
  return {lens,point:best};
}

export function seaSegmentClear(boundary:IslandWaterBoundary,a:readonly number[],b:readonly number[],clearance:number):boolean {
  const steps=Math.max(1,Math.ceil(horizontal(a,b)/0.105));
  for(let i=0;i<=steps;i++){
    const t=i/steps;
    if(sampleSeaClearance(boundary,a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t)<clearance)return false;
  }
  return true;
}

/** Sample the union of the actual painted PMO discs (area, not stroke centers).
 * Overlaps are accepted once by coverage-number rejection, avoiding double bias.
 * Never samples empty gaps between disconnected strokes.
 */
export function sampleSeaPaintTarget(strokes:readonly SeaPaintStroke[],random:()=>number=Math.random):SeaPoint {
  const discs=strokes.flatMap(s=>s.points.map(p=>({point:p,radius:s.radius}))).filter(d=>
    d.point.every(Number.isFinite)&&Number.isFinite(d.radius)&&d.radius>0);
  if(!discs.length)throw Error('SEA_PMO_BEACH_PAINT_MISSING');
  const total=discs.reduce((a,d)=>a+Math.PI*d.radius*d.radius,0);
  const random01=()=>{const value=random();if(!Number.isFinite(value)||value<0||value>=1)throw Error('SEA_RANDOM_INVALID');return value;};
  for(let attempt=0;attempt<1024;attempt++){
    let draw=random01()*total;
    let picked=discs[discs.length-1];
    for(const d of discs){draw-=Math.PI*d.radius*d.radius;if(draw<=0){picked=d;break;}}
    const theta=2*Math.PI*random01(),rr=picked.radius*Math.sqrt(random01());
    const x=picked.point[0]+Math.cos(theta)*rr,z=picked.point[2]+Math.sin(theta)*rr;
    const cover=discs.reduce((n,d)=>n+(Math.hypot(x-d.point[0],z-d.point[2])<=d.radius+1e-9?1:0),0);
    if(cover>0&&random01()*cover<1)return point(x,z);
  }
  throw Error('SEA_PMO_PAINT_SAMPLING_EXHAUSTED');
}

/** Distinguish the painted mooring target from the safe hull-center dock.
 * The ship must clear terrain; its PMO destination still lies inside a real mark.
 * Advance by the positive shoreline-SDF gradient, NOT a fake island ring.
 */
export function safeSeaDockForPaint(paint:SeaPoint,boundary:IslandWaterBoundary,clearance:number):SeaPoint {
  const [x,,z]=paint;
  const sd=(a:number,b:number)=>sampleSeaClearance(boundary,a,b);
  if(sd(x,z)>=clearance)return paint;
  const h=.22,dx=sd(x+h,z)-sd(x-h,z),dz=sd(x,z+h)-sd(x,z-h);
  const len=Math.hypot(dx,dz);
  if(len<1e-6)throw Error('SEA_PMO_NO_OUTWARD_SHORE_GRADIENT');
  const ux=dx/len,uz=dz/len;
  for(let offset=.08;offset<=6;offset+=.08){
    const candidate=point(x+ux*offset,z+uz*offset);
    if(sd(candidate[0],candidate[2])>=clearance+.07)return candidate;
  }
  throw Error('SEA_PMO_SAFE_HULL_CENTER_UNREACHABLE');
}

class MinHeap {
  readonly values:{node:number;rank:number}[]=[];
  push(node:number,rank:number){const v={node,rank},a=this.values;let i=a.length;a.push(v);
    while(i>0){const p=(i-1)>>1;if(a[p].rank<=rank)break;a[i]=a[p];i=p;}a[i]=v;}
  pop():{node:number;rank:number}|undefined {const a=this.values;if(!a.length)return;
    const first=a[0],last=a.pop()!;if(a.length){let i=0;while(true){const l=i*2+1,r=l+1;
      if(l>=a.length)break;const child=r<a.length&&a[r].rank<a[l].rank?r:l;
      if(a[child].rank>=last.rank)break;a[i]=a[child];i=child;}a[i]=last;}
    return first;}
}

/** A* over the coastal collision field. It runs once when the test is prepared,
 * not in requestAnimationFrame. A strict fail-closed result is intentional.
 */
function findCoastalDetour(boundary:IslandWaterBoundary,start:SeaPoint,end:SeaPoint,clearance:number,planningClearance=clearance):SeaPoint[] {
  if(seaSegmentClear(boundary,start,end,clearance))return [start,end];
  const step=.32, ox=boundary.origin.x+.2,oz=boundary.origin.y+.2;
  const w=Math.floor((boundary.extent.x-.4)/step)+1,h=Math.floor((boundary.extent.y-.4)/step)+1;
  if(w<2||h<2||w*h>100000)throw Error('SEA_GRID_UNSUPPORTED');
  const toIndex=(x:number,z:number)=>{
    const col=Math.round((x-ox)/step),row=Math.round((z-oz)/step);
    if(col<0||row<0||col>=w||row>=h)return -1;
    return row*w+col;
  };
  const loc=(i:number):SeaPoint=>point(ox+(i%w)*step,oz+Math.floor(i/w)*step);
  const startIx=toIndex(start[0],start[2]),endIx=toIndex(end[0],end[2]);
  if(startIx<0||endIx<0)throw Error('SEA_ENDPOINT_OUTSIDE_BOUNDARY');
  const n=w*h,blocked=new Uint8Array(n);
  for(let i=0;i<n;i++){const p=loc(i);blocked[i]=sampleSeaClearance(boundary,p[0],p[2])<planningClearance?1:0;}
  // Near-grid endpoint snap needs actual clearance, including last short leg.
  const anchors=[startIx,endIx];
  for(let k=0;k<2;k++){
    if(!blocked[anchors[k]] && seaSegmentClear(boundary,k===0?start:end,loc(anchors[k]),clearance))continue;
    const p=k===0?start:end;let best=-1,near=Infinity;
    for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){
      const col=(anchors[k]%w)+dx,row=Math.floor(anchors[k]/w)+dy;
      if(col<0||row<0||col>=w||row>=h)continue;
      const idx=row*w+col,q=loc(idx),dist=horizontal(p,q);
      if(!blocked[idx]&&dist<near&&seaSegmentClear(boundary,p,q,clearance)){near=dist;best=idx;}
    }
    if(best<0)throw Error('SEA_ENDPOINT_NO_SAFE_GRID_CONNECTION');
    anchors[k]=best;
  }
  const [s,t]=anchors,dist=new Float64Array(n).fill(Infinity),parent=new Int32Array(n).fill(-1);
  const heap=new MinHeap();dist[s]=0;heap.push(s,horizontal(loc(s),loc(t)));
  const neighbors=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  let expanded=0;
  while(heap.values.length){const current=heap.pop()!,i=current.node,pi=loc(i);
    if(current.rank>dist[i]+horizontal(pi,loc(t))+1e-6)continue;
    if(i===t)break;
    if(++expanded>n*3)throw Error('SEA_ROUTE_SEARCH_BUDGET_EXCEEDED');
    const col=i%w,row=Math.floor(i/w);
    for(const [dx,dy] of neighbors){const x=col+dx,y=row+dy;
      if(x<0||y<0||x>=w||y>=h)continue;
      const j=y*w+x;if(blocked[j])continue;
      const pj=loc(j),candidate=dist[i]+horizontal(pi,pj);
      // Cost relaxation is independent of the collision predicate.
      if(candidate+EPS>=dist[j])continue;
      if(!seaSegmentClear(boundary,pi,pj,planningClearance))continue;
      dist[j]=candidate;parent[j]=i;heap.push(j,candidate+horizontal(pj,loc(t)));
    }
  }
  if(!Number.isFinite(dist[t]))throw Error('SEA_ISLAND_COLLISION_NO_ROUTE');
  const reverse:SeaPoint[]=[];
  for(let i=t;i>=0;i=parent[i]){reverse.push(loc(i));if(i===s)break;}
  reverse.reverse();
  const raw=[start,...reverse,end];
  const reduced:SeaPoint[]=[raw[0]];
  for(let i=0;i<raw.length-1;){let j=raw.length-1;
    while(j>i+1&&!seaSegmentClear(boundary,raw[i],raw[j],i===0||j===raw.length-1?clearance:planningClearance))j--;
    if(j<=i)throw Error('SEA_VISIBILITY_REDUCTION_FAILED');
    reduced.push(raw[j]);i=j;
  }
  return reduced;
}
/** Dense C1 quadratic fillets: tangent at each junction matches its adjoining
 * straight leg. Fillets consume up to 48% of adjacent legs — aggressive
 * smoothing, not just line simplification. All resulting samples are certified.
 */
function smoothWithFillets(waypoints:readonly SeaPoint[],strength:number):SeaPoint[] {
  if(waypoints.length<=2)return [...waypoints];
  const out:SeaPoint[]=[[...waypoints[0]]];
  for(let i=1;i<waypoints.length-1;i++){
    const a=waypoints[i-1],v=waypoints[i],b=waypoints[i+1];
    const d0=horizontal(a,v),d1=horizontal(v,b);
    if(d0<1e-6||d1<1e-6)continue;
    const entering=point(v[0]+(a[0]-v[0])*strength,v[2]+(a[2]-v[2])*strength);
    const leaving=point(v[0]+(b[0]-v[0])*strength,v[2]+(b[2]-v[2])*strength);
    out.push(entering);
    const segments=Math.max(12,Math.ceil(horizontal(entering,leaving)/.07));
    for(let j=1;j<=segments;j++){
      const t=j/segments,u=1-t;
      out.push(point(u*u*entering[0]+2*u*t*v[0]+t*t*leaving[0],
        u*u*entering[2]+2*u*t*v[2]+t*t*leaving[2]));
    }
  }
  out.push([...waypoints[waypoints.length-1]]);
  return out;
}
function validCurve(boundary:IslandWaterBoundary,curve:readonly SeaPoint[],clearance:number):boolean {
  return curve.every(p=>sampleSeaClearance(boundary,p[0],p[2])>=clearance)&&
    curve.slice(1).every((p,i)=>seaSegmentClear(boundary,curve[i],p,clearance));
}

/** Strict pipeline: INITIAL STRAIGHT -> COLLISION REPLAN -> STRONG FILLET.
 * A wider collision corridor is searched if smoothing would cut the island.
 * No silent fallback to a polygonal, sharp-cornered route.
 */
export function routeOnSea(boundary:IslandWaterBoundary,from:SeaPoint,to:SeaPoint,clearance:number):SeaPoint[]{
  if(seaSegmentClear(boundary,from,to,clearance))return [from,to];
  const attempts=[clearance+.5,clearance+.85,clearance+1.2,clearance+1.6,clearance+2];
  let lastError='SEA_CURVE_NOT_COLLISION_CERTIFIED';
  for(const planningClearance of attempts){
    try {
      const raw=findCoastalDetour(boundary,from,to,clearance,planningClearance);
      for(const strength of [.48,.42,.34,.26]){
        const curve=smoothWithFillets(raw,strength);
        if(validCurve(boundary,curve,clearance))return curve;
      }
    } catch(e){lastError=String(e);}
  }
  throw Error('SEA_SMOOTH_COLLISION_ROUTE_UNAVAILABLE: '+lastError+' from='+JSON.stringify(from)+' to='+JSON.stringify(to));
}
/** May smooth join points only when resulting dense curve is safely navigable. */
export function smoothSeaRoute(boundary:IslandWaterBoundary,points:readonly SeaPoint[],clearance:number):SeaPoint[]{
  if(points.length<2)throw Error('SEA_EMPTY_ROUTE');
  // Fillet the final whole-route join; choose broad certified curve.
  for(const strength of [.48,.42,.34,.26]){
    const result=smoothWithFillets(points,strength);
    if(validCurve(boundary,result,clearance))return result;
  }
  throw Error('SEA_JOIN_SMOOTHING_NOT_CERTIFIED');
}

/** Distance-parameterized presentation sampling; stable speed around dense curves. */
export function sampleSeaRouteAt(path:readonly SeaPoint[],fraction:number):{position:SeaPoint;direction:[number,number]}{
  if(path.length<2)throw Error('SEA_ROUTE_HAS_NO_LEGS');
  const distances:number[]=[0];
  for(let i=1;i<path.length;i++)distances.push(distances[i-1]+horizontal(path[i-1],path[i]));
  const length=distances[distances.length-1];
  if(length<1e-8)throw Error('SEA_ROUTE_DEGENERATE');
  const target=Math.max(0,Math.min(1,fraction))*length;
  let j=1;while(j<distances.length-1&&distances[j]<target)j++;
  const a=path[j-1],b=path[j],leg=distances[j]-distances[j-1];
  const t=leg<1e-8?0:(target-distances[j-1])/leg;
  const position:SeaPoint=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
  const before=Math.max(0,target-.28),after=Math.min(length,target+.28);
  const at=(d:number):SeaPoint=>{
    let k=1;while(k<distances.length-1&&distances[k]<d)k++;
    const x=path[k-1],y=path[k],s=(d-distances[k-1])/Math.max(1e-9,distances[k]-distances[k-1]);
    return point(x[0]+(y[0]-x[0])*s,x[2]+(y[2]-x[2])*s);
  };
  const f=at(after),r=at(before);
  const norm=Math.hypot(f[0]-r[0],f[2]-r[2])||1;
  return {position,direction:[(f[0]-r[0])/norm,(f[2]-r[2])/norm]};
}

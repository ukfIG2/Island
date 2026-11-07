/** RRH sea V4.2: authored PMO-informed collision shoulders at the beach.
 * A U-shaped protected berth: two side shoulders and a rear shore arc,
 * OPEN TO THE SEA. Navigation-only; the island mesh and PMO aren't modified.
 * This is local per voyage (no global state on the shared shoreline).
 */
import type {IslandWaterBoundary} from './islandWaterBoundary';
import type {SeaPaintStroke,SeaPoint} from './seaCoastNavigation';

export interface BeachArcBarrier {
  readonly center:SeaPoint;
  readonly offshore:[number,number];
  readonly lateral:[number,number];
  readonly halfWidth:number;
  readonly offshoreLength:number;
  readonly thickness:number;
  /** Collision polyline: left open end -> rear shore cap -> right open end. */
  readonly outline:readonly SeaPoint[];
}
export interface BeachArcBoundary extends IslandWaterBoundary {
  readonly beachArcBarrier:BeachArcBarrier;
}
const SEA_Y=-2.35;
const point=(x:number,z:number):SeaPoint=>[x,SEA_Y,z];
const finite=(x:number)=>Number.isFinite(x);
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));

export function makeSeaBeachArc(boundary:IslandWaterBoundary,
  strokes:readonly SeaPaintStroke[],islandCenter:{centerX:number;centerZ:number},
  beam:number,centerClearance:number):BeachArcBarrier {
  const stamps=strokes.flatMap(s=>s.points.map(p=>({x:p[0],z:p[2],r:s.radius})))
    .filter(s=>finite(s.x)&&finite(s.z)&&finite(s.r)&&s.r>0);
  if(!stamps.length)throw Error('SEA_BEACH_ARC_NO_PMO');
  const cx=stamps.reduce((t,p)=>t+p.x,0)/stamps.length;
  const cz=stamps.reduce((t,p)=>t+p.z,0)/stamps.length;
  const dx=cx-islandCenter.centerX,dz=cz-islandCenter.centerZ;
  const len=Math.hypot(dx,dz);
  if(len<.1)throw Error('SEA_BEACH_ARC_INVALID_SHORE_AXIS');
  const offshore:[number,number]=[dx/len,dz/len];
  const lateral:[number,number]=[-offshore[1],offshore[0]];
  const spread=Math.max(...stamps.map(s=>Math.abs((s.x-cx)*lateral[0]+(s.z-cz)*lateral[1])+s.r));
  // V4.3: Every painted PMO disc needs a berth corridor on BOTH sides.
  // V4.2 allowed just beam/2 + .85 while route planning also demanded
  // centerClearance >= 2.3 from the side collision wall; the outer three
  // marks were therefore docked 7-10 world units out at the OPEN mouth.
  // Make the barrier shoulders outside the full PMO paint + vessel envelope.
  const halfWidth=Math.max(2.2,spread+beam/2+centerClearance+0.50);
  // Long enough to prohibit lateral land-cutting on FINAL approach, but not
  // an infinite wall across all surrounding open sea.
  const offshoreLength=Math.max(6.2,beam*5);
  const thickness=.48;
  const toWorld=(u:number,v:number)=>point(cx+lateral[0]*u+offshore[0]*v,
    cz+lateral[1]*u+offshore[1]*v);
  const outline:SeaPoint[]=[];
  const seg=18;
  // Seaward mouth is OPEN. Side walls curve around painted rear shoreline.
  for(let i=0;i<=seg;i++)outline.push(toWorld(-halfWidth,offshoreLength*(1-i/seg)));
  for(let i=1;i<=32;i++){
    const t=i/32;
    outline.push(toWorld(-halfWidth+2*halfWidth*t,-.85-1.1*Math.sin(Math.PI*t)));
  }
  for(let i=1;i<=seg;i++)outline.push(toWorld(halfWidth,offshoreLength*i/seg));
  return {center:point(cx,cz),offshore,lateral,halfWidth,offshoreLength,thickness,outline};
}

/** True signed distance to the barrier tubes: >=0 means outside all of them. */
export function seaBeachArcClearance(arc:BeachArcBarrier,x:number,z:number):number {
  let closest=Infinity;
  for(let i=1;i<arc.outline.length;i++){
    const a=arc.outline[i-1],b=arc.outline[i];
    const vx=b[0]-a[0],vz=b[2]-a[2];
    const d=vx*vx+vz*vz;
    const t=d>1e-10?clamp(((x-a[0])*vx+(z-a[2])*vz)/d,0,1):0;
    closest=Math.min(closest,Math.hypot(x-a[0]-vx*t,z-a[2]-vz*t));
  }
  return closest-arc.thickness;
}
export function withSeaBeachArc(boundary:IslandWaterBoundary,
  arc:BeachArcBarrier):BeachArcBoundary {
  return {...boundary,beachArcBarrier:arc};
}

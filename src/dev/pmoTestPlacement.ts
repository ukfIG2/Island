/** Test-only random placement inside authoritatively projected PMO brush paint. */
export type Point = [number, number, number];
export interface Stamp { readonly center: readonly [number,number,number]; readonly radius: number; readonly sourceId: string; }
export interface Terrain { project(point: Point): Point | null; verify(from: Point,to: Point): boolean; }
export interface BuildingSite { readonly name: string; readonly position: Point; readonly sourceId: string; }
export const TEST_NAMES = ['Reception', 'Food', 'Drinks', 'Relax', 'Ocean View'] as const;
const distanceXZ=(a:readonly number[],b:readonly number[])=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const finite=(p: readonly number[])=>p.length===3&&p.every(Number.isFinite);

export function placeTestBuildings(stamps: readonly Stamp[], terrain: Terrain, random: ()=>number, names: readonly string[]=TEST_NAMES): BuildingSite[] {
  const usable=stamps.filter(s=>finite(s.center)&&Number.isFinite(s.radius)&&s.radius>=0.12);
  if(!usable.length) return [];
  const weights=usable.map(s=>Math.PI*(s.radius-0.07)**2);
  const total=weights.reduce((a,b)=>a+b,0);
  const selected:BuildingSite[]=[];
  const rnd=()=>{const r=random(); if(!Number.isFinite(r)||r<0||r>=1)throw Error('BAD_RANDOM_GENERATOR'); return r;};
  const choose=()=>{let r=rnd()*total;for(let i=0;i<usable.length;i++){r-=weights[i];if(r<0)return usable[i];}return usable[usable.length-1];};
  for(const name of names){
    for(let i=0;i<650;i++){
      const brush=choose(), angle=rnd()*2*Math.PI, radius=Math.sqrt(rnd())*(brush.radius-0.07);
      const proposed:[number,number,number]=[brush.center[0]+Math.cos(angle)*radius,brush.center[1],brush.center[2]+Math.sin(angle)*radius];
      const p=terrain.project(proposed);
      if(!p||!finite(p)||distanceXZ(p,brush.center)>brush.radius-0.06||Math.abs(p[1]-brush.center[1])>0.52)continue;
      if(selected.some(s=>distanceXZ(s.position,p)<0.55))continue;
      // Check local footprint corners, each on the same brush and with genuinely walkable surface connectors.
      const footprints:[[number,number],[number,number],[number,number],[number,number]]=[[-.05,-.05],[-.05,.05],[.05,-.05],[.05,.05]];
      const ok=footprints.every(([dx,dz])=>{
        const q=terrain.project([p[0]+dx,p[1],p[2]+dz]);
        return !!q&&finite(q)&&distanceXZ(q,brush.center)<=brush.radius+1e-7&&Math.abs(q[1]-brush.center[1])<=0.52&&terrain.verify(p,q)&&terrain.verify(q,p);
      });
      if(!ok)continue;
      selected.push({name,position:[...p],sourceId:brush.sourceId});break;
    }
  }
  return selected;
}

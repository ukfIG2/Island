import {describe,it,expect} from 'vitest';
import {createCrowdPersonalHelperLanes,supportedByAuthoredBox} from './pmoCrowdHelperLanesV15';
import type {PmoStructure} from '../render/spatialMeta/pmoTransitionStructures';
import type {PmoRouteHelper,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
const p=(x:number,y:number,z:number):SpatialPoint=>[x,y,z];
const d=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
function structure(kind:'stairs'|'bridge',width:number):PmoStructure {
 const count=24;
 return {sourceId:'test-'+kind,edgeId:'edge-'+kind,kind,from:p(0,.017,0),to:p(0,.017,2.4),travelCertified:false,
  segments:Array.from({length:count},(_,i)=>({center:p(0,0,(i+.5)*.1),yaw:0,pitch:0,length:.106,width}))};
}
const bridge=structure('bridge',.32),stairs=structure('stairs',.25);
function helper(s:PmoStructure):PmoRouteHelper {
 return {id:s.sourceId,sourceId:s.sourceId,edgeId:s.edgeId,kind:s.kind,from:s.from,to:s.to,capacity:15};
}
const native=(_h:PmoRouteHelper,t:number,from:SpatialPoint,to:SpatialPoint):SpatialPoint=>p(
 from[0]+(to[0]-from[0])*t, from[1]+(to[1]-from[1])*t, from[2]+(to[2]-from[2])*t);
const sampler=createCrowdPersonalHelperLanes([bridge,stairs],native);

describe('PMO crowd V1.5 personal lanes on authored physical structures',()=>{
 it('creates different actual X/Z positions while keeping both EXACT ports',()=>{
  const h=helper(bridge);
  const samples=Array.from({length:50},(_,i)=>sampler(h,.5,h.from,h.to,'ferry-guest-'+String(i).padStart(3,'0'))!);
  const unique=new Set(samples.map(v=>Math.round(v[0]*1000)));
  expect(unique.size).toBeGreaterThan(3);
  for(const i of [0,5,14,26,47]){
   const id='ferry-guest-'+String(i).padStart(3,'0');
   expect(sampler(h,0,h.from,h.to,id)).toEqual(h.from);
   expect(sampler(h,1,h.from,h.to,id)).toEqual(h.to);
  }
 });
 it('never places a pedestrian outside the actual box surface (including both directions)',()=>{
  for(const s of [bridge,stairs])for(const reverse of [false,true]){
   const h=helper(s),from=reverse?h.to:h.from,to=reverse?h.from:h.to;
   for(let i=0;i<40;i++){
    const id='pedestrian-'+i;let previous:SpatialPoint|null=null;
    for(let j=0;j<=120;j++){
     const t=j/120,pt=sampler(h,t,from,to,id)!;
     expect(pt).not.toBeNull();
     expect(d(pt,native(h,t,from,to))).toBeLessThan(.086);
     if(j>0&&j<120)expect(supportedByAuthoredBox(pt,s)).toBe(true);
     if(previous)expect(d(previous,pt)).toBeLessThan(.10);
     previous=pt;
    }
   }
  }
 });
 it('uses stable deterministic lanes after many repeat samples, never oscillating randomly',()=>{
  const h=helper(bridge),id='ferry-guest-037';
  const a=Array.from({length:121},(_,i)=>sampler(h,i/120,h.from,h.to,id));
  const b=Array.from({length:121},(_,i)=>sampler(h,i/120,h.from,h.to,id));
  expect(a).toEqual(b);
  const middle=a[60]!,quarter=a[30]!;
  expect(Math.abs(middle[0])).toBeGreaterThanOrEqual(Math.abs(quarter[0]));
 });
 it('leaves lifts and non-authored supports unchanged',()=>{
  const h=helper(bridge),unknown={...h,id:'landing',sourceId:'landing',kind:'stairs' as const};
  const lift={...h,id:'lift',sourceId:'lift',kind:'lift' as const};
  expect(sampler(unknown,.5,unknown.from,unknown.to,'guest')).toEqual(native(unknown,.5,unknown.from,unknown.to));
  expect(sampler(lift,.5,lift.from,lift.to,'guest')).toEqual(native(lift,.5,lift.from,lift.to));
 });
 it('rejects an unsupported off-axis box and defaults to the certified native path',()=>{
  const noSurface={...bridge,segments:bridge.segments.map(s=>({...s,width:.06}))};
  const adapt=createCrowdPersonalHelperLanes([noSurface],native);
  const h=helper(noSurface);
  for(const i of [0,1,2,3,4,5])expect(adapt(h,.5,h.from,h.to,'person-'+i)).toEqual(native(h,.5,h.from,h.to));
 });
});

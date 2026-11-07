import { describe, it, expect } from 'vitest';
import type { PmoStructure } from '../render/spatialMeta/pmoTransitionStructures';
import type { PmoTransitionAccess } from '../render/spatialMeta/pmoTransitionAccess';
import { sampleAuthoredStairTreads, certifyPmoTestStairs } from './pmoTestStairCertification';

function structure(sourceId:string,from:[number,number,number],to:[number,number,number]):PmoStructure {
  const dx=to[0]-from[0],dz=to[2]-from[2],dy=to[1]-from[1];
  const hor=Math.hypot(dx,dz), count=Math.max(2,Math.ceil(hor/0.12),Math.ceil(Math.abs(dy)/0.07));
  const yaw=Math.atan2(dx,dz);
  return { sourceId,edgeId:'test-'+sourceId,kind:'stairs',from,to,
    travelCertified:false,
    segments:Array.from({length:count},(_,i)=>{
      const t=(i+0.5)/count;
      return {center:[from[0]+dx*t,from[1]+dy*t,from[2]+dz*t] as [number,number,number],
        yaw,pitch:0,length:hor/count*1.06,width:0.25};
    })};
}
function access(s:PmoStructure):PmoTransitionAccess {
  return {sourceId:s.sourceId,edgeId:s.edgeId,kind:s.kind,
    attached:true,geometryContinuous:true,eligibleForPhysicalReview:true,travelCertified:false,
    issues:['SPECIAL_TRANSITION_RUNTIME_TRAVEL_NOT_CERTIFIED'],walkNodeIds:['walk:foot','walk:head']};
}
const beach=structure('beach-authored',[1.6739,-2.2456,4.5734],[2.1003,-1.2289,3.6249]);
const upper=structure('upper-authored',[2.7129,-0.9812,1.1988],[3.3713,-0.4341,0.4165]);
const connector={project:(p:[number,number,number])=>[...p] as [number,number,number],verify:()=>true};

describe('physical PMO stair surface admission',()=>{
  it('samples both RRH authored stair geometries at the box tops, continuous and no linear teleport',()=>{
    for(const s of [beach,upper]){
      const samples=sampleAuthoredStairTreads(s);
      expect(samples).not.toBeNull();expect(samples!.length).toBeGreaterThan(35);
      expect(Math.hypot(...samples![0].map((v,i)=>v-s.from[i]))).toBeLessThan(0.08);
      for(let i=1;i<samples!.length;i++){
        const prev=samples![i-1],next=samples![i];
        expect(Math.hypot(next[0]-prev[0],next[1]-prev[1],next[2]-prev[2])).toBeLessThanOrEqual(0.11);
      }
    }
  });
  it('rejects gap in the actual rendered tread deck',()=>{
    const missing={...beach,segments:beach.segments.filter((_,i)=>i!==7)};
    expect(sampleAuthoredStairTreads(missing)).toBeNull();
  });
  it('rejects missing native portal attachments even if the stair mesh exists',()=>{
    const bad={...access(beach),attached:false};
    expect(certifyPmoTestStairs([beach],[bad],connector).accepted).toHaveLength(0);
  });
  it('rejects missing real terrain port without admitting a fictional staircase',()=>{
    const badConnector={...connector,project:(p:[number,number,number])=>p[1]>-1.5 ? null : p};
    const result=certifyPmoTestStairs([beach],[access(beach)],badConnector);
    expect(result.accepted).toHaveLength(0);
    expect(result.rejected[0]).toContain('PORTS_NOT_ON_AUTHORIZED_ISLAND');
  });
  it('accepts exactly native-access-certified, uninterrupted authored stairs',()=>{
    const result=certifyPmoTestStairs([beach,upper],[access(beach),access(upper)],connector);
    expect(result.accepted).toEqual(['beach-authored','upper-authored']);
    expect(result.surfaces['beach-authored'].method).toBe('authored-visible-tread-top-sampling');
  });
});

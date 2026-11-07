import {describe,expect,it} from 'vitest';
import {attemptCertifiedWalkStep,certifyDirectedWalk} from './pmoWalkKinematics';
import type {PmoTerrainConnector} from './pmoBrushCorridors';
const rules={step:0.14,maxWalkLink:0.32,maxStepY:0.2,maxGrade:0.72,paintHeightTolerance:0.52};
const flat:PmoTerrainConnector={project:p=>[...p],verify:()=>true};
const cliff:PmoTerrainConnector={
  project:p=>[p[0],p[0]<0.035?0:0.085,p[2]],
  verify:(a,b)=>{
    const dx=Math.hypot(a[0]-b[0],a[2]-b[2]);
    return dx<1e-8?Math.abs(a[1]-b[1])<1e-8:Math.abs(a[1]-b[1])/dx<=0.72+1e-8;
  },
};
describe('Shared PMO walker physical admission',()=>{
  it('accepts actual walking on a flat certified surface',()=>{
    expect(certifyDirectedWalk([0,0,0],[0.2,0,0],{rules},flat)).toBeNull();
    expect(attemptCertifiedWalkStep([0,0,0],[0.2,0,0],{rules},flat,0.006).fault).toBeNull();
  });
  it('rejects the short steep seam; neither frame size nor a coarse graph edge legalizes it',()=>{
    expect(certifyDirectedWalk([0,0,0],[0.07,0.085,0],{rules},cliff)).not.toBeNull();
  });
});

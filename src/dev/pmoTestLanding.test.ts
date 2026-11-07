import {describe,it,expect} from 'vitest';
import type { BrushGraph, SpatialPoint } from '../render/spatialMeta/pmoBrushCorridors';
import type { PmoStructure } from '../render/spatialMeta/pmoTransitionStructures';
import {planPmoTestLanding} from './pmoTestLanding';
const sourceId='pmo-3ae6a767-a0f4-40af-b982-ec36346bebe6';
const head:SpatialPoint=[0,-1,0];
const from:SpatialPoint=[-0.4,-2,0];
const target:SpatialPoint=[0.6,-0.7,0];
const beachStair:PmoStructure={sourceId,edgeId:'author-stair',kind:'stairs',from,to:head,
  segments:[],travelCertified:false};
const sites:SpatialPoint[]=[[-1,-.7,0],[-.8,-.7,0],[1.1,-.7,0],[1.2,-.7,0],[1.4,-.7,0]];
const graph:BrushGraph={
  nodes:[{id:0,point:head,sources:['walk']},{id:1,point:target,sources:['walk']},
    {id:2,point:[0.8,-.7,0],sources:['walk']}],
  neighbors:[[],[{to:2,kind:'walk',cost:0.2}],[{to:1,kind:'walk',cost:0.2}]],
  stamps:[{center:head,radius:1.5,sourceId:'walk'}],
  helpers:{[sourceId]:{sourceId,id:sourceId,edgeId:'author-stair',kind:'stairs',from,to:head,capacity:4}},
  rejectedHelpers:[],rules:{maxGrade:0.72,maxStepY:0.2,step:0.18,maxWalkLink:0.28,paintHeightTolerance:0.52}
};
const connector={project:(p:SpatialPoint):SpatialPoint=>[p[0],-1+0.5*Math.max(0,p[0]),p[2]],verify:()=>true};
describe('dev-only physical landing continuation',()=>{
  it('finds the real five-site walking component and constructs visible surface',()=>{
    const landing=planPmoTestLanding(graph,connector,beachStair,sites);
    expect(landing).not.toBeNull();
    expect(landing!.reachableSiteCount).toBe(5);
    expect(landing!.helper.from).toEqual(head);
    expect(landing!.helper.to).toEqual(target);
    expect(landing!.physicalPoints.length).toBeGreaterThan(15);
    expect(landing!.structure.segments.length).toBeGreaterThan(3);
  });
  it('does not manufacture a landing without the exact authored starting staircase',()=>{
    expect(planPmoTestLanding({...graph,helpers:{}},connector,beachStair,sites)).toBeNull();
    expect(planPmoTestLanding(graph,connector,{...beachStair,sourceId:'fake'},sites)).toBeNull();
  });
  it('rejects a landing whose physical terrain is absent',()=>{
    const noTerrain={...connector,project:(_p:SpatialPoint)=>null};
    expect(planPmoTestLanding(graph,noTerrain,beachStair,sites)).toBeNull();
  });
  it('does not connect components without at least five approved authored building sites',()=>{
    expect(planPmoTestLanding(graph,connector,beachStair,sites.slice(0,4))).toBeNull();
  });
});

import {describe,it,expect} from 'vitest';
import type {BrushGraph} from '../render/spatialMeta/pmoBrushCorridors';
import {auditCompiledTransitionConnectivity} from './pmoCompiledTransitionAudit';
const rules={step:0.14,maxWalkLink:0.32,maxGrade:0.72,maxStepY:0.20,paintHeightTolerance:0.52};
const graph:BrushGraph={
  nodes:[
    {id:0,point:[0,0,0],sources:['walk']},
    {id:1,point:[1,0,0],sources:['walk']},
    {id:2,point:[2,0,0],sources:['pmo-bridge']},
    {id:3,point:[4,0,0],sources:['pmo-bridge']},
  ],
  neighbors:[[{to:1,cost:1,kind:'walk'}],[{to:0,cost:1,kind:'walk'}],[],[]],
  stamps:[{center:[0,0,0],radius:1,sourceId:'walk'}],
  helpers:{},rejectedHelpers:[],rules,
};
const structure={sourceId:'pmo-bridge',edgeId:'edge1',kind:'bridge' as const,
  from:[2,0,0] as [number,number,number],to:[4,0,0] as [number,number,number],segments:[],travelCertified:false as const};
describe('compiled transition report',()=>{
  it('never promotes isolated physically certified portals to beach-reachable',()=>{
    const diagnosis=auditCompiledTransitionConnectivity(graph,[0,0,0],[structure],[],{accepted:['pmo-bridge'],rejected:[]});
    expect(diagnosis[0].status).toBe('CERTIFIED_BUT_ISOLATED');
    expect(diagnosis[0].portReachability).toEqual(['no','no']);
  });
  it('preserves exact refusal reason from the production graph',()=>{
    const diagnosis=auditCompiledTransitionConnectivity(graph,[0,0,0],[structure],[],{
      accepted:[],rejected:['pmo-bridge:UNVERIFIED_PORT_OR_STRUCTURE']});
    expect(diagnosis[0].status).toBe('REJECTED');
    expect(diagnosis[0].details).toContain('UNVERIFIED_PORT_OR_STRUCTURE');
  });
});

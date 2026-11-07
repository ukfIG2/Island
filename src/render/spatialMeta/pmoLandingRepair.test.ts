import {describe,expect,it} from 'vitest';
import type {NavigationGraph} from './navigation';
import type {PmoStructure} from './pmoTransitionStructures';
import type {PmoTransitionAccess} from './pmoTransitionAccess';
import {compilePmoLandingRepair} from './pmoLandingRepair';
import {routeNavigation} from './navigation';

const structure:PmoStructure={sourceId:'authored-stair-identity',edgeId:'authored-stair-edge',kind:'stairs',
  from:[-1,-2,0],to:[0,0,0],segments:[],travelCertified:false};
const access:PmoTransitionAccess={sourceId:structure.sourceId,edgeId:structure.edgeId,kind:'stairs',
  attached:true,geometryContinuous:true,eligibleForPhysicalReview:true,travelCertified:false,
  issues:[],walkNodeIds:['lower','left']};
const graph:NavigationGraph={schemaVersion:1,issues:[],nodes:{
  lower:{id:'lower',role:'walk',sourceId:'walk',position:[-1,-2,0]},
  left:{id:'left',role:'walk',sourceId:'walk',position:[0,0,0]},
  right:{id:'right',role:'walk',sourceId:'walk',position:[0.07,0.085,0]},
},outgoing:{lower:[],left:[],right:[]}};
const connector={project:(p:[number,number,number])=>p,verify:()=>true};

describe('Canonical PMO physical stair landing repair',()=>{
  it('adds only a visible, continuous tread chain anchored to a verified authored stair',()=>{
    const result=compilePmoLandingRepair(graph,connector,[structure],[access]);
    expect(result.extensions).toHaveLength(1);
    expect(result.extensions[0].treads.length).toBeGreaterThanOrEqual(3);
    expect(result.extensions[0].physicalSamples.length).toBeGreaterThanOrEqual(5);
    expect(routeNavigation(result.graph,'left','right').found).toBe(true);
    expect(graph.outgoing.left).toHaveLength(0); // original compiled graph immutable
  });
  it('fails closed if the original stair access lacks terrain certification',()=>{
    expect(compilePmoLandingRepair(graph,connector,[structure],[{...access,attached:false}]).extensions).toHaveLength(0);
  });
  it('never bridges an unbounded gap or a distant island component',()=>{
    const far:NavigationGraph={...graph,nodes:{...graph.nodes,
      right:{...graph.nodes.right,position:[2,0.085,0]}}};
    expect(compilePmoLandingRepair(far,connector,[structure],[access]).extensions).toHaveLength(0);
  });
});

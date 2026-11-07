import {describe,it,expect} from 'vitest';
import {joinBeachGatewayToMainWalk} from './pmoGatewayNetworkLink';
import type {NavigationGraph,TerrainProjector} from './navigation';
import type {SpatialPoint,SpatialRegistry} from './registry';
import type {PmoStructure} from './pmoTransitionStructures';

const h=-1.0;
const a:SpatialPoint=[2.10,h,3.22],b:SpatialPoint=[1.96,h+.06,2.66];
const approach:SpatialPoint=[3.64,h+.06,3.50];
const makeGraph=():NavigationGraph=>({schemaVersion:1,issues:[],nodes:{
  beach:{id:'beach',role:'walk',sourceId:'paint',position:a},
  main:{id:'main',role:'walk',sourceId:'paint',position:b},
  approach:{id:'approach',role:'walk',sourceId:'paint',position:approach},
  'portal:a-stair:0':{id:'portal:a-stair:0',role:'portal',sourceId:'main-stair',position:[1.67,-2.24,4.57]},
  'portal:a-stair:1':{id:'portal:a-stair:1',role:'portal',sourceId:'main-stair',position:[2.10,-1.22,3.62]}},
  outgoing:{beach:[{to:'portal:a-stair:1',mode:'walk',cost:0,sourceId:'main-stair'}],
    'portal:a-stair:0':[{to:'portal:a-stair:1',mode:'stairs',cost:1.2,sourceId:'main-stair'}],
    'portal:a-stair:1':[{to:'portal:a-stair:0',mode:'stairs',cost:1.2,sourceId:'main-stair'},{to:'beach',mode:'walk',cost:0,sourceId:'main-stair'}],main:[{to:'approach',mode:'walk',cost:2,sourceId:'paint'}],
    approach:[{to:'main',mode:'walk',cost:2,sourceId:'paint'}]}});
const registry={schemaVersion:1,coordinateSpace:'world',objects:[{
  id:'site-2',name:'building_2',revision:1,geometry:{type:'skeleton',points:{anchor:[4.1868,h+.06,3.4021]}},metadata:{}
}]} as unknown as SpatialRegistry;
const structures=[{sourceId:'main-stair',edgeId:'a-stair',kind:'stairs',from:[1.67,-2.24,4.57],to:[2.10,-1.22,3.62]}] as unknown as PmoStructure[];
const terrain:TerrainProjector={project:(x,z,nearY)=>[x,h+(3.22-z)/.56*.06,z]};
const connector={project:(p:SpatialPoint):SpatialPoint=>[p[0],h+(3.22-p[2])/.56*.06,p[2]],verify:()=>true};
describe('certified upper beach gateway network join',()=>{
  it('adds a visible physical helper with two ports and no virtual walk shortcut',()=>{
    const input=makeGraph();const result=joinBeachGatewayToMainWalk(input,registry,structures,connector,terrain,[]);
    expect(result.extensions).toHaveLength(1);
    const section=result.extensions[0];
    expect(section.id).toContain('main-stair');
    expect(section.physicalSamples.length).toBeGreaterThan(8);
    expect(section.treads.length).toBeGreaterThan(7);
    expect(result.graph.outgoing[section.portalA].some(e=>e.to===section.portalB&&e.mode==='stairs')).toBe(true);
    expect(result.graph.outgoing[section.portalB].some(e=>e.to===section.portalA&&e.mode==='stairs')).toBe(true);
    expect(input.nodes[section.portalA]).toBeUndefined();
  });
  it('anchors beach reachability to the authored bottom stair portal, never a nearby disconnected upper node',()=>{
    const graph=makeGraph();
    graph.nodes.rogue={id:'rogue',role:'walk',sourceId:'paint',position:[2.10,-1.22,3.62]};
    graph.outgoing.rogue=[{to:'approach',mode:'walk',cost:2,sourceId:'paint'}];
    graph.outgoing.approach.push({to:'rogue',mode:'walk',cost:2,sourceId:'paint'});
    const result=joinBeachGatewayToMainWalk(graph,registry,structures,connector,terrain,[]);
    expect(result.diagnostics.some(d=>d.startsWith('PMO_MAIN_GATEWAY_PHYSICAL_JOIN:'))).toBe(true);
    expect(result.extensions).toHaveLength(1);
    expect(result.extensions[0].from).toEqual(a);
  });
  it('fails closed if projected or approved surface disappears midway',()=>{
    const broken={...connector,project:(p:SpatialPoint)=>p[2]>2.85&&p[2]<2.95?null:connector.project(p)};
    const result=joinBeachGatewayToMainWalk(makeGraph(),registry,structures,broken,terrain,[]);
    expect(result.extensions).toHaveLength(0);
    expect(result.diagnostics[0]).toContain('REJECTED');
  });
  it('does not add a second helper where terrain connectivity already exists',()=>{
    const graph=makeGraph();graph.outgoing.beach.push({to:'main',cost:1,mode:'walk',sourceId:'paint'});
    graph.outgoing.main.push({to:'beach',cost:1,mode:'walk',sourceId:'paint'});
    const result=joinBeachGatewayToMainWalk(graph,registry,structures,connector,terrain,[]);
    expect(result.extensions).toHaveLength(0);
    expect(result.diagnostics).toEqual(['PMO_MAIN_GATEWAY_ALREADY_CONNECTED']);
  });
});

import {describe,it,expect} from 'vitest';
import {refineFifthSiteWalkExit} from './pmoCertifiedWalkRefinement';
import type {NavigationGraph} from './navigation';
import type {SpatialPoint,SpatialRegistry} from './registry';
import type {PmoStructure} from './pmoTransitionStructures';
import type {PmoTerrainConnector} from './pmoBrushCorridors';
const a:SpatialPoint=[3.22,-.43,.28],b:SpatialPoint=[3.50,-.43,.42];
const g=():NavigationGraph=>({schemaVersion:1,issues:[],nodes:{
  a:{id:'a',role:'walk',position:[...a],sourceId:'paint'},
  b:{id:'b',role:'walk',position:[...b],sourceId:'paint'},
},outgoing:{a:[{to:'b',cost:.32,mode:'walk',sourceId:'paint'}],
  b:[{to:'a',cost:.32,mode:'walk',sourceId:'paint'}]}});
const registry:SpatialRegistry={schemaVersion:1,coordinateSpace:'world',objects:[{
  id:'paint',name:'zone_pawns_can_move',geometry:{type:'paint',strokes:[{
    id:'s',radius:1.0,color:'#fff',points:[[3.36,-.43,.35]],
  }]},metadata:{navigation:{walkable:true}},relations:[],visible:true,revision:1,
}]};
const structures:PmoStructure[]=[{kind:'stairs',sourceId:'stair-45',edgeId:'e45',
  from:[2.7129,-.9812,1.1988],to:[3.3713,-.4341,.4165],segments:[],travelCertified:false}];
const centerline=(x:number)=>.28+(x-3.22)*.5;
const bumpy:PmoTerrainConnector={
  project:p=>{const bump=p[0]>3.319&&p[0]<3.397&&Math.abs(p[2]-centerline(p[0]))<.018;
    return [p[0],bump?-.13:-.43,p[2]];},
  verify:()=>true,
};
const connected=(gr:NavigationGraph)=>{
  const seen=new Set(['b']),queue=['b'];
  for(let i=0;i<queue.length;i++)for(const e of gr.outgoing[queue[i]]??[]){
    if(!seen.has(e.to)){seen.add(e.to);queue.push(e.to);}
  }
  return seen.has('a');
};
describe('fifth-site reverse egress physical walk refinement',()=>{
  it('routes around a local terrain spike, and only with certified bidirectional microsteps',()=>{
    const source=g();const result=refineFifthSiteWalkExit(source,registry,structures,bumpy);
    expect(result.repairedPairs).toBe(1);
    expect(result.newNodes).toBeGreaterThanOrEqual(2);
    expect(connected(result.graph)).toBe(true);
    expect(Object.keys(source.nodes)).toHaveLength(2);
    expect(result.diagnostics[0]).toContain('PHYSICAL_DETOUR');
  });
  it('fails closed when the complete corridor is outside approved geometry',()=>{
    const source=g();const noCross:PmoTerrainConnector={project:p=>
      p[0]>3.30&&p[0]<3.42?null:[...p],verify:()=>true};
    const result=refineFifthSiteWalkExit(source,registry,structures,noCross);
    expect(result.repairedPairs).toBe(0);
    expect(result.graph).toBe(source);
    expect(result.diagnostics[0]).toContain('NO_CERTIFIED_DETOUR');
  });
  it('cannot authorize a route without the exact intended authored stair',()=>{
    const source=g();const result=refineFifthSiteWalkExit(source,registry,[],bumpy);
    expect(result.graph).toBe(source);
    expect(result.newNodes).toBe(0);
  });
});

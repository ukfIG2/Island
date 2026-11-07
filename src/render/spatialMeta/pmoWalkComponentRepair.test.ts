import {describe,it,expect} from 'vitest';
import {repairCertifiedWalkComponents} from './pmoWalkComponentRepair';
import type {NavigationGraph} from './navigation';
import type {PmoTerrainConnector} from './pmoBrushCorridors';
const graph=():NavigationGraph=>({schemaVersion:1,issues:[],
 nodes:{a:{id:'a',position:[0,0,0],role:'walk',sourceId:'paint'},b:{id:'b',position:[.28,0,0],role:'walk',sourceId:'paint'}},
 outgoing:{a:[],b:[]}});
describe('canonical physical walk component repair',()=>{
 it('joins only two authored walk nodes when each microstep is terrain/paint certified',()=>{
  const connector:PmoTerrainConnector={project:p=>p,verify:()=>true};
  const result=repairCertifiedWalkComponents(graph(),connector);
  expect(result.added).toBe(1);
  expect(result.graph.outgoing.a[0].mode).toBe('walk');
 });
 it('refuses a steep 0.3m height jump over 0.28m',()=>{
  const g=graph();g.nodes.b.position=[.28,.3,0];
  const result=repairCertifiedWalkComponents(g,{project:p=>p,verify:()=>true});
  expect(result.added).toBe(0);
 });
 it('refuses an unpainted gap, even when the ends are valid',()=>{
  const result=repairCertifiedWalkComponents(graph(),{
   project:p=>p[0]>.08&&p[0]<.2?null:p,verify:()=>true});
  expect(result.added).toBe(0);
 });
});

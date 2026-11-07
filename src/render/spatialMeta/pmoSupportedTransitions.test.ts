import {describe,it,expect} from 'vitest';
import type {NavigationGraph} from './navigation';
import type {SpatialRegistry} from './registry';
import type {PmoStructure} from './pmoTransitionStructures';
import type {PmoTransitionAccess} from './pmoTransitionAccess';
import {buildPmoSupportedGraph,routePmoSupportedGraph} from './pmoSupportedTransitions';
function fixture(kind:'bridge'|'stairs'|'lift',attached=true){
  const from:[number,number,number]=[0,0,0],to:[number,number,number]=[1,0,0];
  const edgeId='edge-a',sourceId='physical-a',p0='portal:'+edgeId+':0',p1='portal:'+edgeId+':1';
  const points=Array.from({length:16},(_,i)=>({center:[(i+0.5)/16,0,0] as [number,number,number],yaw:Math.PI/2,pitch:0,length:1.06/16,width:0.32}));
  const structure:PmoStructure={sourceId,edgeId,kind,from,to,segments:points,travelCertified:false};
  const access:PmoTransitionAccess={sourceId,edgeId,kind,attached,geometryContinuous:kind!=='lift',eligibleForPhysicalReview:attached&&kind!=='lift',travelCertified:false,issues:[],walkNodeIds:attached?['left','right']:[null,null]};
  const walk=(id:string,position:[number,number,number])=>({id,position,sourceId:'paint',role:'walk' as const});
  const portal=(id:string,position:[number,number,number])=>({id,position,sourceId,role:'portal' as const});
  const link=(to:string,mode:'walk'|'bridge'|'stairs'|'lift')=>({to,mode,sourceId,cost:1});
  const graph={schemaVersion:1,issues:[],nodes:{left:walk('left',from),right:walk('right',to),[p0]:portal(p0,from),[p1]:portal(p1,to)},outgoing:{left:[link(p0,'walk')],right:[link(p1,'walk')],[p0]:[link('left','walk'),link(p1,kind)],[p1]:[link('right','walk'),link(p0,kind)]}} as unknown as NavigationGraph;
  const registry={objects:[]} as unknown as SpatialRegistry;
  return {structure,access,graph,registry};
}
describe('identity-scoped physical PMO transition graph',()=>{
  it('accepts only the supported bridge and materializes dense waypoints both directions',()=>{const {structure,access,graph,registry}=fixture('bridge');const view=buildPmoSupportedGraph(registry,graph,[structure],[access]);expect(view.acceptedSourceIds).toEqual(['physical-a']);const outward=routePmoSupportedGraph(view,'left','right');const backward=routePmoSupportedGraph(view,'right','left');expect(outward?.specialSourceIds).toEqual(['physical-a']);expect(outward?.points.length).toBeGreaterThan(30);expect(backward?.points.length).toBe(outward?.points.length);expect(outward?.points[0]).toEqual([0,0,0]);expect(backward?.points[0]).toEqual([1,0,0]);});
  it('rejects unattached bridge and all unsynchronized lifts',()=>{for(const [kind,attached] of [['bridge',false],['lift',true]] as const){const {structure,access,graph,registry}=fixture(kind,attached);const view=buildPmoSupportedGraph(registry,graph,[structure],[access]);expect(view.acceptedSourceIds).toEqual([]);expect(routePmoSupportedGraph(view,'left','right')).toBeNull();}});
  it('rejects mismatched PMO identity despite physical geometry',()=>{const {structure,access,graph,registry}=fixture('stairs');const view=buildPmoSupportedGraph(registry,graph,[structure],[{...access,sourceId:'forged'}]);expect(view.acceptedSourceIds).toEqual([]);expect(routePmoSupportedGraph(view,'left','right')).toBeNull();});
});

import {describe,expect,it} from 'vitest';
import type {PmoSupportedGraph} from './pmoSupportedTransitions';
import {certifyPmoSupportedWalkGraph,planPmoSupportedServiceRoute} from './pmoSpecialServiceRoutes';
function fixture():PmoSupportedGraph {
 const a:[number,number,number]=[0,0,0],p:[number,number,number]=[0.2,0,0],q:[number,number,number]=[0.8,0,0],b:[number,number,number]=[1,0,0];
 const pId='portal:bridge-edge:0',qId='portal:bridge-edge:1';
 const nodes={a:{id:'a',position:a,sourceId:'walk',role:'walk'},[pId]:{id:pId,position:p,sourceId:'bridge',role:'portal'},[qId]:{id:qId,position:q,sourceId:'bridge',role:'portal'},b:{id:'b',position:b,sourceId:'walk',role:'walk'}} as PmoSupportedGraph['graph']['nodes'];
 const edge=(to:string,mode:'walk'|'bridge',sourceId:string)=>({to,mode,sourceId,cost:0.2});
 return {graph:{schemaVersion:1,issues:[],nodes,outgoing:{a:[edge(pId,'walk','bridge')],[pId]:[edge('a','walk','bridge'),edge(qId,'bridge','bridge')],[qId]:[edge(pId,'bridge','bridge'),edge('b','walk','bridge')],b:[edge(qId,'walk','bridge')]}},surfaces:{bridge:{kind:'bridge',edgeId:'bridge-edge',points:[p,[0.5,0,0],q]}},acceptedSourceIds:['bridge'],rejectedSourceIds:['lift']};
}
describe('PMO certified service route connector',()=>{
 const verify=(a:[number,number,number],b:[number,number,number])=>Math.abs(a[0]-b[0])<0.25;
 it('traverses supported bridge in both directions with exact endpoints',()=>{const view=certifyPmoSupportedWalkGraph(fixture(),verify);const f=planPmoSupportedServiceRoute(view,[0,0,0],[1,0,0],verify);const r=planPmoSupportedServiceRoute(view,[1,0,0],[0,0,0],verify);expect(f?.specialSourceIds).toEqual(['bridge']);expect(r?.specialSourceIds).toEqual(['bridge']);expect(f?.points).toEqual([[0,0,0],[0.2,0,0],[0.5,0,0],[0.8,0,0],[1,0,0]]);expect(r?.points[0]).toEqual([1,0,0]);expect(r?.points.at(-1)).toEqual([0,0,0]);});
 it('rejects uncertified terrain approaches instead of teleporting',()=>{const view=certifyPmoSupportedWalkGraph(fixture(),()=>false);expect(planPmoSupportedServiceRoute(view,[0,0,0],[1,0,0],verify)).toBeNull();});
 it('rejects special transitions absent from physical support evidence',()=>{const x=fixture();const view=certifyPmoSupportedWalkGraph({...x,surfaces:{}},verify);expect(planPmoSupportedServiceRoute(view,[0,0,0],[1,0,0],verify)).toBeNull();});
 it('does not invent missing endpoint connectors',()=>{const view=certifyPmoSupportedWalkGraph(fixture(),verify);expect(planPmoSupportedServiceRoute(view,[-9,0,0],[1,0,0],verify)).toBeNull();});
});

import {describe,expect,it} from 'vitest';
import {planBrushCorridorRoute,type BrushGraph,type PmoTerrainConnector,type SpatialPoint} from './pmoBrushCorridors';
import {certifyDirectedWalk} from './pmoWalkKinematics';
import {PmoPedestrianRuntime} from './pmoPedestrianRuntime';
const pt=(x:number,z:number):SpatialPoint=>[x,0,z];
const A=pt(0,0),B=pt(.14,0),G=pt(.28,0),C=pt(0,.24),D=pt(.28,.24);
const connector:PmoTerrainConnector={
  // Thin cliff wholly inside a coarse graph edge. No stairs/helper here.
  project(p){return [p[0],p[0]>.055&&p[0]<.095&&Math.abs(p[2])<.045?.5:0,p[2]];},
  verify(){return true;},
};
function graph(detour:boolean):BrushGraph {
  const coords=detour?[A,B,G,C,D]:[A,B,G];
  const edges: {to:number;cost:number;kind:'walk'}[][]=coords.map(()=>[]);
  const edge=(a:number,b:number,cost:number)=>edges[a].push({to:b,cost,kind:'walk'});
  edge(0,1,.14);edge(1,2,.14);
  if(detour){edge(0,3,.24);edge(3,4,.28);edge(4,2,.24);}
  return {nodes:coords.map((point,id)=>({id,point,sources:['walk']})),neighbors:edges,
    stamps:[{center:pt(.13,.10),radius:1,sourceId:'walk'}],helpers:{},rejectedHelpers:[],
    rules:{step:.14,maxWalkLink:.32,maxGrade:.72,maxStepY:.20,paintHeightTolerance:.52}};
}
function advance(motor:PmoPedestrianRuntime,id:string){
  for(let i=0;i<700;i++){
    motor.tick(.02);
    const state=motor.snapshots().find(s=>s.id===id);
    if(state?.status==='blocked'||state?.status==='arrived')return state;
  }
  throw Error('motor did not terminate');
}
describe('RRH physical walk preflight V1.4.2',()=>{
  it('rejects a graph edge failing real 6mm grade and chooses existing safe detour',()=>{
    const g=graph(true);
    const raw=planBrushCorridorRoute(g,connector,A,G,.26,(a,b)=>certifyDirectedWalk(a,b,g,connector)===null);
    expect(raw.status).toBe('READY');
    if(raw.status!=='READY')return;
    expect(raw.steps.some(s=>s.kind==='walk'&&certifyDirectedWalk(s.from,s.to,g,connector)!==null)).toBe(true);
    const runtime=new PmoPedestrianRuntime(g,connector,{collisionSpacing:0,followCertifiedWalkTrace:true});
    const accepted=runtime.add({id:'ferry-guest-032',from:A,to:G,speed:.40});
    expect(accepted.status).toBe('READY');
    if(accepted.status!=='READY')return;
    for(const step of accepted.steps.filter(s=>s.kind==='walk'))
      expect(certifyDirectedWalk(step.from,step.to,g,connector)).toBeNull();
    expect(advance(runtime,'ferry-guest-032').status).toBe('arrived');
  });
  it('refuses an unsafe personalized deviation and keeps the certified baseline',()=>{
    const g=graph(true);
    const runtime=new PmoPedestrianRuntime(g,connector,{collisionSpacing:0,followCertifiedWalkTrace:true,
      varyRoute:(_id,route)=>route.status!=='READY'?route:{...route,steps:[
        {kind:'walk' as const,from:A,to:B,brushSourceIds:[]},...route.steps.slice(1)]},
    });
    const route=runtime.add({id:'guest-with-unsafe-jitter',from:A,to:G,speed:.4});
    expect(route.status).toBe('READY');
    if(route.status!=='READY')return;
    expect(route.steps.some(s=>s.kind==='walk'&&certifyDirectedWalk(s.from,s.to,g,connector)!==null)).toBe(false);
    expect(advance(runtime,'guest-with-unsafe-jitter').status).toBe('arrived');
  });
  it('fails closed when no physically certified route remains',()=>{
    const g=graph(false),runtime=new PmoPedestrianRuntime(g,connector,{collisionSpacing:0,followCertifiedWalkTrace:true});
    const result=runtime.add({id:'no-detour',from:A,to:G,speed:.4});
    expect(result.status).not.toBe('READY');
    expect(runtime.snapshots()).toHaveLength(0);
  });
});

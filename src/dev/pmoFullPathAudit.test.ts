import {describe,it,expect} from 'vitest';
import {compilePmoBrushCorridors,type SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
import {PmoLiftTransit} from '../render/spatialMeta/pmoLiftTransit';
import {auditAllPmoPaths,enumerateAuditEndpoints} from './pmoFullPathAudit';
const y=-2.15;
const flat={project:(p:SpatialPoint):SpatialPoint=>[p[0],y,p[2]],verify:()=>true};
const stations=Array.from({length:9},(_,i)=>({id:'site-'+i,name:'building_'+(i+1),
  anchor:[0.7*Math.cos(i*2*Math.PI/9),y,0.7*Math.sin(i*2*Math.PI/9)] as SpatialPoint}));
const graph=compilePmoBrushCorridors([{center:[0,y,0] as SpatialPoint,radius:4,sourceId:'walk'}],flat,[],{step:.18,maxWalkLink:.28});
function input(g=graph){return {graph:g,connector:flat,beach:[0,y,0] as SpatialPoint,
  sites:stations,transitions:[],physical:new Map(),liftFactory:()=>new PmoLiftTransit([],[],flat)};}

describe('complete directed PMO route matrix',()=>{
  it('tests beach and all nine sites in both directions plus all 72 directed inter-site routes',async()=>{
    const reports:number[]=[];
    const result=await auditAllPmoPaths(input(),undefined,r=>reports.push(r.totals.completed));
    expect(result.schema).toBe('rrh-pmo-full-path-audit/v1');
    expect(result.totals).toEqual({planned:90,completed:90,arrived:90,blocked:0,timeout:0,unreachable:0,rejected:0});
    expect(result.routes.filter(r=>r.direction==='site-site')).toHaveLength(72);
    expect(result.routes.filter(r=>r.direction==='beach-site')).toHaveLength(9);
    expect(result.routes.filter(r=>r.direction==='site-beach')).toHaveLength(9);
    expect(result.routes.every(r=>r.start&&r.goal&&r.end&&r.status==='ARRIVED'&&r.route.length>0)).toBe(true);
    expect(reports).toHaveLength(90);
  });
  it('reports disconnected or absent authored approaches instead of fabricating an arrival',async()=>{
    const bad=[...stations];bad[3]={...bad[3],anchor:[30,y,30]};
    const endpoints=enumerateAuditEndpoints(graph,[0,y,0],bad);
    expect(endpoints[3].point).toBeNull();
    const audit=await auditAllPmoPaths({...input(),sites:bad});
    expect(audit.routes.filter(r=>r.from==='building_4'||r.to==='building_4').every(r=>r.status==='NO_ENDPOINT')).toBe(true);
    expect(audit.totals.arrived).toBeLessThan(90);
  });
  it('keeps an available beach endpoint ahead of a larger but disconnected island component',()=>{
    const tiny={...graph,nodes:[
      {id:0,point:[3,y,0] as SpatialPoint,sources:['paint']},
      {id:1,point:[.5,y,0] as SpatialPoint,sources:['paint']},
      {id:2,point:[.52,y,0] as SpatialPoint,sources:['paint']},
      {id:3,point:[.7,y,0] as SpatialPoint,sources:['paint']},
      {id:4,point:[.8,y,0] as SpatialPoint,sources:['paint']},
    ],neighbors:[
      [{to:1,kind:'walk' as const,cost:2.5}],
      [{to:0,kind:'walk' as const,cost:2.5}],
      [{to:3,kind:'walk' as const,cost:.18},{to:4,kind:'walk' as const,cost:.28}],
      [{to:2,kind:'walk' as const,cost:.18},{to:4,kind:'walk' as const,cost:.1}],
      [{to:2,kind:'walk' as const,cost:.28},{to:3,kind:'walk' as const,cost:.1}],
    ]};
    const ep=enumerateAuditEndpoints(tiny,[3,y,0],[{id:'first',name:'building_1',anchor:[0,y,0]}]);
    expect(ep[0].connectedToBeach).toBe(true);
    expect(ep[0].nodeId).toBe(1);
    expect(ep[0].outgoingReachable).toBe(2);
  });
  it('supports cancellation and does not mutate supplied graph',async()=>{
    const before=JSON.stringify(graph);
    const stop=new AbortController();stop.abort();
    await expect(auditAllPmoPaths(input(),stop.signal)).rejects.toThrow('PMO_FULL_AUDIT_CANCELLED');
    expect(JSON.stringify(graph)).toBe(before);
  });
  it('chooses an outgoing-and-incoming approach instead of an incoming-only cul-de-sac',()=>{
    const directed={...graph,nodes:[
      {id:0,point:[3,y,0] as SpatialPoint,sources:['paint']},
      {id:1,point:[.49,y,0] as SpatialPoint,sources:['paint']},
      {id:2,point:[.55,y,0] as SpatialPoint,sources:['paint']},
      {id:3,point:[1,y,0] as SpatialPoint,sources:['paint']},
    ],neighbors:[[],[],[{to:1,kind:'walk' as const,cost:.06},{to:3,kind:'walk' as const,cost:.45}],
      [{to:2,kind:'walk' as const,cost:.45}]]};
    const endpoints=enumerateAuditEndpoints(directed,[3,y,0],
      [{id:'test',name:'building_5',anchor:[0,y,0]}]);
    expect(endpoints[0].nodeId).toBe(2);
    expect(endpoints[0].outgoingReachable).toBe(3);
    expect(endpoints[0].incomingReachable).toBe(2);
  });
});

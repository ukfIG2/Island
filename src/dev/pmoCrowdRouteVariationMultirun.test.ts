import {describe,it,expect} from 'vitest';
import {CrowdRouteVariation} from './pmoCrowdRouteVariation';
import type {BrushGraph,PmoTerrainConnector,RouteResult,RouteStep,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';

const point=(x:number,z:number):SpatialPoint=>[x,0,z];
const distance=(a:SpatialPoint,b:SpatialPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);

/** Reproduces the first disembark failure: after a helper the second walk run
 * starts with a NONZERO global step index. V1 read points[globalIndex]
 * from the LOCAL bend buffer, throwing "points[i] is not iterable".
 */
describe('RRH PMO route variation - multiple walk runs',()=>{
  it('personalizes walk runs before and after a stair without changing helper ports',()=>{
    const steps:RouteStep[]=[];
    for(let i=0;i<34;i++)steps.push({kind:'walk',from:point(i*.14,0),to:point((i+1)*.14,0),brushSourceIds:['paint']});
    const helperFrom=point(34*.14,0),helperTo=point(34*.14,1);
    steps.push({kind:'stairs',from:helperFrom,to:helperTo,helperId:'stairs-main',brushSourceIds:['paint']});
    for(let i=0;i<34;i++)steps.push({kind:'walk',from:point(34*.14+i*.14,1),to:point(34*.14+(i+1)*.14,1),brushSourceIds:['paint']});
    const route:RouteResult={status:'READY',steps,points:[steps[0].from,...steps.map(s=>s.to)],distance:10,brushSourceIds:['paint']};
    const graph={stamps:[],rules:{paintHeightTolerance:.52}} as unknown as BrushGraph;
    const connector:PmoTerrainConnector={project:p=>[...p],verify:()=>true};
    const variation=new CrowdRouteVariation(graph,connector,()=>true,.38,.5);
    const result=variation.apply('ferry-guest-001',route);
    expect(result.status).toBe('READY');
    if(result.status!=='READY')return;
    expect(result.steps).toHaveLength(steps.length);
    expect(variation.stats.accepted).toBeGreaterThan(0);
    expect(result.steps[0].from).toEqual(steps[0].from);
    expect(result.steps.at(-1)!.to).toEqual(steps.at(-1)!.to);
    expect(result.steps[34].kind).toBe('stairs');
    expect(result.steps[34].from).toEqual(helperFrom);
    expect(result.steps[34].to).toEqual(helperTo);
    for(let i=1;i<result.steps.length;i++){
      expect(distance(result.steps[i-1].to,result.steps[i].from)).toBeLessThan(1e-9);
    }
    expect(result.steps.slice(1,34).some((s,i)=>distance(s.to,steps[i+1].to)>.02)).toBe(true);
    expect(result.steps.slice(36).some((s,i)=>distance(s.to,steps[i+36].to)>.02)).toBe(true);
  });
});

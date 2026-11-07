import {describe,it,expect} from 'vitest';
import {CrowdRouteVariation} from './pmoCrowdRouteVariation';
import {buildCrowdSpatialPlan,ferrySite} from './pmoCrowdSpatialTargets';
import {compilePmoBrushCorridors,planBrushCorridorRoute} from '../render/spatialMeta/pmoBrushCorridors';
import {PmoPedestrianRuntime} from '../render/spatialMeta/pmoPedestrianRuntime';
import {certifyWalkMotion} from '../render/spatialMeta/pmoWalkMotionAudit';
import type {BrushGraph,PmoTerrainConnector,RouteResult,RouteStep,SpatialPoint} from '../render/spatialMeta/pmoBrushCorridors';
const pt=(x:number,z=0):SpatialPoint=>[x,0,z];
const terrain:PmoTerrainConnector={project:p=>[...p],verify:()=>true};
const stamps=Array.from({length:14},(_,i)=>({center:pt(i*.42),radius:.73,sourceId:'mark'+i}));
const graph=compilePmoBrushCorridors(stamps,terrain,[]);
const certify=(a:SpatialPoint,b:SpatialPoint)=>certifyWalkMotion(a,b,graph,terrain)===null;
function line(n:number):RouteResult{
  const steps:RouteStep[]=Array.from({length:n},(_,i)=>({kind:'walk',from:pt(i*.14),to:pt((i+1)*.14),brushSourceIds:[]}));
  return {status:'READY',points:[pt(0),...steps.map(s=>s.to)],distance:n*.14,steps,brushSourceIds:[]};
}
describe('RRH PMO Area V1.4 – visible individualized physically certified travel',()=>{
  it('produces continuous personal lanes with helper boundaries preserved',()=>{
    const base=line(30);
    if(base.status!=='READY')throw Error('test fixture');
    const steps:RouteStep[]=[...base.steps];
    steps.splice(15,0,{kind:'bridge',from:pt(15*.14),to:pt(15*.14),helperId:'bridge-authored',brushSourceIds:[]});
    const model=new CrowdRouteVariation(graph,terrain,certify,.52,.5);
    for(let i=0;i<12;i++){
      const route=model.apply('guest-'+i,{...base,steps});
      expect(route.status).toBe('READY');
      if(route.status!=='READY')continue;
      expect(route.steps[15]).toEqual(steps[15]);
      expect(route.steps[0].from).toEqual(steps[0].from);
      expect(route.steps.at(-1)?.to).toEqual(steps.at(-1)?.to);
      for(let j=0;j<route.steps.length-1;j++)expect(route.steps[j].to).toEqual(route.steps[j+1].from);
    }
    expect(model.stats.variedRoutes).toBeGreaterThanOrEqual(9);
    expect(model.stats.largest).toBeGreaterThan(.14);
  });
  it('smooths high-frequency compiler-grid zigzags, not just shifts them sideways',()=>{
    const jittered:RouteStep[]=Array.from({length:34},(_,i)=>({kind:'walk',
      from:pt(i*.14,i%2===0?0:.09),to:pt((i+1)*.14,(i+1)%2===0?0:.09),brushSourceIds:[]}));
    const base:RouteResult={status:'READY',steps:jittered,points:[jittered[0].from,...jittered.map(s=>s.to)],
      distance:34*.16,brushSourceIds:[]};
    const result=new CrowdRouteVariation(graph,terrain,certify,.52,.5).apply('smooth-grid',base);
    expect(result.status).toBe('READY');
    if(result.status!=='READY')return;
    const totalTurn=(steps:readonly RouteStep[])=>steps.slice(1).reduce((sum,s,i)=>{
      const a=steps[i],x=a.to[0]-a.from[0],z=a.to[2]-a.from[2],
        xx=s.to[0]-s.from[0],zz=s.to[2]-s.from[2];
      return sum+Math.abs(Math.atan2(x*zz-z*xx,x*xx+z*zz));
    },0);
    expect(totalTurn(result.steps)).toBeLessThan(totalTurn(jittered)*.75);
  });
  it('packs 100 unique reachable site positions on continuous PMO floor',()=>{
    const sites=[pt(2.1),pt(3.1),pt(4.1),pt(5.1),pt(1.2)];
    const spatial=buildCrowdSpatialPlan(graph,terrain,pt(0),sites,100,certify);
    const allocated:SpatialPoint[][]=sites.map(()=>[]);
    for(let i=0;i<100;i++){
      const site=ferrySite(i,sites.length),position=spatial.servicePositions[i];
      expect(planBrushCorridorRoute(graph,terrain,sites[site],position,.26,certify).status).toBe('READY');
      expect(Math.hypot(position[0]-sites[site][0],position[2]-sites[site][2])).toBeLessThan(.68);
      for(const occupied of allocated[site])expect(Math.hypot(position[0]-occupied[0],position[2]-occupied[2])).toBeGreaterThanOrEqual(.097);
      allocated[site].push(position);
    }
  });
  it('moves actual actors along those physical routes without pedestrian-to-pedestrian collision',()=>{
    const sites=[pt(2.1),pt(3.1),pt(4.1),pt(5.1),pt(1.2)];
    const spatial=buildCrowdSpatialPlan(graph,terrain,pt(0),sites,100,certify);
    const variation=new CrowdRouteVariation(graph,terrain,certify,.52,.5);
    const motor=new PmoPedestrianRuntime(graph,terrain,{collisionSpacing:0,
      followCertifiedWalkTrace:true,certifyWalk:certify,varyRoute:(id,route)=>variation.apply(id,route)});
    for(let i=0;i<12;i++)expect(motor.add({id:'guest-'+i,from:pt(0),to:spatial.servicePositions[i],speed:.5}).status).toBe('READY');
    let arrived=false;
    for(let frame=0;frame<800;frame++){
      motor.tick(.05);
      const actors=motor.snapshots();
      expect(actors.some(a=>a.status==='blocked')).toBe(false);
      if(actors.every(a=>a.status==='arrived')){arrived=true;break;}
    }
    expect(arrived).toBe(true);
    expect(variation.stats.variedRoutes).toBeGreaterThanOrEqual(8);
  });
});

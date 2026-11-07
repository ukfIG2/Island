import {describe,it,expect} from 'vitest';
import type {IslandWaterBoundary} from '../render/islandWaterBoundary';
import {planFullWaveSeaRoute,SeaBoatMotion} from './pmoFullWaveWaterRoute';
import {sampleSeaClearance,seaSegmentClear,sampleSeaPaintTarget,seaIslandFootprint,SEA_COLLISION_ISLAND_SCALE} from './pmoSeaContourRoute';
import {planSeaArrivalV4,certifySeaHull,RRH_CRAFT_PROFILE,RRH_FERRY_PROFILE} from '../render/seaManeuverPlanner';
import {SeaManeuverController} from '../render/seaManeuverController';
import {seaBeachArcClearance,type BeachArcBoundary} from '../render/seaBeachCollisionArc';

const shore:[number,number,number]=[1.6739,-2.2456,4.5734];
// Exact front-of-beach black PMO stamp centers in the published authored registry.
const entries:[number,number,number][]=[
  [-.82,-2.32,5.51],[.10,-2.32,5.72],[1.5,-2.29,6.03],
  [2.31,-2.32,5.74],[2.98,-2.37,5.19],[3.91,-2.33,5.42],
];
function islandBoundary(land:(x:number,z:number)=>boolean):IslandWaterBoundary {
  const width=384,height=384,extent=42,range=21,bytes=new Uint8Array(width*height*4);
  // Signed distance is sufficient for these deterministic fixtures; the
  // production source is the R3F mesh-derived shoreline field.
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const wx=-21+x/(width-1)*extent,wz=-21+y/(height-1)*extent;
    let sd=Math.hypot(wx,wz)-5;
    if(land(wx,wz))sd=-Math.max(.8,Math.abs(sd));
    const v=Math.max(0,Math.min(65535,Math.round((sd/range*.5+.5)*65535)));
    const i=(y*width+x)*4;bytes[i]=v>>>8;bytes[i+1]=v&255;bytes[i+3]=255;
  }
  return {origin:{x:-21,y:-21},extent:{x:extent,y:extent},distanceRange:range,
    distanceTexture:{image:{width,height,data:bytes}}} as unknown as IslandWaterBoundary;
}
const strokes=entries.map((p,i)=>({id:'brush-'+i,radius:.51,points:[p]}));
const circle=islandBoundary((x,z)=>Math.hypot(x,z)<=5);
function verifyEveryLeg(boundary:IslandWaterBoundary,points:readonly (readonly number[])[],clearance=1.45){
  for(let i=1;i<points.length;i++)
    expect(seaSegmentClear(boundary,points[i-1],points[i],clearance),`collision at leg ${i}`).toBe(true);
}
describe('PMO guided collision-aware sea transport',()=>{
  it('routes arrival and independent departure around real land rather than a fixed circular ring',()=>{
    const plan=planFullWaveSeaRoute(shore,[-12,-2.35,0],[12,-2.35,-2],true,{boundary:circle,beachStrokes:strokes,random:()=>.43});
    expect(plan.pipeline).toBe('PMO_COLLISION_LENS_REVERSE_V4');
    expect(entries.some(p=>Math.hypot(p[0]-plan.brushTarget![0],p[2]-plan.brushTarget![2])<=.51)).toBe(true);
    expect(plan.v4?.version).toBe('RRH_SEA_V4');
    for(const path of [plan.v4!.arrival,plan.v4!.reverse,plan.v4!.departure])
      expect(certifySeaHull(circle,path,RRH_FERRY_PROFILE)).toBe(true);
    expect(plan.arrival[0]).toEqual(plan.incoming);
    expect(plan.departure[0]).toEqual(plan.maneuverPoint);
    expect(plan.departure.at(-1)).toEqual(plan.outgoing);
    verifyEveryLeg(circle,plan.arrival);verifyEveryLeg(circle,plan.departure);
    expect(plan.lensArc?.length).toBe(41);
    expect(plan.reverseDeparture?.length).toBe(2);
    const island=seaIslandFootprint(circle);
    expect(Math.hypot(plan.lensArc![0][0]-plan.lensArc![40][0],plan.lensArc![0][2]-plan.lensArc![40][2]))
      .toBeGreaterThan(island.diameter*1.9);
    expect(SEA_COLLISION_ISLAND_SCALE).toBe(1.30);
    // Navigable space shrinks by scaling the land footprint, not just clearance.
    expect(sampleSeaClearance(circle,6,0)).toBeLessThanOrEqual(0);
    expect(sampleSeaClearance(circle,7.4,0)).toBeGreaterThan(0);
    verifyEveryLeg(circle,plan.reverseDeparture!);
    const backward=plan.reverseDeparture!;
    const approach=plan.arrival;
    const incomingHeading=Math.atan2(approach.at(-1)![0]-approach.at(-2)![0],approach.at(-1)![2]-approach.at(-2)![2]);
    const backingHeading=Math.atan2(backward[1][0]-backward[0][0],backward[1][2]-backward[0][2]);
    expect(Math.abs(Math.atan2(Math.sin(incomingHeading-backingHeading),Math.cos(incomingHeading-backingHeading))))
      .toBeGreaterThan(2.5);
    expect(plan.v4!.beachCollisionArc.length).toBeGreaterThan(40);
    expect(plan.v4!.arrival.length).toBeGreaterThan(5);
    expect(plan.v4!.reverse.length).toBe(2);
  });
  it('forces final heading bow-first at the PMO and blocks both beach flanks',()=>{
    const p=planFullWaveSeaRoute(shore,[-12,-2.35,0],[12,-2.35,-2],true,
      {boundary:circle,beachStrokes:strokes,random:()=>.43});
    const v=p.v4!;
    const brush:[number,number]=[v.brushTarget[0]-v.dockPose.position[0],
      v.brushTarget[2]-v.dockPose.position[2]];
    const dot=(Math.sin(v.dockPose.heading)*brush[0]+Math.cos(v.dockPose.heading)*brush[1])/
      Math.hypot(...brush);
    expect(dot).toBeGreaterThan(.99);
    expect(v.beachCollisionArc.length).toBeGreaterThan(40);
    const left=v.beachCollisionArc[5],right=v.beachCollisionArc.at(-6)!;
    const arc=(v.routingBoundary as BeachArcBoundary).beachArcBarrier;
    expect(seaBeachArcClearance(arc,left[0],left[2])).toBeLessThan(0);
    expect(seaBeachArcClearance(arc,right[0],right[2])).toBeLessThan(0);
    for(const path of [v.arrival,v.reverse,v.departure])
      expect(certifySeaHull(v.routingBoundary,path,RRH_FERRY_PROFILE)).toBe(true);
  });
  it('retreats the PMO berth offshore if a peninsula obstructs the berth and never smooths through land',()=>{
    const mask=islandBoundary((x,z)=>Math.hypot(x,z)<=5 || (x>1.8&&x<3.0&&z>5.2&&z<6.2));
    const p=planFullWaveSeaRoute(shore,[12,-2.35,-6],[-13,-2.35,-8],false,{boundary:mask,beachStrokes:strokes,random:()=>.43});
    expect(sampleSeaClearance(mask,p.dock[0],p.dock[2])).toBeGreaterThanOrEqual(1.45);
    verifyEveryLeg(mask,p.arrival);verifyEveryLeg(mask,p.departure);
  });
  it('samples noncentral points INSIDE real stamp discs, never gaps',()=>{
    let s=0;const random=()=>{s=(Math.imul(s,1664525)+1013904223)>>>0;return s/4294967296;};
    const picked:Array<[number,number,number]>=[];
    for(let i=0;i<100;i++){const p=sampleSeaPaintTarget(strokes,random);picked.push(p);
      expect(entries.some(q=>Math.hypot(p[0]-q[0],p[2]-q[2])<=.510001)).toBe(true);}
    expect(new Set(picked.map(p=>p[0].toFixed(3)+':'+p[2].toFixed(3))).size).toBeGreaterThan(60);
  });
  it('eases arrival and departure with rate-limited yaw and completes both directions',()=>{
    const p=planFullWaveSeaRoute(shore,[-12,-2.35,0],[12,-2.35,-2],true,{boundary:circle,beachStrokes:strokes,random:()=>.43});
    const boat=new SeaBoatMotion(p);let previous=0;
    for(let i=0;i<4000&&boat.phase!=='docked';i++){
      boat.tick(.05);
      if(i>0){const d=Math.atan2(Math.sin(boat.yaw-previous),Math.cos(boat.yaw-previous));
        expect(Math.abs(d)).toBeLessThanOrEqual(.083);}
      previous=boat.yaw;
    }
    expect(boat.phase).toBe('docked');const dockHeading=boat.yaw;boat.depart();
    expect(boat.phase).toBe('reversing');previous=boat.yaw;
    let reversed=false,turned=false;
    for(let i=0;i<4000&&boat.phase!=='gone';i++){
      const wasBacking=boat.phase==='reversing';
      boat.tick(.05);
      if(wasBacking){reversed=true;expect(Math.abs(Math.atan2(Math.sin(boat.yaw-dockHeading),Math.cos(boat.yaw-dockHeading)))).toBeLessThanOrEqual(.1);}
      if(boat.phase==='turning')turned=true;
      if(i>0){const d=Math.atan2(Math.sin(boat.yaw-previous),Math.cos(boat.yaw-previous));
        expect(Math.abs(d)).toBeLessThanOrEqual(.083);}
      previous=boat.yaw;
    }
    expect(reversed).toBe(true);expect(turned).toBe(true);expect(boat.phase).toBe('gone');
  });
  it('keeps heading and position continuous through actual motion, rather than rotating the sprite at polygon corners',()=>{
    const p=planFullWaveSeaRoute(shore,[-12,-2.35,0],[12,-2.35,-2],true,
      {boundary:circle,beachStrokes:strokes,random:()=>.43});
    const boat=new SeaBoatMotion(p);let lastYaw=boat.yaw,maxYaw=0;
    for(let step=0;step<9000&&boat.phase!=='docked';step++){
      boat.tick(.05);const change=Math.abs(Math.atan2(Math.sin(boat.yaw-lastYaw),Math.cos(boat.yaw-lastYaw)));
      maxYaw=Math.max(maxYaw,change);lastYaw=boat.yaw;
    }
    expect(boat.phase).toBe('docked');boat.depart();let backed=false,turned=false;
    for(let step=0;step<9000&&boat.phase!=='gone';step++){
      boat.tick(.05);
      if(boat.phase==='reversing')backed=true;
      if(boat.phase==='turning')turned=true;
      const change=Math.abs(Math.atan2(Math.sin(boat.yaw-lastYaw),Math.cos(boat.yaw-lastYaw)));
      maxYaw=Math.max(maxYaw,change);lastYaw=boat.yaw;
    }
    expect(boat.phase).toBe('gone');expect(backed).toBe(true);expect(turned).toBe(true);
    expect(maxYaw).toBeLessThan(.12);
  });
  it('can plan production arrival alone without requiring nonexistent production departure gameplay',()=>{
    const arrival=planSeaArrivalV4({boundary:circle,beachStrokes:strokes,random:()=>.43},
      [-12,-2.35,0],RRH_CRAFT_PROFILE);
    expect(certifySeaHull(circle,arrival.arrival,RRH_CRAFT_PROFILE)).toBe(true);
    const preview=new SeaManeuverController(arrival);
    const endpoint=preview.previewArrival(1).position;
    expect(Math.hypot(endpoint[0]-arrival.dockPose.position[0],endpoint[2]-arrival.dockPose.position[2]))
      .toBeLessThan(1e-5);
    expect(()=>preview.depart()).toThrow('SEA_V4_DEPART_BEFORE_DOCKED');
  });
  it('does not silently assume safe water when the authored beach-front PMO entries are absent',()=>{
    expect(()=>planFullWaveSeaRoute(shore,[12,-2.35,3],[-12,-2.35,-3],true,
      {boundary:circle,beachStrokes:[]})).toThrow('SEA_PMO_BEACH_PAINT_MISSING');
  });
});

/** Opt-in R3F visualization for the *actual* certified sea route.
 * Only presentation. Enable with ?seaRouteDebug=1. */
import {useEffect,useMemo} from 'react';
import * as THREE from 'three';
import type {WaterPlan} from './pmoFullWaveWaterRoute';
export function PmoSeaRouteOverlay({plan}:{plan:WaterPlan}){
  const group=useMemo(()=>{
    const g=new THREE.Group();g.name='certified-sea-route-debug';
    for(const [path,color] of [[plan.arrival,'#44dcfa'],[plan.departure,'#f5a15d']] as const){
      const geo=new THREE.BufferGeometry().setFromPoints(path.map(p=>new THREE.Vector3(p[0],p[1]+.12,p[2])));
      g.add(new THREE.Line(geo,new THREE.LineBasicMaterial({color,depthTest:false,transparent:true,opacity:.85})));
    }
    for(const [path,color] of [[plan.intendedArrival,'#f5f5f5'],[plan.intendedDeparture,'#c4d1d8']] as const){
      if(!path)continue;
      const geo=new THREE.BufferGeometry().setFromPoints(path.map(p=>new THREE.Vector3(p[0],p[1]+.16,p[2])));
      const line=new THREE.Line(geo,new THREE.LineDashedMaterial({color,linewidth:1,dashSize:.24,gapSize:.22,opacity:.5,transparent:true,depthTest:false}));
      line.computeLineDistances();g.add(line);
    }
    if(plan.collisionOutline?.length){
      const pts=plan.collisionOutline.map(p=>new THREE.Vector3(p[0],p[1]+.09,p[2]));
      const geo=new THREE.BufferGeometry().setFromPoints(pts);
      g.add(new THREE.LineLoop(geo,new THREE.LineBasicMaterial({color:'#ff5370',depthTest:false,transparent:true,opacity:.85})));
    }
    if(plan.beachCollisionArc?.length){
      const geo=new THREE.BufferGeometry().setFromPoints(plan.beachCollisionArc.map(p=>new THREE.Vector3(p[0],p[1]+.24,p[2])));
      g.add(new THREE.Line(geo,new THREE.LineBasicMaterial({color:'#ff3838',depthTest:false,transparent:true,opacity:1})));
    }
    if(plan.lensArc){
      const geometry=new THREE.BufferGeometry().setFromPoints(plan.lensArc.map(p=>new THREE.Vector3(p[0],p[1]+.20,p[2])));
      g.add(new THREE.Line(geometry,new THREE.LineBasicMaterial({color:'#d67df5',depthTest:false,transparent:true,opacity:.92})));
    }
    if(plan.reverseDeparture){
      const geo=new THREE.BufferGeometry().setFromPoints(plan.reverseDeparture.map(p=>new THREE.Vector3(p[0],p[1]+.22,p[2])));
      const l=new THREE.Line(geo,new THREE.LineDashedMaterial({color:'#ffe78a',dashSize:.16,gapSize:.12,transparent:true,opacity:.90,depthTest:false}));
      l.computeLineDistances();g.add(l);
    }
    if(plan.maneuverPoint){
      const marker=new THREE.Mesh(new THREE.SphereGeometry(.14,12,8),new THREE.MeshBasicMaterial({color:'#dd91ff',depthTest:false}));
      marker.position.set(plan.maneuverPoint[0],plan.maneuverPoint[1]+.23,plan.maneuverPoint[2]);g.add(marker);
    }
    if(plan.brushTarget){
      const mark=new THREE.Mesh(new THREE.SphereGeometry(.07,10,7),new THREE.MeshBasicMaterial({color:'#ffeb62',depthTest:false}));
      mark.position.set(plan.brushTarget[0],plan.brushTarget[1]+.18,plan.brushTarget[2]);g.add(mark);
    }
    if(plan.v4){
      const v4=plan.v4;
      const bow=new THREE.Vector3(Math.sin(v4.dockPose.heading-v4.profile.bowAxisOffset),0,
        Math.cos(v4.dockPose.heading-v4.profile.bowAxisOffset));
      const direction=new THREE.ArrowHelper(bow,new THREE.Vector3(plan.dock[0],plan.dock[1]+.3,plan.dock[2]),
        1.3,'#38ffb1',.32,.17);
      direction.traverse(o=>{o.renderOrder=300;});g.add(direction);
      const marker=new THREE.Mesh(new THREE.SphereGeometry(.12,10,7),
        new THREE.MeshBasicMaterial({color:'#c892ff',depthTest:false}));
      marker.position.set(v4.lensEntry.position[0],v4.lensEntry.position[1]+.3,v4.lensEntry.position[2]);
      marker.name='SEA_V4_LENS_TRIGGER';g.add(marker);
    }
    const geometry=new THREE.SphereGeometry(.12,10,8);
    const ball=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:'#ffffff',depthTest:false}));
    ball.position.set(plan.dock[0],plan.dock[1]+.16,plan.dock[2]);g.add(ball);
    return g;
  },[plan]);
  useEffect(()=>()=>{
    group.traverse(object=>{
      if(object instanceof THREE.Line || object instanceof THREE.Mesh){
        object.geometry.dispose();
        const materials=Array.isArray(object.material)?object.material:[object.material];
        materials.forEach(m=>m.dispose());
      }
    });
  },[group]);
  if(typeof window==='undefined'||new URLSearchParams(window.location.search).get('seaRouteDebug')!=='1')return null;
  return <primitive object={group}/>;
}

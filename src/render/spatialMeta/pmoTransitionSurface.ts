/** Read-only physical support sampling of the exact rendered PMO boxes. NOT locomotion authority. */
import * as THREE from 'three';
import type { SpatialPoint } from './registry';
import type { PmoStructure } from './pmoTransitionStructures';
import type { PmoTransitionAccess } from './pmoTransitionAccess';
export interface PmoSurfaceEvidence { sourceId:string; kind:PmoStructure['kind']; surfaceSampled:boolean; points:SpatialPoint[]; issues:string[]; travelCertified:false; }
export function samplePmoStructureSurface(structure:PmoStructure,access:PmoTransitionAccess):PmoSurfaceEvidence {
  const fail=(reason:string):PmoSurfaceEvidence=>({sourceId:structure.sourceId,kind:structure.kind,surfaceSampled:false,points:[],issues:[reason],travelCertified:false});
  if(access.sourceId!==structure.sourceId||access.edgeId!==structure.edgeId||access.kind!==structure.kind||!access.attached||!access.geometryContinuous||!access.eligibleForPhysicalReview)return fail('SURFACE_ACCESS_PREFLIGHT_FAILED');
  if(structure.kind==='lift')return fail('LIFT_CABIN_SYNCHRONIZATION_UNPROVEN');
  const {from,to,segments}=structure;
  const length=Math.hypot(to[0]-from[0],to[2]-from[2]);
  if(!Number.isFinite(length)||length<0.05||length>20||segments.length<2||segments.length>512)return fail('SURFACE_DIMENSIONS_OUT_OF_BOUNDS');
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const meshes=segments.map(segment=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(segment.width,0.034,segment.length),material);mesh.position.set(...segment.center);mesh.rotation.set(segment.pitch,segment.yaw,0);mesh.updateMatrixWorld(true);return mesh;});
  const ray=new THREE.Raycaster(),down=new THREE.Vector3(0,-1,0);
  const points:SpatialPoint[]=[];
  try {
    const count=Math.ceil(length/0.025);
    for(let i=0;i<=count;i++){
      const t=i/count,x=from[0]+(to[0]-from[0])*t,z=from[2]+(to[2]-from[2])*t,expectedY=from[1]+(to[1]-from[1])*t;
      ray.set(new THREE.Vector3(x,Math.max(from[1],to[1])+0.75,z),down);ray.far=Math.abs(to[1]-from[1])+1.5;
      const hit=ray.intersectObjects(meshes,false).find(h=>Math.abs(h.point.y-expectedY)<=(structure.kind==='stairs'?0.075:0.055));
      if(!hit)return fail('SURFACE_UNSUPPORTED_AT_SAMPLE:'+i+'/'+count);
      const point:SpatialPoint=[x,hit.point.y,z];
      if(points.length&&Math.abs(point[1]-points[points.length-1][1])>0.076)return fail('SURFACE_VERTICAL_DISCONTINUITY:'+i+'/'+count);
      points.push(point);
    }
    if(Math.abs(points[0][1]-from[1])>0.08||Math.abs(points[points.length-1][1]-to[1])>0.08)return fail('SURFACE_ENDPOINT_HEIGHT_MISMATCH');
    return {sourceId:structure.sourceId,kind:structure.kind,surfaceSampled:true,points,issues:[],travelCertified:false};
  }finally {meshes.forEach(m=>m.geometry.dispose());material.dispose();}
}

import {describe,expect,it} from 'vitest';
import type {PmoStructure} from './pmoTransitionStructures';
import type {PmoTransitionAccess} from './pmoTransitionAccess';
import {samplePmoStructureSurface} from './pmoTransitionSurface';
function fixture(kind:'bridge'|'stairs'|'lift',rise=0){
  const from:[number,number,number]=[0,0,0],to:[number,number,number]=[1,rise,0];
  const segments=Array.from({length:16},(_,i)=>({center:[(i+0.5)/16,rise*(i+0.5)/16,0] as [number,number,number],yaw:Math.PI/2,pitch:kind==='stairs'?0:-Math.atan2(rise,1),length:1.06/16,width:0.32}));
  const structure:PmoStructure={sourceId:'fixture',edgeId:'fixture-edge',kind,from,to,segments,travelCertified:false};
  const access:PmoTransitionAccess={sourceId:'fixture',edgeId:'fixture-edge',kind,attached:true,geometryContinuous:true,eligibleForPhysicalReview:true,travelCertified:false,issues:[],walkNodeIds:['walk-a','walk-b']};
  return {structure,access};
}
describe('actual rendered PMO deck and stair support',()=>{
  it('samples continuous flat bridge geometry without certifying travel',()=>{const {structure,access}=fixture('bridge');const a=samplePmoStructureSurface(structure,access);expect(a.surfaceSampled).toBe(true);expect(a.points.length).toBeGreaterThan(30);expect(a.travelCertified).toBe(false);});
  it('samples bounded stair treads without certifying travel',()=>{const {structure,access}=fixture('stairs',0.5);const a=samplePmoStructureSurface(structure,access);expect(a.surfaceSampled).toBe(true);expect(a.travelCertified).toBe(false);});
  it('rejects holes and disconnected portal attachment',()=>{const {structure,access}=fixture('bridge');expect(samplePmoStructureSurface({...structure,segments:structure.segments.filter((_,i)=>i!==8)},access).surfaceSampled).toBe(false);expect(samplePmoStructureSurface(structure,{...access,attached:false}).surfaceSampled).toBe(false);});
  it('never certifies a lift cabin',()=>{const {structure,access}=fixture('lift',0.3);const a=samplePmoStructureSurface(structure,access);expect(a.surfaceSampled).toBe(false);expect(a.issues).toContain('LIFT_CABIN_SYNCHRONIZATION_UNPROVEN');});
});

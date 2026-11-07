import fixture from '../../../semantic/evidence/pmo/registry-authored-2026-10-21.json';
import { describe, expect, it } from 'vitest';
import type { SpatialRegistry } from './registry';
import { projectPmoTransitionStructures } from './pmoTransitionStructures';
const authored=():SpatialRegistry=>structuredClone(fixture) as unknown as SpatialRegistry;
describe('authored infrastructure: geometry without movement authority',()=>{
  it('produces only six identity-verified structures and preserves the authored registry',()=>{
    const registry=authored(),before=JSON.stringify(registry),result=projectPmoTransitionStructures(registry);
    expect(result).toHaveLength(6);
    expect(result.map(s=>s.kind).sort()).toEqual(['bridge','bridge','lift','lift','stairs','stairs']);
    expect(JSON.stringify(registry)).toBe(before);
    for(const structure of result){
      expect(structure.travelCertified).toBe(false);
      expect([...structure.from,...structure.to].every(Number.isFinite)).toBe(true);
      if(structure.kind==='lift')expect(structure.segments).toHaveLength(0);
      else expect(structure.segments.length).toBeGreaterThan(2);
      expect(structure.segments.every(s=>[...s.center,s.yaw,s.pitch,s.length,s.width].every(Number.isFinite))).toBe(true);
    }
  });
  it('does not infer infrastructure from modified edge identity',()=>{
    const registry=authored(),lift=registry.objects.find(o=>o.id==='pmo-2d1f3e6f-85ee-4abd-96fe-fd42943edcd4');
    if(!lift||lift.geometry.type!=='skeleton')throw Error('Missing lift');
    lift.geometry.edges[0].id='edited-edge';
    expect(projectPmoTransitionStructures(registry)).toHaveLength(5);
  });
});

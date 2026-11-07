import { describe, expect, it } from 'vitest';
import authored from '../../../semantic/evidence/pmo/registry-authored-2026-10-21.json';
import { validateSpatialRegistry } from './registry';
import type { NavigationGraph, NavNode, NavEdge } from './navigation';
import { projectPmoTransitionStructures } from './pmoTransitionStructures';
import { assessPmoTransitionAccess } from './pmoTransitionAccess';

const original=validateSpatialRegistry(authored);
const structures=projectPmoTransitionStructures(original);
function attach(structure: (typeof structures)[number], complete=true): NavigationGraph {
  const nodes: Record<string,NavNode>={};
  const outgoing: Record<string,NavEdge[]>={};
  for(const [k,point] of [structure.from,structure.to].entries()) {
    const portal=`portal:${structure.edgeId}:${k}`,walk=`walk-${k}`;
    nodes[portal]={id:portal,position:[...point],sourceId:structure.sourceId,role:'portal'};
    nodes[walk]={id:walk,position:[point[0]+0.08,point[1],point[2]],
      sourceId:'paint',role:'walk'};
    outgoing[portal]=[{to:walk,cost:0.08,mode:'walk',sourceId:structure.sourceId}];
    outgoing[walk]=complete || k===0
      ? [{to:portal,cost:0.08,mode:'walk',sourceId:structure.sourceId}]:[];
  }
  return {schemaVersion:1,nodes,outgoing,issues:[]};
}
describe('PMO physical transition review eligibility',()=>{
  it('validates exact original six structures without promoting transport',()=>{
    expect(structures).toHaveLength(6);
    for(const structure of structures) {
      const [result]=assessPmoTransitionAccess([structure],attach(structure));
      expect(result.attached).toBe(true);
      expect(result.travelCertified).toBe(false);
      expect(result.eligibleForPhysicalReview).toBe(true);
      expect(result.issues).toContain(structure.kind==='lift' ? 'LIFT_REQUIRES_RUNTIME_CABIN_RESERVATION' : 'SPECIAL_TRANSITION_RUNTIME_TRAVEL_NOT_CERTIFIED');
    }
  });
  it('fails closed for an unattached portal or altered authoritative endpoint',()=>{
    const structure=structures.find(s=>s.kind==='bridge')!;
    const [broken]=assessPmoTransitionAccess([structure],attach(structure,false));
    expect(broken.attached).toBe(false);
    expect(broken.eligibleForPhysicalReview).toBe(false);
    const altered={...structure,to:[structure.to[0]+1,structure.to[1],structure.to[2]] as typeof structure.to};
    const [mismatched]=assessPmoTransitionAccess([altered],attach(structure));
    expect(mismatched.attached).toBe(false);
    expect(mismatched.travelCertified).toBe(false);
  });
});

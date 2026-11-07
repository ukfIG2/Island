import { describe, expect, it } from 'vitest';
import { guestShouldTraverseArrivalRoute as traverse } from './pmoGuestMotion';
describe('PMO guest route fail-closed', () => {
  it('never samples missing or singleton PMO route for any stage', () => { for(const stage of ['queue','active','served'] as const) for(const n of [0,1]) expect(traverse(stage,true,n)).toBe(false); });
  it('permits real PMO queue and active traversal, but never served arrival', () => {expect(traverse('queue',true,2)).toBe(true);expect(traverse('active',true,2)).toBe(true);expect(traverse('served',true,20)).toBe(false);});
  it('preserves legacy queue-only projection independent of PMO routes', () => { expect(traverse('queue',false,0)).toBe(true);expect(traverse('active',false,3)).toBe(false);expect(traverse('served',false,3)).toBe(false); });
});

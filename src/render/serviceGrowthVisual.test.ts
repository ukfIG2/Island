import {describe,it,expect} from 'vitest';
import {serviceGrowthTiers} from './serviceGrowthVisual';
describe('NFR-007 visible structural growth',()=>{
 it.each([[1,[]],[2,[2]],[3,[2,3]],[4,[2,3,4]],[5,[2,3,4,5]]] as const)('Core level %i yields cumulative 3D construction stages', (level,stages)=>{expect(serviceGrowthTiers(level)).toEqual(stages)});
 it('keeps invalid/out-of-range levels safe',()=>{expect(serviceGrowthTiers(0)).toEqual([]);expect(serviceGrowthTiers(99)).toEqual([2,3,4,5]);expect(serviceGrowthTiers(NaN)).toEqual([])});
});

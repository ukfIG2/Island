import { describe, expect, it } from 'vitest';
import { createInitialBootstrapState, type BootstrapState } from './state';
import { deriveMvpVipPreviewInfo, MVP_VIP_PREVIEW_PROOF_CATALOG } from './vipPreview';
import { MVP_VIP_TYPES } from './vipLayer';
describe('FR-038 VIP Preview information', () => {
  it.each(MVP_VIP_TYPES)('%s shows identity, opportunity, illustrative reward range and actual gaps without mutation', vipType => {
    const base = createInitialBootstrapState('fr038-'+vipType, undefined, 'mvp');
    const prior = JSON.stringify(base);
    const info = deriveMvpVipPreviewInfo(base, vipType);
    expect(info.identity.length).toBeGreaterThan(2);
    expect(info.opportunity.length).toBeGreaterThan(5);
    expect(info.potentialReward).toMatchObject({ resource: 'Reputation', provisional: true, awardImplemented: true });
    expect(info.potentialReward.minimum).toBeGreaterThan(0);
    expect(info.potentialReward.maximum).toBeGreaterThan(info.potentialReward.minimum);
    expect(info.readiness).toBe('gaps');
    expect(info.rosterGaps.length + info.buildingGaps.length).toBeGreaterThan(0);
    expect(JSON.stringify(base)).toBe(prior);
  });
  it.each(MVP_VIP_TYPES)('%s reacts to canonical prior preparedness, not Worker assignments', vipType => {
    const initial = createInitialBootstrapState('fr038-ready-'+vipType, undefined, 'mvp');
    const profile = MVP_VIP_PREVIEW_PROOF_CATALOG[vipType];
    const prepared = { ...initial, vipBuildings: { ...initial.vipBuildings, spa: profile.vipBuildings.includes('spa') }, hiredSpecialists: [...profile.specialists], purchasedAreas: { ...initial.purchasedAreas, ...Object.fromEntries(profile.areas.map(id => [id, true])) }, normalWave: { ...initial.normalWave, hiredManagers: { ...initial.normalWave.hiredManagers, ...Object.fromEntries(profile.managers.map(id => [id, true])) } } } as BootstrapState;
    const info = deriveMvpVipPreviewInfo(prepared, vipType);
    expect(info.readiness).toBe('prepared');
    expect(info.rosterGaps).toEqual([]);
    expect(info.buildingGaps).toEqual([]);
    const switched = { ...initial, normalWave: { ...initial.normalWave, workerAssignments: { ...initial.normalWave.workerAssignments, 'worker-1': 'food' as const } } } as BootstrapState;
    expect(deriveMvpVipPreviewInfo(switched, vipType)).toEqual(deriveMvpVipPreviewInfo(initial, vipType));
  });
  it('is gated outside MVP', () => {
    expect(() => deriveMvpVipPreviewInfo(createInitialBootstrapState('fr038-prototype'), 'investor')).toThrow('MVP_VIP_PREVIEW_STAGE_INVALID');
  });
});

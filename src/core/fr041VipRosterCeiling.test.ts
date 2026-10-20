import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand as dispatch, createInitialBootstrapState, type BootstrapState } from './state';
import { MVP_VIP_TYPES, MVP_VIP_PROVISIONAL_TIMING, mvpVipAttainableQualityCeiling, capMvpVipQuality, type MvpVipType } from './vipLayer';
import { deriveMvpVipPreviewInfo, MVP_VIP_PREVIEW_PROOF_CATALOG } from './vipPreview';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';
function invested(vipType: MvpVipType, state: BootstrapState): BootstrapState {
  return { ...state, vipBuildings: { ...state.vipBuildings, spa: state.vipBuildings.spa || MVP_VIP_PREVIEW_PROOF_CATALOG[vipType].vipBuildings.includes('spa') }, hiredSpecialists: [...state.hiredSpecialists, ...MVP_VIP_PREVIEW_PROOF_CATALOG[vipType].specialists], purchasedAreas: { pool: true, bungalows: true }, normalWave: { ...state.normalWave, hiredManagers: ({ ...state.normalWave.hiredManagers, ...Object.fromEntries(MVP_VIP_PREVIEW_PROOF_CATALOG[vipType].managers.map(id => [id, true])) } as typeof state.normalWave.hiredManagers) } };
}
describe('FR-041 immutable VIP roster/building quality ceiling', () => {
  it.each(MVP_VIP_TYPES)('%s remains executable with reduced, immutable quality ceiling', vipType => {
    const initial = createInitialBootstrapState('fr041-gap-' + vipType, undefined, 'mvp');
    const preview = deriveMvpVipPreviewInfo(initial, vipType);
    expect(preview.readiness).toBe('gaps');
    expect(preview.rosterGaps.length + preview.buildingGaps.length).toBeGreaterThan(0);
    const started = dispatch(initial, { type: 'BEGIN_VIP_VISIT', vipType });
    const captured = started.vipLayer.active?.preparedness;
    expect(captured?.rosterGaps).toEqual(preview.rosterGaps);
    expect(captured?.buildingGaps).toEqual(preview.buildingGaps);
    const ceiling = mvpVipAttainableQualityCeiling(captured);
    expect(ceiling).not.toBeNull();
    expect(ceiling).toBeLessThan(5);
    expect(ceiling).toBeGreaterThanOrEqual(1);
    expect(capMvpVipQuality(5, captured)).toBe(ceiling);
    const laterInvested = invested(vipType, started);
    expect(deriveMvpVipPreviewInfo(laterInvested, vipType).readiness).toBe('prepared');
    expect(mvpVipAttainableQualityCeiling(laterInvested.vipLayer.active?.preparedness)).toBe(ceiling);
    const hydrated = normalizePersistedState(JSON.parse(JSON.stringify(laterInvested)) as BootstrapState);
    expect(mvpVipAttainableQualityCeiling(hydrated.vipLayer.active?.preparedness)).toBe(ceiling);
    const finished = dispatch(hydrated, { type: 'ADVANCE_SIMULATION', deltaMs: MVP_VIP_PROVISIONAL_TIMING.visitDurationMs });
    expect(finished.vipLayer.active).toBeNull();
    expect(finished.vipLayer.completed).toContain(vipType);
    const resolution = finished.vipLayer.resolutions.at(-1);
    expect(resolution?.type).toBe(vipType);
    expect(mvpVipAttainableQualityCeiling(resolution?.preparedness)).toBe(ceiling);
    expect(capMvpVipQuality(5, resolution?.preparedness)).toBe(ceiling);
    expect(normalizePersistedState(JSON.parse(JSON.stringify(finished)) as BootstrapState).vipLayer.resolutions).toEqual(finished.vipLayer.resolutions);
  });
  it.each(MVP_VIP_TYPES)('%s has full ceiling if all prerequisites existed before visit', vipType => {
    const before = invested(vipType, createInitialBootstrapState('fr041-ready-' + vipType, undefined, 'mvp'));
    expect(deriveMvpVipPreviewInfo(before, vipType).readiness).toBe('prepared');
    const started = dispatch(before, { type: 'BEGIN_VIP_VISIT', vipType });
    expect(started.vipLayer.active?.preparedness).toEqual({ readiness: 'prepared', rosterGaps: [], buildingGaps: [] });
    expect(mvpVipAttainableQualityCeiling(started.vipLayer.active?.preparedness)).toBe(5);
    expect(capMvpVipQuality(4, started.vipLayer.active?.preparedness)).toBe(4);
  });
  it('does not silently award legacy visits an unproven full ceiling', () => {
    const initial = dispatch(createInitialBootstrapState('fr041-legacy', undefined, 'mvp'), { type: 'BEGIN_VIP_VISIT', vipType: 'investor' });
    const legacy = JSON.parse(JSON.stringify(initial)) as any;
    delete legacy.vipLayer.active.preparedness;
    const restored = normalizePersistedState(legacy as BootstrapState);
    expect(mvpVipAttainableQualityCeiling(restored.vipLayer.active?.preparedness)).toBeNull();
    expect(capMvpVipQuality(5, restored.vipLayer.active?.preparedness)).toBeNull();
  });
  it('keeps consumable Fix separate from roster/building quality caps', () => {
    const initial = createInitialBootstrapState('fr041-fix', undefined, 'mvp');
    const offered = dispatch(dispatch(initial, { type: 'SHOW_VIP_PREVIEW', vipType: 'investor' }), { type: 'DECIDE_VIP_PREVIEW', decision: 'accept' });
    const stocked = dispatch(offered, { type: 'PURCHASE_VIP_MATERIALS' });
    const fixed = dispatch(stocked, { type: 'FIX_VIP_CONSUMABLE' });
    const started = dispatch(fixed, { type: 'BEGIN_VIP_VISIT', vipType: 'investor' });
    expect(mvpVipAttainableQualityCeiling(started.vipLayer.active?.preparedness)).toBeLessThan(5);
    expect(started.vipLayer.active?.preparedness?.readiness).toBe('gaps');
    expect(() => dispatch(started, { type: 'FIX_VIP_CONSUMABLE' })).toThrow('MVP_VIP_CONSUMABLE_FIX_UNAVAILABLE');
  });
  it('rejects invalid quality inputs rather than fabricating a result', () => {
    const prepared = { readiness: 'prepared' as const, rosterGaps: [], buildingGaps: [] };
    for (const invalid of [0, 6, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => capMvpVipQuality(invalid, prepared)).toThrow('MVP_VIP_QUALITY_INVALID');
  });
});

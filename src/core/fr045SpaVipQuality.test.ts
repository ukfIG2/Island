import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand as dispatch, createInitialBootstrapState, MVP_VIP_SPA_PROVISIONAL, type BootstrapState } from './state';
import { MVP_VIP_TYPES, mvpVipAttainableQualityCeiling, capMvpVipQuality, type MvpVipType } from './vipLayer';
import { deriveMvpVipPreviewInfo, MVP_VIP_PREVIEW_PROOF_CATALOG } from './vipPreview';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';

/** Prepare every prerequisite except Spa to isolate the FR-045 quality effect. */
function preparedWithoutSpa(type: MvpVipType): BootstrapState {
 const initial = createInitialBootstrapState('fr045-' + type, undefined, 'mvp');
 const profile = MVP_VIP_PREVIEW_PROOF_CATALOG[type];
 return { ...initial, hiredSpecialists: [...profile.specialists], purchasedAreas: { pool: true, bungalows: true }, normalWave: { ...initial.normalWave, hiredManagers: { ...initial.normalWave.hiredManagers, ...Object.fromEntries(profile.managers.map(id => [id, true])) } } };
}
function buildSpa(state: BootstrapState): BootstrapState {
 return dispatch({ ...state, coins: MVP_VIP_SPA_PROVISIONAL.coinCost }, { type: 'PURCHASE_VIP_SPA' });
}
describe('FR-045 Spa-dependent attainable VIP request quality', () => {
 it('selects exactly two of the four canonical VIP types with Spa prerequisites', () => {
  expect(MVP_VIP_TYPES).toHaveLength(4);
  expect(MVP_VIP_TYPES.filter(type => MVP_VIP_PREVIEW_PROOF_CATALOG[type].vipBuildings.includes('spa'))).toEqual(['weddingCouple', 'influencer']);
 });
 it.each(['weddingCouple', 'influencer'] as const)('%s quality ceiling is lowered only while Spa is missing', type => {
  const before = preparedWithoutSpa(type);
  const previewBefore = deriveMvpVipPreviewInfo(before, type);
  expect(previewBefore).toMatchObject({ readiness: 'gaps', rosterGaps: [], buildingGaps: ['Spa'] });
  expect(mvpVipAttainableQualityCeiling(previewBefore)).toBe(4);
  expect(capMvpVipQuality(5, previewBefore)).toBe(4);
  const after = buildSpa(before);
  const previewAfter = deriveMvpVipPreviewInfo(after, type);
  expect(previewAfter).toMatchObject({ readiness: 'prepared', rosterGaps: [], buildingGaps: [] });
  expect(mvpVipAttainableQualityCeiling(previewAfter)).toBe(5);
  expect(capMvpVipQuality(5, previewAfter)).toBe(5);
  expect(after.normalWave).toBe(before.normalWave);
  expect(after.purchasedAreas).toBe(before.purchasedAreas);
  expect(after.hiredSpecialists).toBe(before.hiredSpecialists);
 });
 it.each(['travelBlogger', 'investor'] as const)('%s readiness and quality remain Spa-independent', type => {
  const before = preparedWithoutSpa(type);
  const after = buildSpa(before);
  const beforePreview = deriveMvpVipPreviewInfo(before, type);
  const afterPreview = deriveMvpVipPreviewInfo(after, type);
  expect(beforePreview).toMatchObject({ readiness: 'prepared', rosterGaps: [], buildingGaps: [] });
  expect(afterPreview).toEqual(beforePreview);
  expect(mvpVipAttainableQualityCeiling(beforePreview)).toBe(5);
  expect(mvpVipAttainableQualityCeiling(afterPreview)).toBe(5);
 });
 it.each(['weddingCouple', 'influencer'] as const)('%s visit-start quality snapshot is immutable despite later Spa construction', type => {
  const before = preparedWithoutSpa(type);
  const started = dispatch(before, { type: 'BEGIN_VIP_VISIT', vipType: type });
  expect(started.vipLayer.active?.preparedness?.buildingGaps).toEqual(['Spa']);
  expect(mvpVipAttainableQualityCeiling(started.vipLayer.active?.preparedness)).toBe(4);
  const purchasedDuringVisit = buildSpa(started);
  expect(purchasedDuringVisit.vipLayer).toBe(started.vipLayer);
  expect(purchasedDuringVisit.vipLayer.active?.preparedness).toEqual(started.vipLayer.active?.preparedness);
  expect(mvpVipAttainableQualityCeiling(purchasedDuringVisit.vipLayer.active?.preparedness)).toBe(4);
  expect(deriveMvpVipPreviewInfo(purchasedDuringVisit, type).buildingGaps).toEqual([]);
  const persisted = normalizePersistedState(JSON.parse(JSON.stringify(purchasedDuringVisit)) as BootstrapState);
  expect(persisted.vipBuildings.spa).toBe(true);
  expect(persisted.vipLayer.active?.preparedness?.buildingGaps).toEqual(['Spa']);
  expect(mvpVipAttainableQualityCeiling(persisted.vipLayer.active?.preparedness)).toBe(4);
  const newVisit = dispatch({ ...purchasedDuringVisit, vipLayer: { ...purchasedDuringVisit.vipLayer, active: null } }, { type: 'BEGIN_VIP_VISIT', vipType: type });
  expect(newVisit.vipLayer.active?.preparedness?.buildingGaps).toEqual([]);
  expect(mvpVipAttainableQualityCeiling(newVisit.vipLayer.active?.preparedness)).toBe(5);
 });
});

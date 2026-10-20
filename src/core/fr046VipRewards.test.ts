import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand as dispatch, createInitialBootstrapState, normalWaveCoinReward, type BootstrapState } from './state';
import { MVP_VIP_PROVISIONAL_TIMING, mvpVipAttainableQualityCeiling, type MvpVipType } from './vipLayer';
import { deriveMvpVipPreviewInfo, MVP_VIP_PREVIEW_PROOF_CATALOG } from './vipPreview';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';

function prepared(type: MvpVipType, spa: boolean): BootstrapState {
 const base = createInitialBootstrapState('fr046-' + type, undefined, 'mvp');
 const profile = MVP_VIP_PREVIEW_PROOF_CATALOG[type];
 return { ...base, hiredSpecialists: [...profile.specialists], purchasedAreas: { pool: true, bungalows: true }, vipBuildings: { spa }, normalWave: { ...base.normalWave, hiredManagers: { ...base.normalWave.hiredManagers, ...Object.fromEntries(profile.managers.map(id => [id, true])) } } };
}
function finish(type: MvpVipType, spa: boolean): BootstrapState {
 const started = dispatch(prepared(type, spa), { type: 'BEGIN_VIP_VISIT', vipType: type });
 return dispatch(started, { type: 'ADVANCE_SIMULATION', deltaMs: MVP_VIP_PROVISIONAL_TIMING.visitDurationMs });
}

describe('FR-046 core-owned VIP completion rewards', () => {
 it('pays a Reputation-first spike with quality captured at visit start', () => {
  const withoutSpa = finish('weddingCouple', false);
  const withSpa = finish('weddingCouple', true);
  const preview = deriveMvpVipPreviewInfo(prepared('weddingCouple', true), 'weddingCouple').potentialReward;
  expect(preview.awardImplemented).toBe(true);
  expect(withoutSpa.lastVipReward?.qualityCeiling).toBe(4);
  expect(withSpa.lastVipReward?.qualityCeiling).toBe(5);
  expect(withSpa.lastVipReward?.reputation).toBe(preview.maximum);
  expect(withoutSpa.lastVipReward?.reputation).toBeLessThan(preview.maximum);
  expect(withSpa.reputation).toBe(withSpa.lastVipReward?.reputation);
  expect(withSpa.coins).toBe(prepared('weddingCouple', true).coins);
  expect(withSpa.resortValue).toBe(prepared('weddingCouple', true).resortValue);
 });
 it('settles once and preserves the receipt after further simulation ticks', () => {
  const complete = finish('influencer', true);
  expect(complete.vipLayer.active).toBeNull();
  expect(complete.vipLayer.completed).toEqual(['influencer']);
  expect(complete.lastVipReward?.completedVisitCount).toBe(1);
  const later = dispatch(complete, { type: 'ADVANCE_SIMULATION', deltaMs: MVP_VIP_PROVISIONAL_TIMING.visitDurationMs });
  expect(later.reputation).toBe(complete.reputation);
  expect(later.lastVipReward).toEqual(complete.lastVipReward);
 });
 it('applies identical payout on Energy speed-up completion, not on intermediate presses', () => {
  let state = dispatch({ ...prepared('travelBlogger', true), energy: 60 }, { type: 'BEGIN_VIP_VISIT', vipType: 'travelBlogger' });
  let presses = 0;
  while (state.vipLayer.active !== null && presses < 55) {
   const next = dispatch(state, { type: 'VIP_SPEED_UP' });
   if (next.vipLayer.active !== null) expect(next.reputation).toBe(0);
   state = next; presses++;
  }
  expect(state.vipLayer.active).toBeNull();
  expect(state.reputation).toBe(finish('travelBlogger', true).reputation);
  expect(state.lastVipReward?.completedVisitCount).toBe(1);
  expect(dispatch(state, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 }).reputation).toBe(state.reputation);
  expect(() => dispatch(state, { type: 'VIP_SPEED_UP' })).toThrow('MVP_VIP_SPEED_UP_NOT_IN_PROGRESS');
 });
 it('pays from immutable visit-start quality, not investments during a visit', () => {
  const base = prepared('weddingCouple', false);
  const started = dispatch(base, { type: 'BEGIN_VIP_VISIT', vipType: 'weddingCouple' });
  expect(mvpVipAttainableQualityCeiling(started.vipLayer.active?.preparedness)).toBe(4);
  const invested = dispatch({ ...started, coins: 100 }, { type: 'PURCHASE_VIP_SPA' });
  const paid = dispatch(invested, { type: 'ADVANCE_SIMULATION', deltaMs: MVP_VIP_PROVISIONAL_TIMING.visitDurationMs });
  expect(paid.lastVipReward?.qualityCeiling).toBe(4);
  expect(paid.lastVipReward?.reputation).toBe(finish('weddingCouple', false).reputation);
 });
 it('roundtrips awarded balances and receipts through the save normalizer', () => {
  const paid = finish('investor', true);
  const reloaded = normalizePersistedState(JSON.parse(JSON.stringify(paid)) as BootstrapState);
  expect(reloaded.reputation).toBe(paid.reputation);
  expect(reloaded.lastVipReward).toEqual(paid.lastVipReward);
  expect(dispatch(reloaded, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 }).reputation).toBe(paid.reputation);
 });
 it('loads pre-reward saves with zero Reputation and does not replay old completions', () => {
  const paid = finish('investor', true);
  const legacy = { ...paid, reputation: undefined, lastVipReward: undefined } as unknown as BootstrapState;
  const restored = normalizePersistedState(legacy);
  expect(restored.reputation).toBe(0);
  expect(restored.lastVipReward).toBeNull();
  expect(restored.vipLayer.completed).toEqual(paid.vipLayer.completed);
  expect(dispatch(restored, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 }).reputation).toBe(0);
 });
 it('keeps ordinary waves economically productive with a smaller Reputation increment', () => {
  const original = createInitialBootstrapState('fr046-wave', undefined, 'mvp');
  let wave = dispatch(original, { type: 'START_WAVE' });
  for (let i = 0; i < 12 && wave.normalWave.phase !== 'complete'; i++) wave = dispatch(wave, { type: 'ADVANCE_SIMULATION', deltaMs: 90000 });
  expect(wave.normalWave.phase).toBe('complete');
  expect(normalWaveCoinReward(wave.normalWave)).toBeGreaterThan(0);
  expect(wave.coins - original.coins).toBe(normalWaveCoinReward(wave.normalWave));
  expect(wave.energy).toBeGreaterThan(original.energy);
  expect(wave.reputation).toBeGreaterThan(0);
  expect(wave.reputation).toBeLessThan(finish('travelBlogger', true).reputation);
 });
});

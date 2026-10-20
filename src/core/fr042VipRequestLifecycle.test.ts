import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand as dispatch, createInitialBootstrapState, type BootstrapState } from './state';
import { deriveMvpVipRequestCards, mvpVipAttainableQualityCeiling, MVP_VIP_PROVISIONAL_TIMING, MVP_VIP_TYPES } from './vipLayer';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';
/** Adapt complete gameplay state to the pure VIP-layer request projection. */
const requestCards = (state: BootstrapState) => deriveMvpVipRequestCards(state.vipLayer);
describe('FR-042 four-state VIP request card lifecycle', () => {
 it.each(MVP_VIP_TYPES)('%s progresses MISSING READY IN_PROGRESS COMPLETED without duplicate state', vipType => {
  const initial = createInitialBootstrapState('fr042-' + vipType, undefined, 'mvp');
  const accepted = dispatch(dispatch(initial, { type: 'SHOW_VIP_PREVIEW', vipType }), { type: 'DECIDE_VIP_PREVIEW', decision: 'accept' });
  expect(requestCards(accepted).map(card => card.status)).toEqual(['MISSING']);
  expect(requestCards(accepted)[0].attainableQualityCeiling).toBeNull();
  expect(() => dispatch(accepted, { type: 'BEGIN_VIP_VISIT', vipType })).toThrow('MVP_VIP_CONSUMABLE_NOT_READY');
  const withMaterials = dispatch(accepted, { type: 'PURCHASE_VIP_MATERIALS' });
  const ready = dispatch(withMaterials, { type: 'FIX_VIP_CONSUMABLE' });
  expect(requestCards(ready).map(card => card.status)).toEqual(['READY']);
  const rehydratedReady = normalizePersistedState(JSON.parse(JSON.stringify(ready)) as BootstrapState);
  expect(requestCards(rehydratedReady)).toEqual(requestCards(ready));
  const active = dispatch(rehydratedReady, { type: 'BEGIN_VIP_VISIT', vipType });
  const cards = requestCards(active);
  expect(cards).toHaveLength(1);
  expect(cards[0].status).toBe('IN_PROGRESS');
  expect(cards[0].attainableQualityCeiling).toBe(mvpVipAttainableQualityCeiling(active.vipLayer.active?.preparedness));
  expect(active.normalWave).toEqual(ready.normalWave);
  const savedActive = normalizePersistedState(JSON.parse(JSON.stringify(active)) as BootstrapState);
  expect(requestCards(savedActive)).toEqual(cards);
  const finished = dispatch(savedActive, { type: 'ADVANCE_SIMULATION', deltaMs: MVP_VIP_PROVISIONAL_TIMING.visitDurationMs });
  const completed = requestCards(finished);
  expect(completed).toHaveLength(1);
  expect(completed[0].status).toBe('COMPLETED');
  expect(completed[0].attainableQualityCeiling).toBe(cards[0].attainableQualityCeiling);
  expect(requestCards(normalizePersistedState(JSON.parse(JSON.stringify(finished)) as BootstrapState))).toEqual(completed);
 });
 it('retains historical cards if a previously completed VIP is accepted again', () => {
  const type = 'investor' as const;
  const initial = createInitialBootstrapState('fr042-repeated', undefined, 'mvp');
  const once = dispatch(dispatch(initial, { type: 'BEGIN_VIP_VISIT', vipType: type }), { type: 'ADVANCE_SIMULATION', deltaMs: MVP_VIP_PROVISIONAL_TIMING.visitDurationMs });
  const accepted = dispatch(dispatch(once, { type: 'SHOW_VIP_PREVIEW', vipType: type }), { type: 'DECIDE_VIP_PREVIEW', decision: 'accept' });
  expect(requestCards(accepted).map(card => card.status)).toEqual(['COMPLETED', 'MISSING']);
  const ready = dispatch(dispatch(accepted, { type: 'PURCHASE_VIP_MATERIALS' }), { type: 'FIX_VIP_CONSUMABLE' });
  expect(requestCards(ready).map(card => card.status)).toEqual(['COMPLETED', 'READY']);
  const second = dispatch(ready, { type: 'BEGIN_VIP_VISIT', vipType: type });
  expect(requestCards(second).map(card => card.status)).toEqual(['COMPLETED', 'IN_PROGRESS']);
  const complete = dispatch(second, { type: 'ADVANCE_SIMULATION', deltaMs: MVP_VIP_PROVISIONAL_TIMING.visitDurationMs });
  expect(requestCards(complete).map(card => card.status)).toEqual(['COMPLETED', 'COMPLETED']);
  expect(requestCards(complete).map(card => card.key)).toEqual(['completed-0', 'completed-1']);
 });
 it('does not invent historical quality when legacy completions and resolutions are not aligned', () => {
  const initial = createInitialBootstrapState('fr042-legacy', undefined, 'mvp');
  const once = dispatch(dispatch(initial, { type: 'BEGIN_VIP_VISIT', vipType: 'investor' }), { type: 'ADVANCE_SIMULATION', deltaMs: MVP_VIP_PROVISIONAL_TIMING.visitDurationMs });
  const legacy = JSON.parse(JSON.stringify(once)) as any;
  legacy.vipLayer.resolutions = [];
  const saved = normalizePersistedState(legacy as BootstrapState);
  expect(requestCards(saved)).toEqual([{ key: 'completed-0', vipType: 'investor', status: 'COMPLETED', attainableQualityCeiling: null }]);
 });
});

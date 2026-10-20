import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand as dispatch, createInitialBootstrapState, mvpVipSpaPurchaseEligible, mvpVipSpaPurchaseAvailable, MVP_VIP_SPA_PROVISIONAL } from './state';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';

describe('FR-048 Reputation-gated MVP purchases', () => {
 const required=MVP_VIP_SPA_PROVISIONAL.reputationRequired, cost=MVP_VIP_SPA_PROVISIONAL.coinCost;
 it('rejects a direct purchase immediately below Reputation threshold',()=>{
  expect(required).toBeGreaterThan(0);
  const s={...createInitialBootstrapState('fr048-low',undefined,'mvp'),reputation:required-1,coins:cost+100};
  expect(mvpVipSpaPurchaseEligible(s)).toBe(false);
  expect(mvpVipSpaPurchaseAvailable(s)).toBe(false);
  expect(()=>dispatch(s,{type:'PURCHASE_VIP_SPA'})).toThrow('MVP_VIP_SPA_REPUTATION_INSUFFICIENT');
  expect(s.reputation).toBe(required-1);
 });
 it('separates threshold eligibility from Coins payment; preserves non-spendable Reputation and save',()=>{
  const eligible={...createInitialBootstrapState('fr048-ready',undefined,'mvp'),reputation:required,coins:cost-1};
  expect(mvpVipSpaPurchaseEligible(eligible)).toBe(true);
  expect(mvpVipSpaPurchaseAvailable(eligible)).toBe(false);
  expect(()=>dispatch(eligible,{type:'PURCHASE_VIP_SPA'})).toThrow('MVP_VIP_SPA_COINS_INSUFFICIENT');
  const paid={...eligible,coins:cost+4};
  const built=dispatch(paid,{type:'PURCHASE_VIP_SPA'});
  expect(built.coins).toBe(4);expect(built.reputation).toBe(required);
  expect(built.vipBuildings.spa).toBe(true);
  expect(mvpVipSpaPurchaseEligible(built)).toBe(false);
  expect(dispatch(built,{type:'PURCHASE_VIP_SPA'})).toBe(built);
  const restored=normalizePersistedState(JSON.parse(JSON.stringify(built)));
  expect(restored.reputation).toBe(required);expect(restored.vipBuildings.spa).toBe(true);
 });
 it('keeps Prototype milestone progression separate from MVP Reputation',()=>{
  const s={...createInitialBootstrapState('fr048-proto'),reputation:required+100,coins:cost+100};
  expect(mvpVipSpaPurchaseEligible(s)).toBe(false);
  expect(()=>dispatch(s,{type:'PURCHASE_VIP_SPA'})).toThrow('MVP_VIP_SPA_STAGE_INVALID');
 });
});

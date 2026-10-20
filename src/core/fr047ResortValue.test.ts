import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand as dispatch, createInitialBootstrapState, normalWaveUpgradeQuote, PROTOTYPE_UPGRADE_PROOF_TUNING, MVP_VIP_SPA_PROVISIONAL, type BootstrapState } from './state';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';

function betweenWaves(stage: 'prototype' | 'mvp'): BootstrapState {
 let state = dispatch(createInitialBootstrapState('fr047-' + stage, undefined, stage), { type: 'START_WAVE' });
 for (let i = 0; i < 12 && state.normalWave.phase !== 'complete'; i++) state = dispatch(state, { type: 'ADVANCE_SIMULATION', deltaMs: 90000 });
 expect(state.normalWave.phase).toBe('complete');
 return { ...state, coins: 1000 };
}

describe('FR-047 Resort Value remains prestige rather than spendable currency', () => {
 it.each(['prototype', 'mvp'] as const)('upgrade level progression adds prestige in %s', stage => {
  let state = betweenWaves(stage);
  const maximum = stage === 'prototype' ? 3 : 5;
  for (let level = 2; level <= maximum; level++) {
   const quote = normalWaveUpgradeQuote(state, 'reception');
   expect(quote?.toLevel).toBe(level);
   expect(quote?.resortValueGain).toBeGreaterThan(0);
   const next = dispatch(state, { type: 'UPGRADE_BUILDING', need: 'reception' });
   expect(next.resortValue).toBe(state.resortValue + quote!.resortValueGain);
   expect(next.resortValue).toBeGreaterThan(state.resortValue);
   expect(next.coins).toBe(state.coins - quote!.coinCost);
   state = next;
  }
  expect(normalWaveUpgradeQuote(state, 'reception')).toBeNull();
  expect(dispatch(state, { type: 'UPGRADE_BUILDING', need: 'reception' })).toBe(state);
 });
 it('purchasing a Spa and simulation passage do not spend Resort Value', () => {
  const start = betweenWaves('mvp');
  const purchased = dispatch(start, { type: 'PURCHASE_VIP_SPA' });
  expect(purchased.coins).toBe(start.coins - MVP_VIP_SPA_PROVISIONAL.coinCost);
  expect(purchased.resortValue).toBe(start.resortValue);
  const advanced = dispatch(purchased, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
  expect(advanced.resortValue).toBe(purchased.resortValue);
 });
 it('malformed persisted tuning cannot reduce prestige when upgrading', () => {
  const state = betweenWaves('prototype');
  for (const invalid of [-100, 0, Number.NaN, Number.NEGATIVE_INFINITY]) {
   const snapshot = { ...state, normalWave: { ...state.normalWave, upgradeTuning: { ...state.normalWave.upgradeTuning, resortValueGainByTargetLevel: { 2: invalid, 3: invalid } } } };
   const loaded = normalizePersistedState(snapshot);
   const quote = normalWaveUpgradeQuote(loaded, 'reception');
   expect(quote?.resortValueGain).toBe(PROTOTYPE_UPGRADE_PROOF_TUNING.resortValueGainByTargetLevel[2]);
   const next = dispatch(loaded, { type: 'UPGRADE_BUILDING', need: 'reception' });
   expect(next.resortValue).toBeGreaterThan(loaded.resortValue);
  }
 });
 it('migrates invalid prestige balances without resetting valid balances or buildings', () => {
  const state = betweenWaves('mvp');
  const legitimate = { ...state, resortValue: 22 };
  expect(normalizePersistedState(legitimate)).toBe(legitimate);
  for (const value of [-10, Number.NaN, Number.POSITIVE_INFINITY, 1.5, undefined]) {
   const legacy = { ...state, resortValue: value } as unknown as BootstrapState;
   const recovered = normalizePersistedState(legacy);
   expect(recovered.resortValue).toBe(PROTOTYPE_UPGRADE_PROOF_TUNING.startingResortValue);
   expect(recovered.coins).toBe(state.coins);
   expect(recovered.normalWave.buildingLevelsByNeed).toEqual(state.normalWave.buildingLevelsByNeed);
  }
 });
 it('rejects unsafe or negative reducer inputs instead of corrupting prestige', () => {
  const state = betweenWaves('prototype');
  expect(() => dispatch({ ...state, resortValue: -1 }, { type: 'UPGRADE_BUILDING', need: 'reception' })).toThrow('RESORT_VALUE_INVARIANT');
  expect(() => dispatch({ ...state, resortValue: Number.MAX_SAFE_INTEGER }, { type: 'UPGRADE_BUILDING', need: 'reception' })).toThrow('RESORT_VALUE_INVARIANT');
 });
});

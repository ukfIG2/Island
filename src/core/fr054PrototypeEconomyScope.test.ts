import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand as dispatch, createInitialBootstrapState, normalWaveUpgradeQuote, type BootstrapState } from './state';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';

function finish(stage: BootstrapState['progressionStage']): BootstrapState {
  let state = dispatch(createInitialBootstrapState('fr054-wave-' + stage, undefined, stage), { type: 'START_WAVE' });
  for (let i = 0; i < 900 && state.normalWave.phase !== 'complete'; i++) state = dispatch(state, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
  expect(state.normalWave.phase).toBe('complete');
  expect(state.normalWave.result?.rating).toBeGreaterThan(0);
  return state;
}

describe('FR-054 Prototype economy boundary', () => {
  it('starts with only Coins/Energy spendable and Resort Value status, with no MVP currency', () => {
    const state = createInitialBootstrapState('fr054-initial');
    expect(state.progressionStage).toBe('prototype');
    expect(state.coins).toBeGreaterThan(0);
    expect(state.energy).toBe(0);
    expect(state.resortValue).toBeGreaterThanOrEqual(0);
    expect([state.reputation, state.materials, state.gems]).toEqual([0, 0, 0]);
    expect(state.lastVipReward).toBeNull();
  });
  it('normal-wave completion credits Coins and Energy but never Reputation/Materials/Gems in Prototype; MVP still earns Reputation', () => {
    const prototype = finish('prototype');
    const mvp = finish('mvp');
    const baseline = createInitialBootstrapState('fr054-baseline');
    expect(prototype.coins).toBeGreaterThan(baseline.coins);
    expect(prototype.energy).toBeGreaterThan(baseline.energy);
    expect([prototype.reputation, prototype.materials, prototype.gems]).toEqual([0, 0, 0]);
    expect(mvp.reputation).toBe(mvp.normalWave.result?.rating);
    expect(mvp.reputation).toBeGreaterThan(0);
  });
  it('spends Coins for building improvements and Energy for temporary service, increasing nonspendable Resort Value', () => {
    const state = finish('prototype');
    const quote = normalWaveUpgradeQuote(state, 'food');
    expect(quote).not.toBeNull();
    if (quote === null) throw new Error('FR054_QUOTE_MISSING');
    expect(quote.materialCost).toBe(0);
    const funded = { ...state, coins: quote.coinCost + 20 };
    const upgraded = dispatch(funded, { type: 'UPGRADE_BUILDING', need: 'food' });
    expect(upgraded.coins).toBe(funded.coins - quote.coinCost);
    expect(upgraded.resortValue).toBe(funded.resortValue + quote.resortValueGain);
    expect(upgraded.materials).toBe(0);
    const active = dispatch(dispatch(upgraded, { type: 'CONTINUE_TO_NEXT_WAVE' }), { type: 'START_WAVE' });
    const boosted = dispatch(active, { type: 'ACTIVATE_ENERGY_MODE', need: 'food' });
    expect(boosted.energy).toBe(active.energy - 1);
    expect(boosted.normalWave.energyMode?.need).toBe('food');
    expect([boosted.reputation, boosted.materials, boosted.gems]).toEqual([0, 0, 0]);
  });
  it('rejects premium and Materials commands in Prototype even with forged wallet balances', () => {
    const state = { ...createInitialBootstrapState('fr054-commands'), gems: 1000, materials: 1000, coins: 1000 };
    expect(() => dispatch(state, { type: 'PURCHASE_RESORT_CREST' })).toThrow('MVP_GEMS_STAGE_INVALID');
    expect(() => dispatch(state, { type: 'PURCHASE_VIP_MATERIALS' })).toThrow('MVP_VIP_STAGE_INVALID');
  });
  it('clears legacy or forged Prototype currencies, premium entitlement and VIP receipt without damaging Coins/Energy/Resort Value', () => {
    const clean = createInitialBootstrapState('fr054-hydration');
    const receipt = { vipType: 'critic', qualityCeiling: 5, reputation: 12, completedVisitCount: 1, materials: 3 } as unknown as BootstrapState['lastVipReward'];
    const dirty = { ...clean, coins: 81, energy: 5, resortValue: 27, reputation: 19, materials: 13, gems: 9, premiumEntitlements: { resortCrest: true }, lastVipReward: receipt };
    const hydrated = normalizePersistedState(dirty);
    expect(hydrated.progressionStage).toBe('prototype');
    expect([hydrated.reputation, hydrated.materials, hydrated.gems]).toEqual([0, 0, 0]);
    expect(hydrated.lastVipReward).toBeNull();
    expect(hydrated.premiumEntitlements.resortCrest).toBe(false);
    expect([hydrated.coins, hydrated.energy, hydrated.resortValue]).toEqual([81, 5, 27]);
    const unknown = normalizePersistedState({ ...dirty, progressionStage: 'future-stage' as BootstrapState['progressionStage'] });
    expect(unknown.progressionStage).toBe('prototype');
    expect([unknown.reputation, unknown.materials, unknown.gems]).toEqual([0, 0, 0]);
    expect(unknown.lastVipReward).toBeNull();
  });
  it('preserves valid MVP Reputation, Materials, Gems and cosmetic ownership during hydration', () => {
    const mvp = { ...createInitialBootstrapState('fr054-mvp-save', undefined, 'mvp'), reputation: 28, materials: 9, gems: 7, premiumEntitlements: { resortCrest: true } };
    const hydrated = normalizePersistedState(mvp);
    expect(hydrated.progressionStage).toBe('mvp');
    expect([hydrated.reputation, hydrated.materials, hydrated.gems]).toEqual([28, 9, 7]);
    expect(hydrated.premiumEntitlements.resortCrest).toBe(true);
  });
});

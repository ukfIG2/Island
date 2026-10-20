import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, enableMvpProgression, MVP_GEMS_PREMIUM_PROVISIONAL } from './state';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';

describe('FR-052 Gems reserved for permanent premium purchases', () => {
  const initial = () => createInitialBootstrapState('fr052', undefined, 'mvp');
  it('keeps Prototype currency scope free of Gems and premium rights', () => {
    const prototype = createInitialBootstrapState('fr052-prototype');
    expect(prototype.gems).toBe(0);
    expect(prototype.premiumEntitlements.resortCrest).toBe(false);
    expect(() => applyBootstrapCommand({ ...prototype, gems: 999 }, { type: 'PURCHASE_RESORT_CREST' })).toThrow('MVP_GEMS_STAGE_INVALID');
    const promoted = enableMvpProgression(prototype);
    expect(promoted.gems).toBe(MVP_GEMS_PREMIUM_PROVISIONAL.initialMvpGems);
    expect(enableMvpProgression(promoted)).toBe(promoted);
  });
  it('spends Gems once for a durable cosmetic entitlement without changing gameplay resources', () => {
    const before = initial();
    const after = applyBootstrapCommand(before, { type: 'PURCHASE_RESORT_CREST' });
    expect(after.gems).toBe(before.gems - MVP_GEMS_PREMIUM_PROVISIONAL.resortCrestCostGems);
    expect(after.premiumEntitlements.resortCrest).toBe(true);
    expect(after.energy).toBe(before.energy);
    expect(after.coins).toBe(before.coins);
    expect(after.materials).toBe(before.materials);
    expect(after.reputation).toBe(before.reputation);
    expect(after.resortValue).toBe(before.resortValue);
    expect(before.premiumEntitlements.resortCrest).toBe(false);
    expect(() => applyBootstrapCommand(after, { type: 'PURCHASE_RESORT_CREST' })).toThrow('MVP_PREMIUM_ALREADY_OWNED');
  });
  it('rejects insufficient Gems before any purchase', () => {
    const before = { ...initial(), gems: MVP_GEMS_PREMIUM_PROVISIONAL.resortCrestCostGems - 1 };
    expect(() => applyBootstrapCommand(before, { type: 'PURCHASE_RESORT_CREST' })).toThrow('MVP_GEMS_INSUFFICIENT');
    expect(before.premiumEntitlements.resortCrest).toBe(false);
  });
  it('does not spend Gems for normal-wave Energy acceleration or simulated time', () => {
    const before = applyBootstrapCommand({ ...initial(), energy: 1 }, { type: 'START_WAVE' });
    const boosted = applyBootstrapCommand(before, { type: 'ACTIVATE_ENERGY_MODE', need: 'reception' });
    expect(boosted.energy).toBe(before.energy - 1);
    expect(boosted.gems).toBe(before.gems);
    const advanced = applyBootstrapCommand(boosted, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
    expect(advanced.gems).toBe(boosted.gems);
    expect(advanced.premiumEntitlements.resortCrest).toBe(false);
  });
  it('roundtrips ownership and wallet, defaulting missing legacy fields to zero and unowned', () => {
    const after = applyBootstrapCommand(initial(), { type: 'PURCHASE_RESORT_CREST' });
    const restored = normalizePersistedState(JSON.parse(JSON.stringify(after)));
    expect(restored.gems).toBe(after.gems);
    expect(restored.premiumEntitlements.resortCrest).toBe(true);
    const legacy = JSON.parse(JSON.stringify(after));
    delete legacy.gems; delete legacy.premiumEntitlements;
    const migrated = normalizePersistedState(legacy);
    expect(migrated.gems).toBe(0);
    expect(migrated.premiumEntitlements.resortCrest).toBe(false);
    expect(migrated.energy).toBe(after.energy);
  });
  it('normalizes malformed premium values and quarantines MVP balances from Prototype', () => {
    const malformed = normalizePersistedState({ ...initial(), gems: -40, premiumEntitlements: { resortCrest: 'yes' } } as never);
    expect(malformed.gems).toBe(0);
    expect(malformed.premiumEntitlements.resortCrest).toBe(false);
    const prototype = normalizePersistedState({ ...initial(), progressionStage: 'prototype' } as never);
    expect(prototype.gems).toBe(0);
    expect(prototype.premiumEntitlements.resortCrest).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand as dispatch, createInitialBootstrapState, normalWaveUpgradeQuote } from './state';
import { MVP_BUILDING_EXTENSION_PROOF_TUNING } from './mvpBuildingProgression';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';

type State = ReturnType<typeof createInitialBootstrapState>;
function prepared(stage: 'mvp' | 'prototype' = 'mvp'): State {
  let s = createInitialBootstrapState('fr050-materials', undefined, stage);
  s = dispatch(s, { type: 'START_WAVE' });
  s = dispatch(s, { type: 'ADVANCE_SIMULATION', deltaMs: 600_000 });
  expect(s.normalWave.phase).toBe('complete');
  return { ...s, coins: 1_000, materials: 20 };
}
function upgrade(s: State): State {
  const q = normalWaveUpgradeQuote(s, 'reception');
  expect(q).not.toBeNull();
  const next = dispatch(s, { type: 'UPGRADE_BUILDING', need: 'reception' });
  expect(next.normalWave.buildingLevelsByNeed.reception).toBe(q!.toLevel);
  expect(next.coins).toBe(s.coins - q!.coinCost);
  expect(next.materials).toBe(s.materials - q!.materialCost);
  return next;
}
describe('FR-050: Materials uses', () => {
  it('keeps Levels 2 and 3 Coins-only and Prototype capped at Level 3', () => {
    for (const stage of ['prototype', 'mvp'] as const) {
      let s=prepared(stage);
      for(const target of [2,3]) {
        const q=normalWaveUpgradeQuote(s,'reception');
        expect(q?.toLevel).toBe(target);
        expect(q?.materialCost).toBe(0);
        s=upgrade(s);
      }
      if(stage==='prototype') {
        expect(normalWaveUpgradeQuote(s,'reception')).toBeNull();
        expect(dispatch(s,{type:'UPGRADE_BUILDING',need:'reception'})).toBe(s);
      }
    }
  });
  it('requires and atomically spends both currencies at MVP Levels 4 and 5', () => {
    let s=prepared();s=upgrade(upgrade(s));
    for(const level of [4,5] as const) {
      const q=normalWaveUpgradeQuote(s,'reception');
      expect(q?.toLevel).toBe(level);
      expect(q?.coinCost).toBe(MVP_BUILDING_EXTENSION_PROOF_TUNING[level].coinCost);
      expect(q?.materialCost).toBe(MVP_BUILDING_EXTENSION_PROOF_TUNING[level].materialCost);
      expect(q!.materialCost).toBeGreaterThan(0);
      const lowMaterials={...s,materials:q!.materialCost-1};
      expect(dispatch(lowMaterials,{type:'UPGRADE_BUILDING',need:'reception'})).toBe(lowMaterials);
      const lowCoins={...s,coins:q!.coinCost-1};
      expect(dispatch(lowCoins,{type:'UPGRADE_BUILDING',need:'reception'})).toBe(lowCoins);
      s=upgrade(s);
      expect(normalizePersistedState(JSON.parse(JSON.stringify(s))).materials).toBe(s.materials);
    }
    expect(normalWaveUpgradeQuote(s,'reception')).toBeNull();
  });
  it('preserves VIP Fix Materials transactions independently of building upgrades', () => {
    const s=prepared();
    expect(s.progressionStage).toBe('mvp');
    expect(s.materials).toBe(20);
    expect(normalWaveUpgradeQuote(s,'reception')?.materialCost).toBe(0);
  });
});

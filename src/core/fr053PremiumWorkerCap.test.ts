import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, normalWaveCanHireWorker, type BootstrapState } from './state';

describe('FR-053 premium ownership cannot bypass the ordinary Worker population cap', () => {
  const initial = () => createInitialBootstrapState('fr053-worker-cap', undefined, 'mvp');
  const ownCrest = (state: ReturnType<typeof initial>) => applyBootstrapCommand(state, { type: 'PURCHASE_RESORT_CREST' });

  it('premium ownership does not alter roster, slots, Coins, Energy, or staffing cap', () => {
    const standard = { ...initial(), coins: 150 };
    const premium = ownCrest(standard);
    expect(premium.normalWave).toBe(standard.normalWave);
    expect(premium.coins).toBe(standard.coins);
    expect(premium.energy).toBe(standard.energy);
    expect(premium.gems).toBeLessThan(standard.gems);
    for (const state of [standard, premium]) {
      expect(normalWaveCanHireWorker(state, 'food')).toBe(false);
      expect(() => applyBootstrapCommand(state, { type: 'HIRE_WORKER', to: 'food' })).toThrow('NORMAL_WAVE_WORKER_SCARCITY_INVALID');
    }
  });

  it('valid hires and eventual population-cap rejection are identical with and without premium entitlement', () => {
    const base = initial();
    const eligible = { ...base, coins: 150, normalWave: { ...base.normalWave, buildingLevelsByNeed: { ...base.normalWave.buildingLevelsByNeed, reception: 2 as const, food: 2 as const } } };
    const premium = ownCrest(eligible);
    const run = (state: BootstrapState) => {
      expect(normalWaveCanHireWorker(state, 'food')).toBe(true);
      const first = applyBootstrapCommand(state, { type: 'HIRE_WORKER', to: 'food' });
      const second = applyBootstrapCommand(first, { type: 'HIRE_WORKER', to: 'reception' });
      expect(Object.keys(second.normalWave.workerAssignments)).toHaveLength(4);
      expect(normalWaveCanHireWorker(second, 'food')).toBe(false);
      expect(() => applyBootstrapCommand(second, { type: 'HIRE_WORKER', to: 'food' })).toThrow('NORMAL_WAVE_WORKER_SCARCITY_INVALID');
      return second;
    };
    const ordinaryEnd = run(eligible);
    const premiumEnd = run(premium);
    expect(premiumEnd.normalWave).toEqual(ordinaryEnd.normalWave);
    expect(premiumEnd.coins).toBe(ordinaryEnd.coins);
    expect(premiumEnd.gems).toBe(premium.gems);
  });
});

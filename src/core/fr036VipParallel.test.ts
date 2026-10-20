import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand as dispatch, createInitialBootstrapState } from './state';
import { MVP_VIP_CATALOG, MVP_VIP_TYPES, MVP_VIP_PROVISIONAL_TIMING } from './vipLayer';
describe('FR-036 optional parallel VIP gameplay', () => {
  it('contains exactly four distinct canonically named MVP VIP guests', () => {
    expect(MVP_VIP_TYPES.map(id => MVP_VIP_CATALOG[id].label)).toEqual(['Travel Blogger', 'Wedding Couple', 'Investor', 'Influencer']);
  });
  it('keeps prototype VIP participation unavailable and MVP opt-in', () => {
    const prototype = createInitialBootstrapState('fr036-prototype');
    expect(prototype.vipLayer.active).toBeNull();
    expect(() => dispatch(prototype, { type: 'BEGIN_VIP_VISIT', vipType: 'investor' })).toThrow('MVP_VIP_STAGE_INVALID');
    const mvp = createInitialBootstrapState('fr036-optional', undefined, 'mvp');
    const progressed = dispatch(mvp, { type: 'ADVANCE_SIMULATION', deltaMs: 1200 });
    expect(progressed.vipLayer).toEqual(mvp.vipLayer);
  });
  it.each(MVP_VIP_TYPES)('supports %s alongside an identical, uninterrupted normal wave', type => {
    const initial = dispatch(createInitialBootstrapState('fr036-' + type, undefined, 'mvp'), { type: 'START_WAVE' });
    const active = dispatch(initial, { type: 'BEGIN_VIP_VISIT', vipType: type });
    expect(active.normalWave).toEqual(initial.normalWave);
    expect(active.vipLayer.active?.type).toBe(type);
    expect(() => dispatch(active, { type: 'BEGIN_VIP_VISIT', vipType: type })).toThrow('MVP_VIP_ALREADY_ACTIVE');
    const half = MVP_VIP_PROVISIONAL_TIMING.visitDurationMs / 2;
    const baselineHalf = dispatch(initial, { type: 'ADVANCE_SIMULATION', deltaMs: half });
    const withVipHalf = dispatch(active, { type: 'ADVANCE_SIMULATION', deltaMs: half });
    expect(withVipHalf.normalWave).toEqual(baselineHalf.normalWave);
    expect(withVipHalf.vipLayer.active?.elapsedMs).toBe(half);
    const baselineEnd = dispatch(baselineHalf, { type: 'ADVANCE_SIMULATION', deltaMs: half });
    const withVipEnd = dispatch(withVipHalf, { type: 'ADVANCE_SIMULATION', deltaMs: half });
    expect(withVipEnd.normalWave).toEqual(baselineEnd.normalWave);
    expect(withVipEnd.vipLayer.active).toBeNull();
    expect(withVipEnd.vipLayer.completed).toEqual([type]);
    expect(withVipEnd.energy).toBe(baselineEnd.energy);
    expect(withVipEnd.coins).toBe(baselineEnd.coins);
    expect(withVipEnd.normalWave.phase).toBe('incoming');
  });
});

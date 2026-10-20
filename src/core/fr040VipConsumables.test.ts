import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand as dispatch, createInitialBootstrapState, MVP_VIP_MATERIALS_PROVISIONAL, type BootstrapState } from './state';
import { MVP_VIP_TYPES, type MvpVipType } from './vipLayer';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';
const supply = MVP_VIP_MATERIALS_PROVISIONAL;
function accepted(vipType: MvpVipType): BootstrapState {
  const initial = createInitialBootstrapState('fr040-' + vipType, undefined, 'mvp');
  return dispatch(dispatch(initial, { type: 'SHOW_VIP_PREVIEW', vipType }), { type: 'DECIDE_VIP_PREVIEW', decision: 'accept' });
}
describe('FR-040 VIP consumable MISSING → Fix → READY', () => {
  it.each(MVP_VIP_TYPES)('%s requires actual Materials and forbids unpaid/repeated Fix', vipType => {
    const missing = accepted(vipType);
    expect(missing.materials).toBe(0);
    expect(missing.vipLayer.requestsOpen).toBe(true);
    expect(missing.vipLayer.consumableReady).toBe(false);
    expect(() => dispatch(missing, { type: 'FIX_VIP_CONSUMABLE' })).toThrow('MVP_VIP_MATERIALS_INSUFFICIENT');
    expect(() => dispatch(missing, { type: 'BEGIN_VIP_VISIT', vipType })).toThrow('MVP_VIP_CONSUMABLE_NOT_READY');
    const stocked = dispatch(missing, { type: 'PURCHASE_VIP_MATERIALS' });
    expect(stocked.coins).toBe(missing.coins - supply.supplyCostCoins);
    expect(stocked.materials).toBe(missing.materials + supply.supplyUnits);
    expect(stocked.vipLayer.consumableReady).toBe(false);
    expect(stocked.normalWave).toBe(missing.normalWave);
    const fixed = dispatch(stocked, { type: 'FIX_VIP_CONSUMABLE' });
    expect(fixed.materials).toBe(stocked.materials - supply.fixCostMaterials);
    expect(fixed.vipLayer.consumableReady).toBe(true);
    expect(fixed.coins).toBe(stocked.coins);
    expect(fixed.normalWave).toBe(stocked.normalWave);
    expect(() => dispatch(fixed, { type: 'FIX_VIP_CONSUMABLE' })).toThrow('MVP_VIP_CONSUMABLE_FIX_UNAVAILABLE');
    const visit = dispatch(fixed, { type: 'BEGIN_VIP_VISIT', vipType });
    expect(visit.vipLayer.active?.type).toBe(vipType);
    expect(visit.vipLayer.requestsOpen).toBe(false);
    expect(visit.vipLayer.consumableReady).toBe(false);
    expect(visit.materials).toBe(fixed.materials);
  });
  it('persists MISSING, stock and READY over serialization; preserves canonical identity', () => {
    const first = accepted('investor');
    expect(normalizePersistedState(first)).toBe(first);
    const stocked = dispatch(first, { type: 'PURCHASE_VIP_MATERIALS' });
    const restoredStock = normalizePersistedState(JSON.parse(JSON.stringify(stocked)) as BootstrapState);
    expect(restoredStock.materials).toBe(stocked.materials);
    expect(restoredStock.vipLayer.consumableReady).toBe(false);
    const fixed = dispatch(restoredStock, { type: 'FIX_VIP_CONSUMABLE' });
    const restoredReady = normalizePersistedState(JSON.parse(JSON.stringify(fixed)) as BootstrapState);
    expect(restoredReady.materials).toBe(fixed.materials);
    expect(restoredReady.vipLayer.consumableReady).toBe(true);
    expect(dispatch(restoredReady, { type: 'BEGIN_VIP_VISIT', vipType: 'investor' }).vipLayer.active?.type).toBe('investor');
  });
  it('hydrates legacy and invalid Materials to zero without a free READY state', () => {
    const missing = accepted('investor');
    for (const value of [undefined, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const damaged = { ...missing, materials: value, vipLayer: { ...missing.vipLayer, consumableReady: undefined } } as unknown as BootstrapState;
      const restored = normalizePersistedState(damaged);
      expect(restored.materials).toBe(0);
      expect(restored.vipLayer.consumableReady).toBe(false);
      expect(() => dispatch(restored, { type: 'FIX_VIP_CONSUMABLE' })).toThrow('MVP_VIP_MATERIALS_INSUFFICIENT');
    }
  });
  it('rejects purchases without Coins and prevents prototype-stage supply or Fix', () => {
    const opened = accepted('investor');
    const poor = { ...opened, coins: supply.supplyCostCoins - 1 };
    expect(() => dispatch(poor, { type: 'PURCHASE_VIP_MATERIALS' })).toThrow('MVP_VIP_MATERIALS_COINS_INSUFFICIENT');
    expect(poor.materials).toBe(0);
    const prototype = createInitialBootstrapState('fr040-prototype');
    expect(() => dispatch(prototype, { type: 'PURCHASE_VIP_MATERIALS' })).toThrow('MVP_VIP_STAGE_INVALID');
    expect(() => dispatch(prototype, { type: 'FIX_VIP_CONSUMABLE' })).toThrow('MVP_VIP_STAGE_INVALID');
  });
  it('preserves FR-036 direct VIP entry without a fabricated accepted request', () => {
    const initial = createInitialBootstrapState('fr040-direct', undefined, 'mvp');
    const visit = dispatch(initial, { type: 'BEGIN_VIP_VISIT', vipType: 'investor' });
    expect(visit.vipLayer.active?.type).toBe('investor');
    expect(visit.materials).toBe(initial.materials);
  });
});

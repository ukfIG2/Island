import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, MVP_VIP_SPA_BUILDING, MVP_VIP_SPA_PROVISIONAL, mvpVipSpaPurchaseAvailable, NORMAL_SERVICE_IDS, PROTOTYPE_AREA_IDS, type BootstrapState } from './state';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';
describe('FR-044: Spa is exclusively VIP-oriented infrastructure', () => {
 it('has no ordinary service need or Worker slot in either catalog', () => {
  expect(MVP_VIP_SPA_BUILDING.role).toBe('vip');
  expect(MVP_VIP_SPA_BUILDING.normalWaveNeed).toBeNull();
  expect(MVP_VIP_SPA_BUILDING.workerSlots).toBe(0);
  expect(NORMAL_SERVICE_IDS).not.toContain('spa');
  expect(PROTOTYPE_AREA_IDS).not.toContain('spa');
 });
 it('purchases Spa using core-owned Coins without changing normal waves or staffing', () => {
  const initial = createInitialBootstrapState('fr044', undefined, 'mvp');
  const ready: BootstrapState = { ...initial, coins: MVP_VIP_SPA_PROVISIONAL.coinCost + 5 };
  expect(mvpVipSpaPurchaseAvailable(ready)).toBe(true);
  const bought = applyBootstrapCommand(ready, { type: 'PURCHASE_VIP_SPA' });
  expect(bought.vipBuildings.spa).toBe(true);
  expect(bought.coins).toBe(5);
  expect(bought.normalWave).toBe(ready.normalWave);
  expect(bought.purchasedAreas).toBe(ready.purchasedAreas);
  expect(bought.hiredSpecialists).toBe(ready.hiredSpecialists);
  expect(bought.vipLayer).toBe(ready.vipLayer);
  expect(bought.energy).toBe(ready.energy);
  expect(bought.simulationTick).toBe(ready.simulationTick);
  expect(bought.elapsedSimulationMs).toBe(ready.elapsedSimulationMs);
  expect(mvpVipSpaPurchaseAvailable(bought)).toBe(false);
  expect(applyBootstrapCommand(bought, { type: 'PURCHASE_VIP_SPA' })).toBe(bought);
 });
 it('rejects wrong stage and insufficient Coins without constructing Spa', () => {
  const prototype = { ...createInitialBootstrapState('fr044-proto'), coins: 100 };
  expect(mvpVipSpaPurchaseAvailable(prototype)).toBe(false);
  expect(() => applyBootstrapCommand(prototype, { type: 'PURCHASE_VIP_SPA' })).toThrow('MVP_VIP_SPA_STAGE_INVALID');
  const poor = createInitialBootstrapState('fr044-poor', undefined, 'mvp');
  const empty: BootstrapState = { ...poor, coins: 0 };
  expect(mvpVipSpaPurchaseAvailable(empty)).toBe(false);
  expect(() => applyBootstrapCommand(empty, { type: 'PURCHASE_VIP_SPA' })).toThrow('MVP_VIP_SPA_COINS_INSUFFICIENT');
  expect(empty.vipBuildings.spa).toBe(false);
 });
 it('hydrates prior saves as unbuilt and preserves purchased Spa across JSON persistence', () => {
  const base = createInitialBootstrapState('fr044-save', undefined, 'mvp');
  const legacy = JSON.parse(JSON.stringify(base)) as BootstrapState;
  delete (legacy as unknown as Record<string, unknown>).vipBuildings;
  const normalized = normalizePersistedState(legacy);
  expect(normalized.vipBuildings).toEqual({ spa: false });
  const purchased = applyBootstrapCommand({ ...normalized, coins: MVP_VIP_SPA_PROVISIONAL.coinCost }, { type: 'PURCHASE_VIP_SPA' });
  const restored = normalizePersistedState(JSON.parse(JSON.stringify(purchased)) as BootstrapState);
  expect(restored.vipBuildings.spa).toBe(true);
  expect(restored.normalWave).toEqual(purchased.normalWave);
  expect(normalizePersistedState(restored)).toBe(restored);
  const corrupt: BootstrapState = { ...purchased, vipBuildings: { spa: 'bogus' as unknown as boolean } };
  expect(normalizePersistedState(corrupt).vipBuildings.spa).toBe(false);
 });
});

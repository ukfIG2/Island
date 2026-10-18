import { describe, expect, it } from 'vitest';
import {
  applyBootstrapCommand,
  createInitialBootstrapState,
  normalWaveForecast,
  prototypeAreaUnlockView,
  type BootstrapState
} from './state';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';

function completeWave(state: BootstrapState): BootstrapState {
  let next = applyBootstrapCommand(state, { type: 'START_WAVE' });
  for (let guard = 0; guard < 32 && next.normalWave.phase !== 'complete'; guard += 1) {
    next = applyBootstrapCommand(next, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
  }
  expect(next.normalWave.phase).toBe('complete');
  return next;
}

function completeThrough(state: BootstrapState, waveNumber: number): BootstrapState {
  let next = state;
  while (next.currentWaveNumber <= waveNumber) {
    next = completeWave(next);
    if (next.currentWaveNumber === waveNumber) return next;
    next = applyBootstrapCommand(next, { type: 'CONTINUE_TO_NEXT_WAVE' });
  }
  return next;
}

describe('Prototype area unlock progression', () => {
  it('keeps Pool and Bungalows locked before milestone completion', () => {
    const state = createInitialBootstrapState('areas-initial');
    expect(prototypeAreaUnlockView(state, 'pool').status).toBe('locked');
    expect(prototypeAreaUnlockView(state, 'bungalows').status).toBe('locked');
    expect(normalWaveForecast(state).needs).toEqual(['reception', 'food', 'drinks']);
    expect(Object.keys(state.normalWave.workerAssignments)).toEqual(['worker-1', 'worker-0']);
  });

  it('allows Pool to remain deferred after Wave 3 without spawning Relax', () => {
    const wave3Complete = completeThrough(createInitialBootstrapState('pool-deferred'), 3);
    expect(prototypeAreaUnlockView(wave3Complete, 'pool').status).toBe('available');
    const wave4 = applyBootstrapCommand(wave3Complete, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(wave4.currentWaveNumber).toBe(4);
    expect(wave4.normalWave.activeNeedIds).toEqual(['reception', 'food', 'drinks']);
    expect(wave4.normalWave.demandTargetByNeed.relax).toBe(0);
    expect(prototypeAreaUnlockView(wave4, 'pool').status).toBe('available');
  });

  it('exposes an eligible Pool as not affordable when Coins are insufficient', () => {
    const wave3Complete = completeThrough(createInitialBootstrapState('pool-not-affordable'), 3);
    const insufficient = { ...wave3Complete, coins: 9 };

    expect(prototypeAreaUnlockView(insufficient, 'pool').status).toBe('not_affordable');
    expect(insufficient.purchasedAreas.pool).toBe(false);
    expect(insufficient.normalWave.demandTargetByNeed.relax).toBe(0);
  });

  it('preserves purchased areas and current wave through canonical persistence normalization', () => {
    const wave3Complete = completeThrough(createInitialBootstrapState('pool-persisted'), 3);
    const wave4 = applyBootstrapCommand(wave3Complete, { type: 'CONTINUE_TO_NEXT_WAVE' });
    const purchased = applyBootstrapCommand(wave4, { type: 'PURCHASE_AREA', areaId: 'pool' });
    const normalized = normalizePersistedState(purchased);

    expect(normalized).toBe(purchased);
    expect(normalized.currentWaveNumber).toBe(4);
    expect(normalized.purchasedAreas).toEqual({ pool: true, bungalows: false });
    expect(normalized.normalWave.activeNeedIds).toEqual(['reception', 'food', 'drinks', 'relax']);
    expect(normalized.normalWave.workerAssignments['worker-2']).toBe('relax');
  });

  it('purchases Pool with Coins, grants a Worker and softly debuts Relax', () => {
    const wave3Complete = completeThrough(createInitialBootstrapState('pool-purchase'), 3);
    const wave4 = applyBootstrapCommand(wave3Complete, { type: 'CONTINUE_TO_NEXT_WAVE' });
    const purchased = applyBootstrapCommand(wave4, { type: 'PURCHASE_AREA', areaId: 'pool' });
    const poolCost = prototypeAreaUnlockView(wave4, 'pool').coinCost;
    expect(purchased.coins).toBe(wave4.coins - poolCost);
    expect(purchased.purchasedAreas.pool).toBe(true);
    expect(purchased.normalWave.activeNeedIds).toEqual(['reception', 'food', 'drinks', 'relax']);
    expect(purchased.normalWave.debutNeedIds).toEqual(['relax']);
    expect(purchased.normalWave.workerAssignments['worker-2']).toBe('relax');
    expect(purchased.normalWave.demandTargetByNeed.reception).toBe(6);
    expect(purchased.normalWave.demandTargetByNeed.relax).toBe(3);
    const complete = completeWave(purchased);
    expect(complete.normalWave.servedByNeed.reception).toBe(6);
    expect(complete.normalWave.servedByNeed.food).toBe(6);
    expect(complete.normalWave.servedByNeed.drinks).toBe(6);
    expect(complete.normalWave.servedByNeed.relax).toBe(3);
  });

  it('unlocks Bungalows after Wave 6 and expands the next wave to five needs', () => {
    let state = completeThrough(createInitialBootstrapState('bungalows'), 3);
    state = applyBootstrapCommand(state, { type: 'PURCHASE_AREA', areaId: 'pool' });
    state = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
    state = completeThrough(state, 6);
    const view = prototypeAreaUnlockView(state, 'bungalows');
    expect(view.status).toBe('available');
    state = applyBootstrapCommand(state, { type: 'PURCHASE_AREA', areaId: 'bungalows' });
    expect(state.purchasedAreas.bungalows).toBe(true);
    expect(state.normalWave.workerAssignments['worker-3']).toBe('oceanView');
    state = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(state.currentWaveNumber).toBe(7);
    expect(state.normalWave.activeNeedIds).toEqual(['reception', 'food', 'drinks', 'relax', 'oceanView']);
    expect(state.normalWave.debutNeedIds).toEqual(['oceanView']);
    expect(state.normalWave.demandTargetByNeed.oceanView).toBe(3);
  });

  it('migrates the sealed three-service shape without activating locked areas', () => {
    const current = createInitialBootstrapState('migration');
    const legacy: any = JSON.parse(JSON.stringify(current));
    delete legacy.purchasedAreas;
    for (const key of ['relax', 'oceanView']) {
      delete legacy.normalWave.tuning.baseServiceCapacity[key];
      delete legacy.normalWave.queueByNeed[key];
      delete legacy.normalWave.activeByNeed[key];
      delete legacy.normalWave.servedByNeed[key];
      delete legacy.normalWave.peakQueueByNeed[key];
      delete legacy.normalWave.accumulatedWaitByNeed[key];
      delete legacy.normalWave.staffingWaitByNeed[key];
      delete legacy.normalWave.capacityWaitByNeed[key];
      delete legacy.normalWave.workerSlotsByNeed[key];
      delete legacy.normalWave.buildingLevelsByNeed[key];
      delete legacy.normalWave.demandTargetByNeed[key];
      delete legacy.normalWave.releasedByNeed[key];
    }
    const migrated = normalizePersistedState(legacy);
    expect(migrated.purchasedAreas).toEqual({ pool: false, bungalows: false });
    expect(migrated.normalWave.activeNeedIds).toEqual(['reception', 'food', 'drinks']);
    expect(migrated.normalWave.queueByNeed.relax).toBe(0);
    expect(migrated.normalWave.queueByNeed.oceanView).toBe(0);
  });
});

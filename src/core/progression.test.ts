import { describe, expect, it } from 'vitest';

import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';
import {
  NORMAL_SERVICE_CATALOG,
  NORMAL_WAVE_PROOF_WORKER_ID,
  applyBootstrapCommand,
  createInitialBootstrapState,
  normalWaveForecast,
  type BootstrapState
} from './state';

function completeWave(initial: BootstrapState): BootstrapState {
  let state = applyBootstrapCommand(initial, { type: 'START_WAVE' });
  for (let i = 0; i < 64 && state.normalWave.phase !== 'complete'; i += 1) {
    state = applyBootstrapCommand(state, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
  }
  expect(state.normalWave.phase).toBe('complete');
  return state;
}

describe('Prototype progression spine', () => {
  it('exposes the canonical three starting services and Wave 1 of 8 forecast', () => {
    const state = createInitialBootstrapState('progression-start');
    const forecast = normalWaveForecast(state);

    expect(state.currentWaveNumber).toBe(1);
    expect(forecast.waveNumber).toBe(1);
    expect(forecast.totalWaves).toBe(8);
    expect(forecast.needs).toEqual(['reception', 'food', 'drinks']);
    expect(NORMAL_SERVICE_CATALOG).toEqual({
      reception: { buildingLabel: 'Reception', needLabel: 'Rooms' },
      food: { buildingLabel: 'Restaurant', needLabel: 'Food' },
      drinks: { buildingLabel: 'Beach Bar', needLabel: 'Drinks' }
    });
  });

  it('advances durable wave identity after completion and Continue', () => {
    const completed = completeWave(createInitialBootstrapState('progression-wave'));
    const next = applyBootstrapCommand(completed, { type: 'CONTINUE_TO_NEXT_WAVE' });

    expect(next.currentWaveNumber).toBe(2);
    expect(next.normalWave.phase).toBe('awaiting');
    expect(normalWaveForecast(next).waveNumber).toBe(2);
    expect(normalWaveForecast(next).needs).toEqual(['reception', 'food', 'drinks']);
  });

  it('preserves an in-progress legacy two-service wave without activating Drinks', () => {
    let current = createInitialBootstrapState('legacy-active-wave');
    current = applyBootstrapCommand(current, { type: 'REASSIGN_WORKER', workerId: NORMAL_WAVE_PROOF_WORKER_ID, to: 'food' });
    current = applyBootstrapCommand(current, { type: 'START_WAVE' });
    current = applyBootstrapCommand(current, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });

    const legacy: any = JSON.parse(JSON.stringify(current));
    delete legacy.currentWaveNumber;
    delete legacy.normalWave.activeNeedIds;
    for (const key of ['baseServiceCapacity']) delete legacy.normalWave.tuning[key].drinks;
    for (const key of ['queueByNeed','activeByNeed','servedByNeed','peakQueueByNeed','accumulatedWaitByNeed','staffingWaitByNeed','capacityWaitByNeed','workerSlotsByNeed','buildingLevelsByNeed']) delete legacy.normalWave[key].drinks;

    const migrated = normalizePersistedState(legacy);

    expect(migrated.normalWave.phase).toBe(current.normalWave.phase);
    expect(migrated.normalWave.releasedDemand).toBe(current.normalWave.releasedDemand);
    expect(migrated.normalWave.activeNeedIds).toEqual(['reception', 'food']);
    expect(migrated.normalWave.queueByNeed.reception).toBe(current.normalWave.queueByNeed.reception);
    expect(migrated.normalWave.queueByNeed.food).toBe(current.normalWave.queueByNeed.food);
    expect(migrated.normalWave.queueByNeed.drinks).toBe(0);
    expect(migrated.normalWave.activeByNeed.drinks).toBe(0);
    expect(migrated.normalWave.workerAssignments[NORMAL_WAVE_PROOF_WORKER_ID]).toBe('food');
  });
});

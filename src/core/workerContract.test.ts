import { describe, expect, it } from 'vitest';
import {
  applyBootstrapCommand,
  createInitialBootstrapState,
  normalWaveServiceCapacity
} from './state';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';

describe('Prototype Worker contract', () => {
  it('starts three services with exactly two assigned Workers', () => {
    const state = createInitialBootstrapState('worker-roster');
    expect(state.normalWave.workerAssignments).toEqual({ 'worker-1': 'reception', 'worker-0': 'drinks' });
    expect(Object.keys(state.normalWave.workerAssignments)).toHaveLength(2);
  });

  it('reassigns during an active wave and changes service throughput immediately', () => {
    let state = createInitialBootstrapState('worker-live');
    state = applyBootstrapCommand(state, { type: 'START_WAVE' });
    expect(state.normalWave.phase).toBe('incoming');
    expect(normalWaveServiceCapacity(state, 'reception')).toBe(3);
    expect(normalWaveServiceCapacity(state, 'food')).toBe(3);

    state = applyBootstrapCommand(state, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'food' });

    expect(state.normalWave.workerAssignments['worker-1']).toBe('food');
    expect(normalWaveServiceCapacity(state, 'reception')).toBe(3);
    expect(normalWaveServiceCapacity(state, 'food')).toBe(3);
    expect(state.normalWave.reassignments.at(-1)).toMatchObject({ workerId: 'worker-1', from: 'reception', to: 'food', fromSpeedBefore: 1, fromSpeedAfter: 0.33, toSpeedBefore: 0.33, toSpeedAfter: 1 });
  });

  it('repairs a persisted one-Worker three-service save without resetting campaign state', () => {
    const current = createInitialBootstrapState('worker-migration');
    const legacy: any = JSON.parse(JSON.stringify(current));
    delete legacy.normalWave.workerAssignments['worker-0'];
    legacy.coins = 47;
    legacy.simulationTick = 9;

    const normalized = normalizePersistedState(legacy);

    expect(normalized.coins).toBe(47);
    expect(normalized.simulationTick).toBe(9);
    expect(Object.keys(normalized.normalWave.workerAssignments)).toHaveLength(2);
    expect(normalized.normalWave.workerAssignments['worker-0']).toBe('drinks');
  });
});

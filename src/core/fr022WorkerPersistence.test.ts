import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, type BootstrapState } from './state';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';

function completed(state: BootstrapState): BootstrapState {
  let current = applyBootstrapCommand(state, { type: 'START_WAVE' });
  for (let i = 0; i < 900 && current.normalWave.phase !== 'complete'; i++)
    current = applyBootstrapCommand(current, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
  expect(current.normalWave.phase).toBe('complete');
  return current;
}

function through(state: BootstrapState, target: number): BootstrapState {
  let current = state;
  while (current.currentWaveNumber <= target) {
    current = completed(current);
    if (current.currentWaveNumber === target) return current;
    current = applyBootstrapCommand(current, { type: 'CONTINUE_TO_NEXT_WAVE' });
  }
  throw new Error('FR022_TARGET_WAVE_NOT_REACHED');
}

describe('FR-022 Worker persistence and bundled building assignments', () => {
  it('retains a customized Worker assignment across consecutive normal waves', () => {
    let state = createInitialBootstrapState('fr022-existing-worker');
    state = applyBootstrapCommand(state, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'food' });
    const chosen = { ...state.normalWave.workerAssignments };
    for (let wave = 1; wave <= 3; wave++) {
      expect(state.currentWaveNumber).toBe(wave);
      state = completed(state);
      expect(state.normalWave.workerAssignments).toEqual(chosen);
      if (wave < 3) {
        state = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
        expect(state.normalWave.phase).toBe('awaiting');
        expect(state.normalWave.workerAssignments).toEqual(chosen);
      }
    }
  });

  it('assigns each bundled Worker to its new building and retains all assignments across following waves', () => {
    let state = through(createInitialBootstrapState('fr022-area-worker'), 3);
    const beforePool = { ...state.normalWave.workerAssignments };
    state = applyBootstrapCommand(state, { type: 'PURCHASE_AREA', areaId: 'pool' });
    expect(state.purchasedAreas.pool).toBe(true);
    expect(state.normalWave.phase).toBe('complete');
    expect(state.normalWave.workerAssignments['worker-2']).toBe('relax');
    for (const [id, need] of Object.entries(beforePool))
      expect(state.normalWave.workerAssignments[id as keyof typeof state.normalWave.workerAssignments]).toBe(need);
    const poolRoster = { ...state.normalWave.workerAssignments };
    state = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(state.normalWave.activeNeedIds).toContain('relax');
    expect(state.normalWave.workerAssignments).toEqual(poolRoster);
    state = through(state, 6);
    expect(state.normalWave.workerAssignments).toEqual(poolRoster);
    state = applyBootstrapCommand(state, { type: 'PURCHASE_AREA', areaId: 'bungalows' });
    expect(state.purchasedAreas.bungalows).toBe(true);
    expect(state.normalWave.workerAssignments['worker-3']).toBe('oceanView');
    for (const [id, need] of Object.entries(poolRoster))
      expect(state.normalWave.workerAssignments[id as keyof typeof state.normalWave.workerAssignments]).toBe(need);
    const bungalowRoster = { ...state.normalWave.workerAssignments };
    state = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(state.normalWave.activeNeedIds).toContain('oceanView');
    expect(state.normalWave.workerAssignments).toEqual(bungalowRoster);
  });

  it('preserves customized assignments through building unlock and save normalization', () => {
    let state = createInitialBootstrapState('fr022-saved-customization');
    state = applyBootstrapCommand(state, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'food' });
    state = through(state, 3);
    state = applyBootstrapCommand(state, { type: 'PURCHASE_AREA', areaId: 'pool' });
    const original = { ...state.normalWave.workerAssignments };
    expect(original['worker-1']).toBe('food');
    expect(original['worker-2']).toBe('relax');
    const loaded = normalizePersistedState(JSON.parse(JSON.stringify(state)) as BootstrapState);
    expect(loaded.currentWaveNumber).toBe(state.currentWaveNumber);
    expect(loaded.coins).toBe(state.coins);
    expect(loaded.normalWave.workerAssignments).toEqual(original);
    const next = applyBootstrapCommand(loaded, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(next.normalWave.workerAssignments).toEqual(original);
  });
});

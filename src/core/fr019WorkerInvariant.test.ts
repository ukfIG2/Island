import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, type BootstrapState } from './state';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';

function completed(state: BootstrapState): BootstrapState {
  let next = applyBootstrapCommand(state, { type: 'START_WAVE' });
  for (let i = 0; i < 900 && next.normalWave.phase !== 'complete'; i += 1)
    next = applyBootstrapCommand(next, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
  expect(next.normalWave.phase).toBe('complete');
  return next;
}

function through(state: BootstrapState, target: number): BootstrapState {
  let next = state;
  while (next.currentWaveNumber <= target) {
    next = completed(next);
    if (next.currentWaveNumber === target) return next;
    next = applyBootstrapCommand(next, { type: 'CONTINUE_TO_NEXT_WAVE' });
  }
  throw new Error('TARGET_WAVE_NOT_REACHED');
}

function assertRoster(state: BootstrapState, buildings: number) {
  const wave = state.normalWave;
  const entries = Object.entries(wave.workerAssignments);
  expect(entries).toHaveLength(buildings - 1);
  expect(new Set(entries.map(([, need]) => need)).size).toBe(buildings - 1);
  const validNeeds = new Set(['reception', 'food', 'drinks', ...(state.purchasedAreas.pool ? ['relax'] : []), ...(state.purchasedAreas.bungalows ? ['oceanView'] : [])]);
  for (const [, need] of entries) {
    expect(need).toBeDefined();
    expect(validNeeds.has(need as string)).toBe(true);
  }
  for (const need of ['reception','food','drinks','relax','oceanView'] as const)
    expect(wave.workerSlotsByNeed[need]).toBe(1);
}

describe('FR-019 exact Worker roster and no bench', () => {
  it('maintains N-1 assigned anonymous Workers across purchase, completed-wave transition and next wave', () => {
    let state = createInitialBootstrapState('fr019-progression');
    assertRoster(state, 3);
    state = through(state, 3);
    assertRoster(state, 3);
    state = applyBootstrapCommand(state, { type: 'PURCHASE_AREA', areaId: 'pool' });
    assertRoster(state, 4);
    expect(state.normalWave.phase).toBe('complete');
    state = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
    assertRoster(state, 4);
    state = through(state, 6);
    state = applyBootstrapCommand(state, { type: 'PURCHASE_AREA', areaId: 'bungalows' });
    assertRoster(state, 5);
    state = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
    assertRoster(state, 5);
  });

  it('rejects under-staffing in a command instead of accepting a one-Worker three-building state', () => {
    const state = createInitialBootstrapState('fr019-shortage');
    const invalid = { ...state, normalWave: { ...state.normalWave, workerAssignments: { 'worker-1': 'reception' as const } } };
    expect(() => applyBootstrapCommand(invalid, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'food' })).toThrow('NORMAL_WAVE_WORKER_SCARCITY_INVALID');
  });

  it('rejects unassigned roster entries rather than counting undefined as a Worker', () => {
    const state = createInitialBootstrapState('fr019-bench');
    const invalid = { ...state, normalWave: { ...state.normalWave, workerAssignments: { 'worker-1': 'reception' as const, 'worker-0': undefined } } };
    expect(() => applyBootstrapCommand(invalid, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'food' })).toThrow('NORMAL_WAVE_WORKER_UNASSIGNED');
  });

  it('repairs missing area Workers in persisted four- and five-building states without resetting campaign', () => {
    let pool = through(createInitialBootstrapState('fr019-pool-save'), 3);
    pool = applyBootstrapCommand(pool, { type: 'PURCHASE_AREA', areaId: 'pool' });
    const poolLegacy = JSON.parse(JSON.stringify(pool));
    delete poolLegacy.normalWave.workerAssignments['worker-2'];
    const poolFixed = normalizePersistedState(poolLegacy);
    expect(poolFixed.currentWaveNumber).toBe(3);
    expect(poolFixed.normalWave.phase).toBe('complete');
    expect(poolFixed.coins).toBe(pool.coins);
    expect(poolFixed.normalWave.workerAssignments['worker-2']).toBe('relax');
    assertRoster(poolFixed, 4);
    let bungalow = applyBootstrapCommand(pool, { type: 'CONTINUE_TO_NEXT_WAVE' });
    bungalow = through(bungalow, 6);
    bungalow = applyBootstrapCommand(bungalow, { type: 'PURCHASE_AREA', areaId: 'bungalows' });
    const bungalowLegacy = JSON.parse(JSON.stringify(bungalow));
    delete bungalowLegacy.normalWave.workerAssignments['worker-3'];
    const bungalowFixed = normalizePersistedState(bungalowLegacy);
    expect(bungalowFixed.currentWaveNumber).toBe(6);
    expect(bungalowFixed.normalWave.phase).toBe('complete');
    expect(bungalowFixed.coins).toBe(bungalow.coins);
    expect(bungalowFixed.normalWave.workerAssignments['worker-3']).toBe('oceanView');
    assertRoster(bungalowFixed, 5);
  });

  it('removes an undefined phantom bench entry while preserving valid assignments and state identity', () => {
    const valid = createInitialBootstrapState('fr019-phantom');
    expect(normalizePersistedState(valid)).toBe(valid);
    const malformed = { ...valid, normalWave: { ...valid.normalWave, workerAssignments: { ...valid.normalWave.workerAssignments, 'worker-2': undefined } } };
    const fixed = normalizePersistedState(malformed);
    expect(fixed.normalWave.workerAssignments).toEqual(valid.normalWave.workerAssignments);
    expect(fixed.coins).toBe(valid.coins);
    assertRoster(fixed, 3);
  });
});

import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, type BootstrapState } from './state';

function moveAndVerify(state: BootstrapState): BootstrapState {
  const prior = state;
  const previousAssignments = Object.entries(prior.normalWave.workerAssignments);
  expect(prior.normalWave.workerAssignments['worker-1']).toBe('reception');
  expect(previousAssignments.some(([, need]) => need === 'food')).toBe(false);
  const moved = applyBootstrapCommand(prior, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'food' });
  expect(moved.normalWave.workerAssignments['worker-1']).toBe('food');
  expect(moved.normalWave.phase).toBe(prior.normalWave.phase);
  expect(moved.simulationTick).toBe(prior.simulationTick);
  expect(moved.elapsedSimulationMs).toBe(prior.elapsedSimulationMs);
  expect(moved.coins).toBe(prior.coins);
  expect(moved.resortValue).toBe(prior.resortValue);
  expect(moved.energy).toBe(prior.energy);
  expect(moved.normalWave.releasedDemand).toBe(prior.normalWave.releasedDemand);
  expect(moved.normalWave.servedByNeed).toEqual(prior.normalWave.servedByNeed);
  expect(moved.normalWave.queueByNeed).toEqual(prior.normalWave.queueByNeed);
  const entries = Object.entries(moved.normalWave.workerAssignments);
  expect(entries).toHaveLength(previousAssignments.length);
  expect(entries.every(([, need]) => need !== undefined)).toBe(true);
  expect(new Set(entries.map(([, need]) => need)).size).toBe(entries.length);
  expect(moved.normalWave.reassignments).toHaveLength(prior.normalWave.reassignments.length + 1);
  expect(moved.normalWave.reassignments.at(-1)).toMatchObject({ workerId: 'worker-1', from: 'reception', to: 'food', simulationTick: prior.simulationTick, fromSpeedBefore: 1, fromSpeedAfter: 0.33, toSpeedBefore: 0.33, toSpeedAfter: 1 });
  return moved;
}

function advanceUntil(state: BootstrapState, phase: 'incoming' | 'draining'): BootstrapState {
  let current = applyBootstrapCommand(state, { type: 'START_WAVE' });
  for (let step = 0; step < 900 && current.normalWave.phase !== phase && current.normalWave.phase !== 'complete'; step++)
    current = applyBootstrapCommand(current, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
  expect(current.normalWave.phase).toBe(phase);
  return current;
}

describe('FR-020 immediate free and confirmation-free Worker reassignment', () => {
  it('moves Workers before starting a wave with zero tick, time or resource cost', () => {
    const initial = createInitialBootstrapState('fr020-awaiting');
    expect(initial.normalWave.phase).toBe('awaiting');
    const moved = moveAndVerify(initial);
    expect(moved.normalWave.phase).toBe('awaiting');
    const noOp = applyBootstrapCommand(moved, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'food' });
    expect(noOp).toBe(moved);
  });

  it('moves Workers while guests are incoming without delay or currency cost', () => {
    moveAndVerify(advanceUntil(createInitialBootstrapState('fr020-incoming'), 'incoming'));
  });

  it('moves Workers while the wave is draining without delay or currency cost', () => {
    moveAndVerify(advanceUntil(createInitialBootstrapState('fr020-draining'), 'draining'));
  });

  it('rejects inactive and occupied destinations instead of creating an illicit Worker bench', () => {
    const state = createInitialBootstrapState('fr020-invalid-target');
    expect(() => applyBootstrapCommand(state, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'relax' })).toThrow('NORMAL_WAVE_TARGET_INACTIVE');
    expect(() => applyBootstrapCommand(state, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'drinks' })).toThrow('NORMAL_WAVE_SLOT_OCCUPIED');
  });
});

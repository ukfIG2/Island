import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand as command, createInitialBootstrapState, PROTOTYPE_SUDDEN_RUSH_PROOF_TUNING, type BootstrapState } from './state';

function tick(s: BootstrapState): BootstrapState { return command(s, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 }); }
function finish(s: BootstrapState): BootstrapState {
  if (s.normalWave.phase === 'awaiting') s = command(s, { type: 'START_WAVE' });
  for (let i = 0; i < 900 && s.normalWave.phase !== 'complete'; i++) s = tick(s);
  expect(s.normalWave.phase).toBe('complete');
  return s;
}
function secondWave(id: string): BootstrapState {
  return command(finish(createInitialBootstrapState(id)), { type: 'CONTINUE_TO_NEXT_WAVE' });
}
describe('FR-035 Sudden Rush staffed-target and zero-Energy resolution', () => {
  it('increases unexpected demand only at the unstaffed building and is solvable by reassignment without Energy', () => {
    let state = secondWave('fr035-unassigned');
    const originalDemand = { ...state.normalWave.demandTargetByNeed };
    state = { ...state, energy: 0 };
    expect(state.normalWave.workerAssignments['worker-1']).toBe('reception');
    expect(Object.values(state.normalWave.workerAssignments)).not.toContain('food');
    state = command(state, { type: 'START_WAVE' });
    for (let i = 0; i < 45; i++) state = tick(state);
    expect(state.normalWave.suddenRush.triggered).toBe(true);
    expect(state.normalWave.suddenRush.targetNeed).toBe('food');
    expect(state.normalWave.phase).toBe('incoming');
    expect(state.normalWave.demandTargetByNeed.food - originalDemand.food).toBe(PROTOTYPE_SUDDEN_RUSH_PROOF_TUNING.extraDemand);
    expect(state.energy).toBe(0);
    state = command(state, { type: 'REASSIGN_WORKER', workerId: 'worker-1', to: 'food' });
    expect(state.normalWave.workerAssignments['worker-1']).toBe('food');
    expect(state.energy).toBe(0);
    state = finish(state);
    expect(state.normalWave.servedByNeed.food).toBe(state.normalWave.demandTargetByNeed.food);
    expect(state.normalWave.queueByNeed.food).toBe(0);
    expect(state.normalWave.result).not.toBeNull();
    expect(state.normalWave.energyBoostedNeedsThisWave).toEqual([]);
    expect(state.energy).toBe(1);
  });
  it('never targets a staffed building if the player has preemptively staffed every active building', () => {
    let state = secondWave('fr035-fully-staffed');
    state = { ...state, coins: 10000 };
    state = command(state, { type: 'UPGRADE_BUILDING', need: 'food' });
    state = command(state, { type: 'HIRE_WORKER', to: 'food' });
    for (const need of state.normalWave.activeNeedIds) expect(Object.values(state.normalWave.workerAssignments)).toContain(need);
    const baseline = { ...state.normalWave.demandTargetByNeed };
    state = command(state, { type: 'START_WAVE' });
    for (let i = 0; i < 46; i++) state = tick(state);
    expect(state.normalWave.suddenRush.triggered).toBe(false);
    expect(state.normalWave.suddenRush.targetNeed).toBeUndefined();
    expect(state.normalWave.demandTargetByNeed).toEqual(baseline);
    state = finish(state);
    expect(state.normalWave.result).not.toBeNull();
  });
});

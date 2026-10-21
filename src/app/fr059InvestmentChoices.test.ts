/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import appSource from './App.tsx?raw';
import { applyBootstrapCommand, createInitialBootstrapState, MVP_MANAGER_PROOF_TUNING, MVP_WORKER_PROOF_TUNING, normalWaveCanHireWorker, normalWaveUpgradeQuote, type BootstrapState } from '../core/state';

const need = 'reception' as const;
function afterFirstUpgrade(seed: string): BootstrapState {
  let state = applyBootstrapCommand(createInitialBootstrapState(seed, undefined, 'mvp'), { type: 'START_WAVE' });
  for (let i = 0; i < 800 && state.normalWave.phase !== 'complete'; i++)
    state = applyBootstrapCommand(state, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
  expect(state.normalWave.phase).toBe('complete');
  state = { ...state, coins: 1000, materials: 1000 };
  expect(normalWaveUpgradeQuote(state, need)).not.toBeNull();
  return applyBootstrapCommand(state, { type: 'UPGRADE_BUILDING', need });
}
const assigned = (state: BootstrapState) => Object.values(state.normalWave.workerAssignments).filter(target => target === need).length;

describe('FR-059 three independent MVP investment alternatives', () => {
  it('wires three distinct paid Core commands in the same selected-building investment surface', () => {
    const app = appSource;
    const start = app.indexOf('aria-label="Selected building actions"');
    const end = app.indexOf('</aside>', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const panel = app.slice(start, end);
    expect(panel).toContain('Optional building investment');
    expect(panel).toContain("type: 'UPGRADE_BUILDING'");
    expect(panel).toContain('Upgrade - {upgradeQuote.coinCost} Coins');
    expect(panel).toContain("type: 'HIRE_WORKER'");
    expect(panel).toContain('Hire Worker');
    expect(panel).toContain('normalWaveCanHireWorker(snapshot, selectedNeed)');
    expect(panel).toContain("type: 'HIRE_MANAGER'");
    expect(panel).toContain('Hire Manager');
    expect(panel).toContain('MVP_MANAGER_PROOF_TUNING.hireCostCoins');
  });
  it('offers all three choices on one funded, completed MVP wave and applies distinguishable effects', () => {
    const state = afterFirstUpgrade('fr059-funded');
    expect(state.progressionStage).toBe('mvp');
    expect(normalWaveCanHireWorker(state, need)).toBe(true);
    expect(state.normalWave.hiredManagers[need]).not.toBe(true);
    const quote = normalWaveUpgradeQuote(state, need);
    expect(quote).not.toBeNull();
    const worker = applyBootstrapCommand(state, { type: 'HIRE_WORKER', to: need });
    expect(worker.coins).toBe(state.coins - MVP_WORKER_PROOF_TUNING.hireCostCoins);
    expect(assigned(worker)).toBe(assigned(state) + 1);
    expect(worker.normalWave.hiredManagers[need]).not.toBe(true);
    expect(worker.normalWave.buildingLevelsByNeed[need]).toBe(state.normalWave.buildingLevelsByNeed[need]);
    expect(worker.resortValue).toBe(state.resortValue);
    const manager = applyBootstrapCommand(state, { type: 'HIRE_MANAGER', need });
    expect(manager.coins).toBe(state.coins - MVP_MANAGER_PROOF_TUNING.hireCostCoins);
    expect(manager.normalWave.hiredManagers[need]).toBe(true);
    expect(assigned(manager)).toBe(assigned(state));
    expect(manager.normalWave.buildingLevelsByNeed[need]).toBe(state.normalWave.buildingLevelsByNeed[need]);
    const upgraded = applyBootstrapCommand(state, { type: 'UPGRADE_BUILDING', need });
    expect(upgraded.coins).toBe(state.coins - quote!.coinCost);
    expect(upgraded.resortValue).toBe(state.resortValue + quote!.resortValueGain);
    expect(upgraded.normalWave.buildingLevelsByNeed[need]).toBe(quote!.toLevel);
    expect(assigned(upgraded)).toBe(assigned(state));
    expect(upgraded.normalWave.hiredManagers[need]).not.toBe(true);
  });
  it('gates unaffordable spending, duplicate manager hire and during-wave hiring', () => {
    const state = afterFirstUpgrade('fr059-guards');
    const poor = { ...state, coins: 0 };
    expect(normalWaveCanHireWorker(poor, need)).toBe(false);
    expect(() => applyBootstrapCommand(poor, { type: 'HIRE_WORKER', to: need })).toThrow('NORMAL_WAVE_HIRE_COINS_INSUFFICIENT');
    expect(() => applyBootstrapCommand(poor, { type: 'HIRE_MANAGER', need })).toThrow('MVP_MANAGER_COINS_INSUFFICIENT');
    expect(applyBootstrapCommand(poor, { type: 'UPGRADE_BUILDING', need })).toBe(poor);
    const hiredManager = applyBootstrapCommand(state, { type: 'HIRE_MANAGER', need });
    expect(() => applyBootstrapCommand(hiredManager, { type: 'HIRE_MANAGER', need })).toThrow('MVP_MANAGER_ALREADY_HIRED');
    const next = applyBootstrapCommand(state, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(next.normalWave.phase).toBe('awaiting');
    const active = applyBootstrapCommand(next, { type: 'START_WAVE' });
    expect(normalWaveCanHireWorker(active, need)).toBe(false);
    expect(() => applyBootstrapCommand(active, { type: 'HIRE_WORKER', to: need })).toThrow('NORMAL_WAVE_HIRE_PHASE_INVALID');
    expect(() => applyBootstrapCommand(active, { type: 'HIRE_MANAGER', need })).toThrow('MVP_MANAGER_HIRE_PHASE_INVALID');
    expect(normalWaveUpgradeQuote(active, need)).toBeNull();
  });
});

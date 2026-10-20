import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, normalWaveUpgradeQuote, type BootstrapState } from './state';

function postWave(stage: 'prototype' | 'mvp'): BootstrapState {
  const first = createInitialBootstrapState(`fr030-${stage}`, undefined, stage);
  return { ...first, coins: 500, normalWave: { ...first.normalWave, phase: 'complete', result: { rating: 5 } as BootstrapState['normalWave']['result'] } };
}

describe('FR-030 permanent upgrade timing', () => {
  it.each(['prototype', 'mvp'] as const)('%s allows upgrades immediately after wave completion', stage => {
    const completed = postWave(stage);
    const quote = normalWaveUpgradeQuote(completed, 'reception');
    expect(quote).not.toBeNull();
    const changed = applyBootstrapCommand(completed, { type: 'UPGRADE_BUILDING', need: 'reception' });
    expect(changed).not.toBe(completed);
    expect(changed.normalWave.buildingLevelsByNeed.reception).toBe(quote!.toLevel);
    expect(changed.coins).toBe(completed.coins - quote!.coinCost);
    expect(changed.resortValue).toBe(completed.resortValue + quote!.resortValueGain);
  });

  it.each(['prototype', 'mvp'] as const)('%s allows purchases during next-wave awaiting without active simulation', stage => {
    const completed = postWave(stage);
    const next = applyBootstrapCommand(completed, { type: 'CONTINUE_TO_NEXT_WAVE' });
    expect(next.currentWaveNumber).toBe(2);
    expect(next.normalWave.phase).toBe('awaiting');
    expect(next.normalWave.result).toBeNull();
    const quote = normalWaveUpgradeQuote(next, 'reception');
    expect(quote?.toLevel).toBe(2);
    const upgraded = applyBootstrapCommand(next, { type: 'UPGRADE_BUILDING', need: 'reception' });
    expect(upgraded.normalWave.buildingLevelsByNeed.reception).toBe(2);
    expect(upgraded.coins).toBe(next.coins - quote!.coinCost);
    expect(upgraded.normalWave.phase).toBe('awaiting');
    const started = applyBootstrapCommand(upgraded, { type: 'START_WAVE' });
    expect(started.normalWave.phase).toBe('incoming');
    expect(started.normalWave.buildingLevelsByNeed.reception).toBe(2);
  });

  it.each(['prototype', 'mvp'] as const)('%s rejects upgrades before first wave and throughout active simulation', stage => {
    const first = createInitialBootstrapState(`fr030-block-${stage}`, undefined, stage);
    const ready = { ...first, coins: 500 };
    const afterWave = postWave(stage);
    const nextReady = applyBootstrapCommand(afterWave, { type: 'CONTINUE_TO_NEXT_WAVE' });
    const incoming = applyBootstrapCommand(nextReady, { type: 'START_WAVE' });
    const draining: BootstrapState = { ...incoming, normalWave: { ...incoming.normalWave, phase: 'draining' } };
    const staleActiveResult: BootstrapState = { ...incoming, normalWave: { ...incoming.normalWave, result: afterWave.normalWave.result } };
    for (const state of [ready, incoming, draining, staleActiveResult]) {
      expect(normalWaveUpgradeQuote(state, 'reception')).toBeNull();
      expect(applyBootstrapCommand(state, { type: 'UPGRADE_BUILDING', need: 'reception' })).toBe(state);
    }
    const incomplete: BootstrapState = { ...afterWave, normalWave: { ...afterWave.normalWave, result: null } };
    expect(normalWaveUpgradeQuote(incomplete, 'reception')).toBeNull();
    expect(applyBootstrapCommand(incomplete, { type: 'UPGRADE_BUILDING', need: 'reception' })).toBe(incomplete);
  });
});

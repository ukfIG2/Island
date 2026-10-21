import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState, type NormalWaveNeedId } from '../core/state';
import { WaveNeedsPanel } from './WaveNeedsPanel';

const base = createInitialBootstrapState('fr055-wave-panel').normalWave;
const onSelectNeed = (_need: NormalWaveNeedId) => {};
const show = (phase: typeof base.phase, needs: readonly NormalWaveNeedId[]) => renderToStaticMarkup(
  createElement(WaveNeedsPanel, {
    wave: { ...base, phase, activeNeedIds: needs },
    waveNumber: 4,
    selectedNeed: 'reception',
    onSelectNeed,
  })
);

describe('FR-055 Wave Needs Panel', () => {
  it('opens automatically when a normal wave starts, and hides when awaiting', () => {
    expect(show('awaiting', ['reception', 'food', 'drinks'])).toBe('');
    const started = applyBootstrapCommand(createInitialBootstrapState('fr055-start'), { type: 'START_WAVE' });
    expect(['incoming', 'draining']).toContain(started.normalWave.phase);
    const html = show(started.normalWave.phase, started.normalWave.activeNeedIds);
    expect(html).toContain('aria-label="Wave Needs Panel"');
    expect((html.match(/data-wave-need=/g) || []).length).toBe(3);
    expect(show('complete', ['reception', 'food', 'drinks'])).toBe('');
  });
  it('projects exactly three, four and five active Core needs without truncation', () => {
    const ids: NormalWaveNeedId[] = ['reception', 'food', 'drinks', 'relax', 'oceanView'];
    for (const count of [3, 4, 5]) {
      const html = show('incoming', ids.slice(0, count));
      expect((html.match(/data-wave-need=/g) || []).length).toBe(count);
      expect(html).toContain(count + ' active needs');
      for (const need of ids.slice(0, count)) expect(html).toContain('data-wave-need="' + need + '"');
      for (const need of ids.slice(count)) expect(html).not.toContain('data-wave-need="' + need + '"');
    }
  });
  it('shows Core-owned pressure and selected service in the live panel', () => {
    const html = renderToStaticMarkup(createElement(WaveNeedsPanel, {
      wave: { ...base, phase: 'draining', activeNeedIds: ['reception', 'food', 'drinks'], queueByNeed: { ...base.queueByNeed, food: 7 }, activeByNeed: { ...base.activeByNeed, food: 2 } },
      waveNumber: 2, selectedNeed: 'food', onSelectNeed,
    }));
    expect(html).toContain('Waiting 7');
    expect(html).toContain('Serving 2');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Wave 2');
  });
  it('follows Core-purchased Pool and Bungalows into four and five live wave needs', () => {
    const initial = createInitialBootstrapState('fr055-area-chain');
    const completed = (state: typeof initial, number: typeof initial.currentWaveNumber) => ({ ...state, coins: 100000, currentWaveNumber: number, normalWave: { ...state.normalWave, phase: 'complete' as const } });
    const wave1 = applyBootstrapCommand(initial, { type: 'START_WAVE' });
    expect(wave1.normalWave.activeNeedIds).toHaveLength(3);
    const pool = applyBootstrapCommand(completed(wave1, 3), { type: 'PURCHASE_AREA', areaId: 'pool' });
    expect(pool.purchasedAreas.pool).toBe(true);
    const wave4 = applyBootstrapCommand(applyBootstrapCommand(pool, { type: 'CONTINUE_TO_NEXT_WAVE' }), { type: 'START_WAVE' });
    expect(wave4.currentWaveNumber).toBe(4);
    expect(wave4.normalWave.activeNeedIds).toEqual(['reception', 'food', 'drinks', 'relax']);
    const html4 = renderToStaticMarkup(createElement(WaveNeedsPanel, { wave: wave4.normalWave, waveNumber: 4, selectedNeed: 'relax', onSelectNeed }));
    expect((html4.match(/data-wave-need=/g) || []).length).toBe(4);
    expect(html4).toContain('data-wave-need="relax"');
    const bungalows = applyBootstrapCommand(completed(wave4, 6), { type: 'PURCHASE_AREA', areaId: 'bungalows' });
    expect(bungalows.purchasedAreas.bungalows).toBe(true);
    const wave7 = applyBootstrapCommand(applyBootstrapCommand(bungalows, { type: 'CONTINUE_TO_NEXT_WAVE' }), { type: 'START_WAVE' });
    expect(wave7.currentWaveNumber).toBe(7);
    expect(wave7.normalWave.activeNeedIds).toEqual(['reception', 'food', 'drinks', 'relax', 'oceanView']);
    const html7 = renderToStaticMarkup(createElement(WaveNeedsPanel, { wave: wave7.normalWave, waveNumber: 7, selectedNeed: 'oceanView', onSelectNeed }));
    expect((html7.match(/data-wave-need=/g) || []).length).toBe(5);
    expect(html7).toContain('data-wave-need="oceanView"');
  });
});

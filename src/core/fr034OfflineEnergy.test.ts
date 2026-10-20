import { describe, expect, it, vi } from 'vitest';
import { applyBootstrapCommand, createInitialBootstrapState } from './state';
import { BootstrapCore } from './runtime';
import { SimulationClock } from '../runtime/SimulationClock';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';

describe('FR-034 offline duration never creates Energy', () => {
  for (const stage of ['prototype', 'mvp'] as const) {
    it(stage + ': restoring after long wall-clock absence preserves saved Energy exactly', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        const saved = { ...createInitialBootstrapState('fr034-saved-' + stage, undefined, stage), energy: 7 };
        const record = JSON.stringify(saved);
        vi.setSystemTime(new Date('2026-03-01T00:00:00Z'));
        const restored = normalizePersistedState(JSON.parse(record));
        expect(restored.energy).toBe(7);
        expect(restored.elapsedSimulationMs).toBe(saved.elapsedSimulationMs);
        expect(restored.simulationTick).toBe(saved.simulationTick);
        const comeback = applyBootstrapCommand(restored, { type: 'CLAIM_COMEBACK_REWARD' });
        expect(comeback.energy).toBe(7);
        expect(comeback.elapsedSimulationMs).toBe(saved.elapsedSimulationMs);
      } finally {
        vi.useRealTimers();
      }
    });
    it(stage + ': paused simulation ignores weeks offline and resumes one fixed tick', () => {
      vi.useFakeTimers();
      const core = new BootstrapCore(applyBootstrapCommand(createInitialBootstrapState('fr034-clock-' + stage, undefined, stage), { type: 'START_WAVE' }));
      const clock = new SimulationClock(core, 1000);
      try {
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        clock.start();
        vi.advanceTimersByTime(1000);
        clock.stop();
        const paused = core.getSnapshot();
        expect(paused.energy).toBe(0);
        vi.advanceTimersByTime(30 * 24 * 60 * 60 * 1000);
        expect(core.getSnapshot()).toBe(paused);
        clock.start();
        expect(core.getSnapshot()).toBe(paused);
        vi.advanceTimersByTime(1000);
        const resumed = core.getSnapshot();
        expect(resumed.simulationTick).toBe(paused.simulationTick + 1);
        expect(resumed.elapsedSimulationMs).toBe(paused.elapsedSimulationMs + 1000);
        expect(resumed.energy).toBe(paused.energy);
      } finally {
        clock.stop();
        vi.useRealTimers();
      }
    });
  }
});

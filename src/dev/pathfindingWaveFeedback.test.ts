import { describe, it, expect } from 'vitest';
import { reconciledWaveMessage } from './pathfindingWaveFeedback';

describe('pathfinding stand wave lifecycle feedback', () => {
  const stale = 'Волна отклонена: Error: PMO_TEST_CURRENT_WAVE_STILL_SPAWNING';
  it('clears stale rejection after all 12 arrived and the queue drained', () => {
    expect(reconciledWaveMessage(stale,{queued:0,total:12,arrived:12,blocked:0}))
      .toContain('Волна завершена: 12/12');
  });
  it('does not call a partially spawned wave complete', () => {
    expect(reconciledWaveMessage(stale,{queued:11,total:1,arrived:0,blocked:0})).toBeNull();
  });
  it('shows that all guests have been emitted while some are still moving', () => {
    expect(reconciledWaveMessage(stale,{queued:0,total:4,arrived:1,blocked:0}))
      .toContain('3 в пути');
  });
  it('does not report success with blocked guests', () => {
    expect(reconciledWaveMessage(stale,{queued:0,total:12,arrived:11,blocked:1})).toBeNull();
  });
  it('does not overwrite unrelated errors or layout information', () => {
    expect(reconciledWaveMessage('Перестановка отклонена',{queued:0,total:12,arrived:12,blocked:0})).toBeNull();
  });
});

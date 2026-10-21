import type { BootstrapState, NormalWaveNeedId } from '../core/state';
import { NORMAL_SERVICE_CATALOG } from '../core/state';

type Props = {
  wave: BootstrapState['normalWave'];
  waveNumber: number;
  selectedNeed: NormalWaveNeedId;
  onSelectNeed: (need: NormalWaveNeedId) => void;
};

export function WaveNeedsPanel({ wave, waveNumber, selectedNeed, onSelectNeed }: Props) {
  if (wave.phase !== 'incoming' && wave.phase !== 'draining') return null;
  return (
    <aside className="wave-needs-panel" aria-label="Wave Needs Panel">
      <header className="wave-needs-panel__header">
        <h2>Wave Needs</h2>
        <span>Wave {waveNumber} · {wave.activeNeedIds.length} active needs</span>
      </header>
      <div className="wave-needs-panel__grid">
        {wave.activeNeedIds.map((need) => (
          <button type="button" key={need} data-wave-need={need}
            className="wave-needs-panel__need"
            aria-pressed={selectedNeed === need}
            onClick={() => onSelectNeed(need)}>
            <strong>{NORMAL_SERVICE_CATALOG[need].needLabel}</strong>
            <span>Waiting {wave.queueByNeed[need]} · Serving {wave.activeByNeed[need]}</span>
            <small>Demand {wave.demandTargetByNeed[need]}</small>
          </button>
        ))}
      </div>
    </aside>
  );
}

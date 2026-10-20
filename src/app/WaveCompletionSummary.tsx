import { NORMAL_SERVICE_CATALOG, type NormalWaveState } from '../core/state';

export function WaveCompletionSummary({ wave }: { readonly wave: NormalWaveState }) {
  const result = wave.result;
  if (wave.phase !== 'complete' || result === null) return null;
  const served = wave.activeNeedIds.reduce((sum, need) => sum + wave.servedByNeed[need], 0);
  const requested = wave.activeNeedIds.reduce((sum, need) => sum + wave.releasedByNeed[need], 0);
  const allServed = served === requested;
  return (
    <section className="wave-result-review" aria-label="Wave Complete review">
      <h2>Wave Complete · {result.rating}/5</h2>
      <p><strong>Satisfaction:</strong> {result.satisfaction.totalWaitingTime} unit-seconds of accumulated waiting.</p>
      <p><strong>What went well:</strong> {allServed ? `All ${served} service requests completed.` : `Completed ${served} of ${requested} service requests.`}</p>
      <p><strong>What to improve:</strong> {NORMAL_SERVICE_CATALOG[result.bottleneckNeed].buildingLabel} ({result.bottleneckCause}). {result.guidance}</p>
    </section>
  );
}

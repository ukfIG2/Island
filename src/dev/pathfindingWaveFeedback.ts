/** Presentation-only lifecycle feedback for the RRH dev wave controls.
 * Does not affect production navigation, PMO registry, or guest movement. */
export interface WaveUiCounters {
  readonly queued: number;
  readonly total: number;
  readonly arrived: number;
  readonly blocked: number;
}

/** A previous click may have reported 'still spawning' while the wave was
 * active. Reconcile that transient message with the ACTUAL current counters. */
export function reconciledWaveMessage(previous: string, counters: WaveUiCounters): string | null {
  if (!/^(Волна:|Волна выпущена:|Волна отклонена: Error: PMO_TEST_CURRENT_WAVE_STILL_SPAWNING|Выпуск волны ещё продолжается:)/.test(previous))
    return null;
  if (counters.queued > 0 || counters.total === 0 || counters.blocked > 0) return null;
  const underway = Math.max(0, counters.total - counters.arrived - counters.blocked);
  if (underway > 0)
    return `Волна выпущена: ${counters.total} гостей появились; ${underway} в пути, ${counters.arrived} прибыли.`;
  return `Волна завершена: ${counters.arrived}/${counters.total} гостей прибыли, блокировок нет. Можно создавать следующую волну.`;
}

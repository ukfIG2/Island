import { describe, expect, it } from 'vitest';

import { BootstrapCore } from './runtime';
import { createInitialBootstrapState } from './state';

describe('BootstrapCore lifecycle', () => {
  it('replaces the whole campaign state and notifies subscribers once', () => {
    const original = createInitialBootstrapState('old-resort');
    const fresh = createInitialBootstrapState('new-resort');
    const core = new BootstrapCore(original);
    let notifications = 0;

    core.subscribe(() => {
      notifications += 1;
    });

    expect(core.replaceState(fresh)).toBe(fresh);
    expect(core.getSnapshot()).toBe(fresh);
    expect(core.getSnapshot().currentWaveNumber).toBe(1);
    expect(core.getSnapshot().normalWave.phase).toBe('awaiting');
    expect(notifications).toBe(1);

    core.replaceState(fresh);
    expect(notifications).toBe(1);
  });
});

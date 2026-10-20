import { describe, expect, it } from 'vitest';
import { applyBootstrapCommand as dispatch, createInitialBootstrapState } from './state';
import { MVP_VIP_TYPES } from './vipLayer';
import { normalizePersistedState } from '../persistence/DexieBootstrapPersistence';
import type { BootstrapState } from './state';
describe('FR-037 optional VIP Preview acceptance controls', () => {
  it.each(MVP_VIP_TYPES)('Accept/Open Requests for %s opens requests without starting a stay or normal-wave pause', type => {
    const base = dispatch(createInitialBootstrapState('fr037-'+type, undefined, 'mvp'), { type: 'START_WAVE' });
    const preview = dispatch(base, { type: 'SHOW_VIP_PREVIEW', vipType: type });
    expect(preview.vipLayer.preview).toBe(type);
    expect(preview.normalWave).toEqual(base.normalWave);
    const accepted = dispatch(preview, { type: 'DECIDE_VIP_PREVIEW', decision: 'accept' });
    expect(accepted.vipLayer.preview).toBeNull();
    expect(accepted.vipLayer.accepted).toBe(type);
    expect(accepted.vipLayer.requestsOpen).toBe(true);
    expect(accepted.vipLayer.active).toBeNull();
    expect(accepted.coins).toBe(base.coins);
    expect(accepted.energy).toBe(base.energy);
    expect(accepted.resortValue).toBe(base.resortValue);
    const ticked = dispatch(accepted, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 });
    expect(ticked.normalWave).toEqual(dispatch(base, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 }).normalWave);
  });
  it.each(['maybeLater', 'declined'] as const)('%s dismisses preview without any punishment or normal-wave interruption', decision => {
    const base = dispatch(createInitialBootstrapState('fr037-'+decision, undefined, 'mvp'), { type: 'START_WAVE' });
    const preview = dispatch(base, { type: 'SHOW_VIP_PREVIEW', vipType: 'investor' });
    const dismissed = dispatch(preview, { type: 'DECIDE_VIP_PREVIEW', decision });
    expect(dismissed.vipLayer.preview).toBeNull();
    expect(dismissed.vipLayer.accepted).toBeNull();
    expect(dismissed.vipLayer.requestsOpen).toBe(false);
    expect(dismissed.vipLayer.lastPreviewDecision).toBe(decision);
    expect(dismissed.vipLayer.active).toBeNull();
    expect(dismissed.coins).toBe(base.coins);
    expect(dismissed.energy).toBe(base.energy);
    expect(dismissed.resortValue).toBe(base.resortValue);
    expect(dismissed.normalWave).toEqual(base.normalWave);
    expect(dispatch(dismissed, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 }).normalWave).toEqual(dispatch(base, { type: 'ADVANCE_SIMULATION', deltaMs: 1000 }).normalWave);
    expect(dispatch(dismissed, { type: 'SHOW_VIP_PREVIEW', vipType: 'investor' }).vipLayer.preview).toBe('investor');
  });
  it('guards preview decisions and prototype stage', () => {
    const mvp = createInitialBootstrapState('fr037-guard', undefined, 'mvp');
    expect(() => dispatch(mvp, { type: 'DECIDE_VIP_PREVIEW', decision: 'accept' })).toThrow('MVP_VIP_PREVIEW_REQUIRED');
    expect(() => dispatch(createInitialBootstrapState('fr037-prototype'), { type: 'SHOW_VIP_PREVIEW', vipType: 'investor' })).toThrow('MVP_VIP_STAGE_INVALID');
  });
  it('persists pending Preview and accepted Open Requests without starting a VIP stay', () => {
    const baseline = dispatch(createInitialBootstrapState('fr037-persist', undefined, 'mvp'), { type: 'START_WAVE' });
    const preview = dispatch(baseline, { type: 'SHOW_VIP_PREVIEW', vipType: 'travelBlogger' });
    const savedPreview = normalizePersistedState(JSON.parse(JSON.stringify(preview)) as BootstrapState);
    expect(savedPreview.vipLayer.preview).toBe('travelBlogger');
    expect(savedPreview.normalWave).toEqual(baseline.normalWave);
    const accepted = dispatch(savedPreview, { type: 'DECIDE_VIP_PREVIEW', decision: 'accept' });
    const savedAccepted = normalizePersistedState(JSON.parse(JSON.stringify(accepted)) as BootstrapState);
    expect(savedAccepted.vipLayer.accepted).toBe('travelBlogger');
    expect(savedAccepted.vipLayer.requestsOpen).toBe(true);
    expect(savedAccepted.vipLayer.active).toBeNull();
    expect(savedAccepted.normalWave).toEqual(baseline.normalWave);
  });
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { BootstrapCore } from '../core/runtime';
import { createInitialBootstrapState, type BootstrapState } from '../core/state';
import { MVP_VIP_TYPES, showMvpVipPreview, decideMvpVipPreview, beginMvpVipVisit, type MvpVipLayerState } from '../core/vipLayer';

vi.mock('../render/ResortWorld3D', () => ({ ResortWorld3D: () => null }));
const base = (stage: 'prototype' | 'mvp'): BootstrapState => createInitialBootstrapState('fr061-'+stage, undefined, stage);
const withLayer = (state: BootstrapState, vipLayer: MvpVipLayerState): BootstrapState => ({ ...state, vipLayer });
const html = (state: BootstrapState): string => renderToStaticMarkup(createElement(App, { core: new BootstrapCore(state), onNewResort: async () => {} }));
const opportunity = 'aria-label="VIP opportunity waiting"';

describe('FR-061 conditional VIP opportunity on Home/Island', () => {
  it('shows no VIP opportunity outside MVP or while MVP is idle; persistent management remains collapsed and reachable', () => {
    expect(html(base('prototype'))).not.toContain(opportunity);
    const idle = html(base('mvp'));
    expect(idle).not.toContain(opportunity);
    expect(idle).toContain('aria-label="VIP management"');
    expect(idle).toContain('<summary>VIP management</summary>');
    expect(idle).toContain('aria-label="VIP Spa building"');
    expect(idle).toContain('aria-label="Permanent premium resort crest"');
    expect(idle).not.toMatch(/<details[^>]* open(?:=|>)/);
  });
  it('renders only actionable waiting preview and accepted request phases, with original Core command actions', () => {
    const initial = base('mvp'), type = MVP_VIP_TYPES[0];
    const preview = showMvpVipPreview(initial.vipLayer, type);
    const pending = html(withLayer(initial, preview));
    expect(pending).toContain(opportunity);
    expect(pending).toContain('aria-label="VIP Preview"');
    expect(pending).toContain('Accept / Open Requests');
    expect(pending).not.toContain('aria-label="VIP Requests"');
    const accepted = decideMvpVipPreview(preview, 'accept');
    const requested = html(withLayer(initial, accepted));
    expect(requested).toContain(opportunity);
    expect(requested).toContain('aria-label="VIP Requests"');
    expect(requested).toContain('Begin VIP visit');
    expect(requested).not.toContain('aria-label="VIP Preview"');
  });
  it('removes the waiting panel on visit start, deferral, decline and completion without removing VIP management', () => {
    const initial = base('mvp'), type = MVP_VIP_TYPES[0], preview = showMvpVipPreview(initial.vipLayer, type);
    for (const decision of ['maybeLater', 'declined'] as const) {
      const markup = html(withLayer(initial, decideMvpVipPreview(preview, decision)));
      expect(markup).not.toContain(opportunity);
      expect(markup).toContain('aria-label="VIP management"');
    }
    const accepted = decideMvpVipPreview(preview, 'accept');
    const active = beginMvpVipVisit({ ...accepted, consumableReady: true }, type);
    expect(html(withLayer(initial, active))).not.toContain(opportunity);
    expect(html(withLayer(initial, active))).toContain('visiting');
    const complete: MvpVipLayerState = { ...active, active: null, completed: [type] };
    expect(html(withLayer(initial, complete))).not.toContain(opportunity);
    expect(html(withLayer(initial, complete))).toContain('Visits completed: 1');
  });
});

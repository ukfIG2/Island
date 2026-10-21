import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AreaUnlockMap } from './AreaUnlockMap';
import { BootstrapCore } from '../core/runtime';
import { ACCOMMODATION_EXPERIENCE_BY_NEED, NORMAL_SERVICE_CATALOG, createInitialBootstrapState, type BootstrapState } from '../core/state';
vi.mock('../render/ResortWorld3D', () => ({ ResortWorld3D: () => null }));
const state = (stage: 'prototype' | 'mvp' = 'prototype') => createInitialBootstrapState('fr062-' + stage, undefined, stage);
const map = (s: BootstrapState) => renderToStaticMarkup(createElement(AreaUnlockMap, { state: s, onSelectNeed: () => {}, onPurchase: () => {} }));
const app = (s: BootstrapState) => renderToStaticMarkup(createElement(App, { core: new BootstrapCore(s), onNewResort: async () => {} }));
const buildingNav = (s: BootstrapState) => app(s).match(/<nav[^>]*aria-label="Resort buildings"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
describe('FR-062 standard versus premium accommodation semantics', () => {
  it('retains distinct canonical Core services and explicitly classified experiences without an economic modifier', () => {
    expect(NORMAL_SERVICE_CATALOG.reception).toEqual({ buildingLabel: 'Reception', needLabel: 'Rooms' });
    expect(NORMAL_SERVICE_CATALOG.oceanView).toEqual({ buildingLabel: 'Bungalows', needLabel: 'Ocean View' });
    expect(ACCOMMODATION_EXPERIENCE_BY_NEED.reception.category).toBe('standard');
    expect(ACCOMMODATION_EXPERIENCE_BY_NEED.oceanView.category).toBe('premium');
    expect(ACCOMMODATION_EXPERIENCE_BY_NEED.reception.copy).toContain('Rooms');
    expect(ACCOMMODATION_EXPERIENCE_BY_NEED.oceanView.copy).toContain('Bungalows');
  });
  it('communicates premium Bungalows accommodation in locked and unlocked map states', () => {
    const original = state('mvp');
    expect(map(original)).toContain(ACCOMMODATION_EXPERIENCE_BY_NEED.oceanView.copy);
    expect(map(original)).toContain('New Ocean View service');
    const unlocked: BootstrapState = { ...original, purchasedAreas: { ...original.purchasedAreas, bungalows: true } };
    expect(map(unlocked)).toContain('data-area="bungalows" data-status="unlocked"');
    expect(map(unlocked)).toContain(ACCOMMODATION_EXPERIENCE_BY_NEED.oceanView.copy);
  });
  it('projects standard Reception consistently and premium Bungalows only once its separate area is owned', () => {
    const initial = state('mvp');
    const before = buildingNav(initial);
    expect(before).toContain(ACCOMMODATION_EXPERIENCE_BY_NEED.reception.copy);
    expect(before).not.toContain(ACCOMMODATION_EXPERIENCE_BY_NEED.oceanView.copy);
    const unlocked: BootstrapState = { ...initial, purchasedAreas: { ...initial.purchasedAreas, bungalows: true } };
    const after = buildingNav(unlocked);
    expect(after).toContain(ACCOMMODATION_EXPERIENCE_BY_NEED.reception.copy);
    expect(after).toContain(ACCOMMODATION_EXPERIENCE_BY_NEED.oceanView.copy);
    expect((after.match(/class="world-status__accommodation"/g) ?? []).length).toBe(2);
  });
});

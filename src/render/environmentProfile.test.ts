import { describe, expect, it } from 'vitest';
import { environmentProfileForWave } from './environmentProfile';

describe('resort environment profile', () => {
  it('provides clearly distinct campaign presentation states', () => {
    const day = environmentProfileForWave(1, 'awaiting');
    const sunset = environmentProfileForWave(3, 'awaiting');
    const rain = environmentProfileForWave(5, 'incoming');
    const evening = environmentProfileForWave(7, 'awaiting');
    expect([day.timeOfDay, day.weather]).toEqual(['day', 'clear']);
    expect([sunset.timeOfDay, sunset.weather]).toEqual(['sunset', 'clear']);
    expect([rain.timeOfDay, rain.weather]).toEqual(['day', 'tropical-rain']);
    expect([evening.timeOfDay, evening.weather]).toEqual(['evening', 'clear']);
    expect(new Set([day.sky, sunset.sky, rain.sky, evening.sky]).size).toBe(4);
  });

  it('can shift a completed clear daytime wave toward sunset without gameplay state', () => {
    expect(environmentProfileForWave(1, 'complete').timeOfDay).toBe('sunset');
    expect(environmentProfileForWave(1, 'complete').weather).toBe('clear');
  });
});

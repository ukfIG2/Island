import type { NormalWavePhase, PrototypeWaveNumber } from '../core/state';

export type ResortTimeOfDay = 'day' | 'sunset' | 'evening';
export type ResortWeather = 'clear' | 'overcast' | 'tropical-rain';

export interface EnvironmentProfile {
  readonly timeOfDay: ResortTimeOfDay;
  readonly weather: ResortWeather;
  readonly sky: string;
  readonly fog: string;
  readonly ocean: string;
  readonly ambientIntensity: number;
  readonly hemisphereIntensity: number;
  readonly sunIntensity: number;
  readonly sunColor: string;
  readonly fogNear: number;
  readonly fogFar: number;
}

const PROFILES: Readonly<Record<`${ResortTimeOfDay}:${ResortWeather}`, EnvironmentProfile>> = {
  'day:clear': {
    timeOfDay: 'day', weather: 'clear', sky: '#59bcd0', fog: '#93d5d2', ocean: '#1689a0',
    ambientIntensity: 1.35, hemisphereIntensity: 1.15, sunIntensity: 2.3, sunColor: '#fff1ca', fogNear: 14, fogFar: 28
  },
  'sunset:clear': {
    timeOfDay: 'sunset', weather: 'clear', sky: '#dc8d63', fog: '#d5a37f', ocean: '#287d8d',
    ambientIntensity: 1.05, hemisphereIntensity: 0.9, sunIntensity: 2.0, sunColor: '#ffc06f', fogNear: 12, fogFar: 25
  },
  'evening:clear': {
    timeOfDay: 'evening', weather: 'clear', sky: '#31536d', fog: '#536f7c', ocean: '#19566d',
    ambientIntensity: 0.7, hemisphereIntensity: 0.65, sunIntensity: 1.1, sunColor: '#ffd69a', fogNear: 11, fogFar: 23
  },
  'day:overcast': {
    timeOfDay: 'day', weather: 'overcast', sky: '#78979d', fog: '#91a7a7', ocean: '#347785',
    ambientIntensity: 0.95, hemisphereIntensity: 0.8, sunIntensity: 1.15, sunColor: '#e2e5d9', fogNear: 9, fogFar: 21
  },
  'day:tropical-rain': {
    timeOfDay: 'day', weather: 'tropical-rain', sky: '#4d7078', fog: '#66858a', ocean: '#286d78',
    ambientIntensity: 0.8, hemisphereIntensity: 0.7, sunIntensity: 0.8, sunColor: '#ccd8d4', fogNear: 8, fogFar: 19
  },
  'sunset:overcast': {
    timeOfDay: 'sunset', weather: 'overcast', sky: '#8b7775', fog: '#9f8f88', ocean: '#386d77',
    ambientIntensity: 0.78, hemisphereIntensity: 0.7, sunIntensity: 1.0, sunColor: '#e7ad7d', fogNear: 9, fogFar: 20
  },
  'sunset:tropical-rain': {
    timeOfDay: 'sunset', weather: 'tropical-rain', sky: '#685d66', fog: '#80737a', ocean: '#315d6c',
    ambientIntensity: 0.65, hemisphereIntensity: 0.58, sunIntensity: 0.72, sunColor: '#d99678', fogNear: 7, fogFar: 18
  },
  'evening:overcast': {
    timeOfDay: 'evening', weather: 'overcast', sky: '#344752', fog: '#53616a', ocean: '#244b59',
    ambientIntensity: 0.55, hemisphereIntensity: 0.5, sunIntensity: 0.65, sunColor: '#bcc2be', fogNear: 8, fogFar: 18
  },
  'evening:tropical-rain': {
    timeOfDay: 'evening', weather: 'tropical-rain', sky: '#273b49', fog: '#465762', ocean: '#203f50',
    ambientIntensity: 0.5, hemisphereIntensity: 0.45, sunIntensity: 0.55, sunColor: '#adb8b8', fogNear: 7, fogFar: 17
  }
};

const WAVE_ENVIRONMENT: Readonly<Record<PrototypeWaveNumber, readonly [ResortTimeOfDay, ResortWeather]>> = {
  1: ['day', 'clear'],
  2: ['day', 'clear'],
  3: ['sunset', 'clear'],
  4: ['day', 'overcast'],
  5: ['day', 'tropical-rain'],
  6: ['sunset', 'tropical-rain'],
  7: ['evening', 'clear'],
  8: ['sunset', 'clear']
};

export function environmentProfileForWave(waveNumber: PrototypeWaveNumber, phase: NormalWavePhase): EnvironmentProfile {
  const [timeOfDay, weather] = WAVE_ENVIRONMENT[waveNumber];
  if (phase === 'complete' && weather === 'clear' && timeOfDay === 'day') return PROFILES['sunset:clear'];
  return PROFILES[`${timeOfDay}:${weather}`];
}

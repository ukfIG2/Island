import type { NormalWaveNeedId } from '../core/state';
import {
  RESORT_WORLD_ANCHORS,
  type ResortWorldPoint
} from './resortWorldAnchors';

export interface ResortServiceSpatial {
  center: ResortWorldPoint;
  entrance: ResortWorldPoint;
  queue: ResortWorldPoint;
  embedded: boolean;
}

export const SERVICE_SPATIAL:
  Record<NormalWaveNeedId, ResortServiceSpatial> = {
    reception: {
      center: RESORT_WORLD_ANCHORS.reception.center,
      entrance: RESORT_WORLD_ANCHORS.reception.entrance,
      queue: RESORT_WORLD_ANCHORS.reception.queue,
      embedded: true
    },

    food: {
      center: RESORT_WORLD_ANCHORS.food.build,
      entrance: RESORT_WORLD_ANCHORS.food.entrance,
      queue: RESORT_WORLD_ANCHORS.food.entrance,
      embedded: false
    },

    drinks: {
      center: RESORT_WORLD_ANCHORS.drinks.build,
      entrance: RESORT_WORLD_ANCHORS.drinks.entrance,
      queue: RESORT_WORLD_ANCHORS.drinks.entrance,
      embedded: false
    },

    relax: {
      center: RESORT_WORLD_ANCHORS.pool.center,
      entrance: RESORT_WORLD_ANCHORS.pool.entrance,
      queue: RESORT_WORLD_ANCHORS.pool.entrance,
      embedded: true
    },

    oceanView: {
      center: RESORT_WORLD_ANCHORS.hotel.center,
      entrance: RESORT_WORLD_ANCHORS.hotel.entrance,
      queue: RESORT_WORLD_ANCHORS.hotel.entrance,
      embedded: true
    }
  };

export const BEACH_ARRIVAL:
  ResortWorldPoint = RESORT_WORLD_ANCHORS.beachArrival;

export const GUEST_HANDOFF:
  ResortWorldPoint = RESORT_WORLD_ANCHORS.reception.queue;

function horizontalBasis(
  center: ResortWorldPoint,
  entrance: ResortWorldPoint
) {
  const dx = entrance[0] - center[0];
  const dz = entrance[2] - center[2];
  const length = Math.hypot(dx, dz) || 1;

  const outX = dx / length;
  const outZ = dz / length;

  return {
    outX,
    outZ,
    sideX: -outZ,
    sideZ: outX
  };
}

export function guestQueuePoint(
  need: NormalWaveNeedId,
  index: number
): ResortWorldPoint {
  const spatial = SERVICE_SPATIAL[need];
  const basis = horizontalBasis(
    spatial.center,
    spatial.entrance
  );

  const column = (index % 3) - 1;
  const row = Math.floor(index / 3);

  const outward = 0.10 + row * 0.24;
  const sideways = column * 0.21;

  return [
    spatial.queue[0] +
      basis.outX * outward +
      basis.sideX * sideways,

    spatial.queue[1] + 0.045,

    spatial.queue[2] +
      basis.outZ * outward +
      basis.sideZ * sideways
  ];
}

export function guestActivePoint(
  need: NormalWaveNeedId,
  index: number
): ResortWorldPoint {
  const spatial = SERVICE_SPATIAL[need];
  const basis = horizontalBasis(
    spatial.center,
    spatial.entrance
  );

  const side = index % 2 === 0 ? -1 : 1;
  const row = Math.floor(index / 2);

  return [
    spatial.entrance[0] -
      basis.outX * (0.10 + row * 0.05) +
      basis.sideX * side * 0.14,

    spatial.entrance[1] + 0.045,

    spatial.entrance[2] -
      basis.outZ * (0.10 + row * 0.05) +
      basis.sideZ * side * 0.14
  ];
}

export function guestExitPoint(
  need: NormalWaveNeedId,
  index: number
): ResortWorldPoint {
  const spatial = SERVICE_SPATIAL[need];
  const basis = horizontalBasis(
    spatial.center,
    spatial.entrance
  );

  const distance = 0.72 + index * 0.11;
  const sideways =
    ((index % 3) - 1) * 0.15;

  return [
    spatial.entrance[0] +
      basis.outX * distance +
      basis.sideX * sideways,

    spatial.entrance[1] + 0.04,

    spatial.entrance[2] +
      basis.outZ * distance +
      basis.sideZ * sideways
  ];
}

export function workerPoint(
  need: NormalWaveNeedId
): ResortWorldPoint {
  const spatial = SERVICE_SPATIAL[need];
  const basis = horizontalBasis(
    spatial.center,
    spatial.entrance
  );

  return [
    spatial.entrance[0] -
      basis.outX * 0.05 +
      basis.sideX * 0.23,

    spatial.entrance[1] + 0.04,

    spatial.entrance[2] -
      basis.outZ * 0.05 +
      basis.sideZ * 0.23
  ];
}

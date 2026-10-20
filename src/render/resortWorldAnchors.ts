export type ResortWorldPoint =
  readonly [number, number, number];

export const RESORT_WORLD_ANCHORS = {
  beachArrival: [3.2991, -0.6182, 6.1494],

  reception: {
    center: [4.5151, -0.2073, 5.3356],
    entrance: [3.5562, -0.4877, 5.2473],
    queue: [4.0617, -0.567, 5.413]
  },

  pool: {
    center: [2.7285, 0.6556, 3.3467],
    entrance: [2.7453, 0.2218, 3.1041]
  },

  hotel: {
    center: [4.4279, 1.1569, -1.8641],
    entrance: [3.3605, 1.3939, -1.7837]
  },

  food: {
    build: [5.9777, 1.1318, -1.7204],
    entrance: [5.4101, 0.8371, -1.7899]
  },

  drinks: {
    build: [-0.8452, -0.1023, -0.2355],
    entrance: [-0.8318, -0.4211, -0.2184]
  },

  expansion: {
    slot01: [4.0375, 0.5342, 1.596],
    slot02: [2.3066, 0.3944, 1.3074],
    slot03: [0.2325, 0.0183, 3.8353],
    slot04: [-0.8136, 0.3291, 2.4024],
    slot05: [-3.5042, 0.3388, 3.8735],
    slot06: [-0.3321, 0.4773, -3.0536],
    slot07: [-3.01, 0.6026, 2.2638]
  },

  landmark: {
    waterfall: [3.1372, 1.1094, -3.6117],
    mountainLake: [-2.3629, -0.5919, -0.426],
    reserve: [-0.135, 0.7349, -4.385]
  }
} as const;

export const CALIBRATED_ANCHOR_POINTS = {
  'beachArrival':
    RESORT_WORLD_ANCHORS.beachArrival,

  'reception.center':
    RESORT_WORLD_ANCHORS.reception.center,
  'reception.entrance':
    RESORT_WORLD_ANCHORS.reception.entrance,
  'reception.queue':
    RESORT_WORLD_ANCHORS.reception.queue,

  'relax.center':
    RESORT_WORLD_ANCHORS.pool.center,
  'relax.entrance':
    RESORT_WORLD_ANCHORS.pool.entrance,

  'hotel.center':
    RESORT_WORLD_ANCHORS.hotel.center,
  'hotel.entrance':
    RESORT_WORLD_ANCHORS.hotel.entrance,

  'food.build':
    RESORT_WORLD_ANCHORS.food.build,
  'food.entrance':
    RESORT_WORLD_ANCHORS.food.entrance,

  'drinks.build':
    RESORT_WORLD_ANCHORS.drinks.build,
  'drinks.entrance':
    RESORT_WORLD_ANCHORS.drinks.entrance,

  'expansion.slot01':
    RESORT_WORLD_ANCHORS.expansion.slot01,
  'expansion.slot02':
    RESORT_WORLD_ANCHORS.expansion.slot02,
  'expansion.slot03':
    RESORT_WORLD_ANCHORS.expansion.slot03,
  'expansion.slot04':
    RESORT_WORLD_ANCHORS.expansion.slot04,
  'expansion.slot05':
    RESORT_WORLD_ANCHORS.expansion.slot05,
  'expansion.slot06':
    RESORT_WORLD_ANCHORS.expansion.slot06,
  'expansion.slot07':
    RESORT_WORLD_ANCHORS.expansion.slot07,

  'landmark.waterfall':
    RESORT_WORLD_ANCHORS.landmark.waterfall,
  'landmark.mountainLake':
    RESORT_WORLD_ANCHORS.landmark.mountainLake,
  'landmark.reserve':
    RESORT_WORLD_ANCHORS.landmark.reserve
} as const;

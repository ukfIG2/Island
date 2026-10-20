import type {
  NormalWaveNeedId
} from '../core/state';

import {
  RESORT_WORLD_ANCHORS,
  type ResortWorldPoint
} from './resortWorldAnchors';

import {
  GUEST_HANDOFF,
  guestQueuePoint,
  workerPoint
} from './resortWorldSpatial';

type Point3 =
  ResortWorldPoint;

type NavigationNodeId =
  | 'reception'
  | 'pool'
  | 'central'
  | 'eastJunction'
  | 'westPromenade'
  | 'westJunction'
  | 'drinks'
  | 'hotel'
  | 'food';

interface NavigationSample {
  readonly point: Point3;
  readonly direction: Point3;
  readonly segmentProgress: number;
}

function lifted(
  point: Point3,
  amount = 0.035
): Point3 {
  return [
    point[0],
    point[1] + amount,
    point[2]
  ];
}

/*
 * These are NOT new gameplay anchors.
 *
 * They are renderer-local navigation coordinates derived
 * from already calibrated world truth.
 *
 * Expansion pads are useful here because they are known
 * traversable/open surfaces distributed through the island.
 */
const NODES:
  Readonly<
    Record<
      NavigationNodeId,
      Point3
    >
  > = {
    reception:
      lifted(
        RESORT_WORLD_ANCHORS
          .reception.queue
      ),

    pool:
      lifted(
        RESORT_WORLD_ANCHORS
          .pool.entrance
      ),

    central:
      lifted(
        RESORT_WORLD_ANCHORS
          .expansion.slot02
      ),

    eastJunction:
      lifted(
        RESORT_WORLD_ANCHORS
          .expansion.slot01
      ),

    westPromenade:
      lifted(
        RESORT_WORLD_ANCHORS
          .expansion.slot03
      ),

    westJunction:
      lifted(
        RESORT_WORLD_ANCHORS
          .expansion.slot04
      ),

    drinks:
      lifted(
        RESORT_WORLD_ANCHORS
          .drinks.entrance
      ),

    hotel:
      lifted(
        RESORT_WORLD_ANCHORS
          .hotel.entrance
      ),

    food:
      lifted(
        RESORT_WORLD_ANCHORS
          .food.entrance
      )
  };

const LINKS:
  ReadonlyArray<
    readonly [
      NavigationNodeId,
      NavigationNodeId
    ]
  > = [
    [
      'reception',
      'pool'
    ],

    [
      'pool',
      'central'
    ],

    [
      'central',
      'eastJunction'
    ],

    [
      'eastJunction',
      'hotel'
    ],

    [
      'eastJunction',
      'food'
    ],

    [
      'hotel',
      'food'
    ],

    [
      'central',
      'westPromenade'
    ],

    [
      'westPromenade',
      'westJunction'
    ],

    [
      'westJunction',
      'drinks'
    ]
  ];

const SERVICE_NODE:
  Readonly<
    Record<
      NormalWaveNeedId,
      NavigationNodeId
    >
  > = {
    reception: 'reception',
    relax: 'pool',
    drinks: 'drinks',
    oceanView: 'hotel',
    food: 'food'
  };

function distance(
  a: Point3,
  b: Point3
): number {
  const dx =
    b[0] - a[0];

  const dy =
    b[1] - a[1];

  const dz =
    b[2] - a[2];

  return Math.sqrt(
    dx * dx +
    dy * dy +
    dz * dz
  );
}

function neighbours(
  node:
    NavigationNodeId
): NavigationNodeId[] {
  const result:
    NavigationNodeId[] = [];

  for (
    const [
      a,
      b
    ] of LINKS
  ) {
    if (a === node) {
      result.push(b);
    }

    if (b === node) {
      result.push(a);
    }
  }

  return result;
}

function shortestNodePath(
  start:
    NavigationNodeId,
  destination:
    NavigationNodeId
): NavigationNodeId[] {
  if (
    start ===
    destination
  ) {
    return [start];
  }

  const unvisited =
    new Set<
      NavigationNodeId
    >(
      Object.keys(
        NODES
      ) as NavigationNodeId[]
    );

  const costs =
    new Map<
      NavigationNodeId,
      number
    >();

  const previous =
    new Map<
      NavigationNodeId,
      NavigationNodeId
    >();

  for (
    const node of
    unvisited
  ) {
    costs.set(
      node,
      Number.POSITIVE_INFINITY
    );
  }

  costs.set(
    start,
    0
  );

  while (
    unvisited.size >
    0
  ) {
    let current:
      NavigationNodeId |
      null = null;

    let currentCost =
      Number.POSITIVE_INFINITY;

    for (
      const node of
      unvisited
    ) {
      const cost =
        costs.get(node) ??
        Number.POSITIVE_INFINITY;

      if (
        cost <
        currentCost
      ) {
        current =
          node;

        currentCost =
          cost;
      }
    }

    if (
      current === null ||
      !Number.isFinite(
        currentCost
      )
    ) {
      break;
    }

    if (
      current ===
      destination
    ) {
      break;
    }

    unvisited.delete(
      current
    );

    for (
      const next of
      neighbours(current)
    ) {
      if (
        !unvisited.has(next)
      ) {
        continue;
      }

      const candidate =
        currentCost +
        distance(
          NODES[current],
          NODES[next]
        );

      const known =
        costs.get(next) ??
        Number.POSITIVE_INFINITY;

      if (
        candidate <
        known
      ) {
        costs.set(
          next,
          candidate
        );

        previous.set(
          next,
          current
        );
      }
    }
  }

  const reversed:
    NavigationNodeId[] = [
      destination
    ];

  let cursor:
    NavigationNodeId =
      destination;

  while (
    cursor !== start
  ) {
    const parent =
      previous.get(
        cursor
      );

    if (!parent) {
      return [
        start,
        destination
      ];
    }

    reversed.push(
      parent
    );

    cursor =
      parent;
  }

  reversed.reverse();

  return reversed;
}

function compactRoute(
  points:
    readonly Point3[]
): Point3[] {
  const result:
    Point3[] = [];

  for (
    const point of
    points
  ) {
    const last =
      result[
        result.length - 1
      ];

    if (
      !last ||
      distance(
        last,
        point
      ) > 0.04
    ) {
      result.push(
        point
      );
    }
  }

  return result;
}

function serviceRoute(
  from:
    NormalWaveNeedId,
  to:
    NormalWaveNeedId,
  start:
    Point3,
  destination:
    Point3
): Point3[] {
  const nodes =
    shortestNodePath(
      SERVICE_NODE[from],
      SERVICE_NODE[to]
    );

  return compactRoute([
    start,

    ...nodes.map(
      node =>
        NODES[node]
    ),

    destination
  ]);
}

export function guestQueueRoute(
  need:
    NormalWaveNeedId,
  index: number
): Point3[] {
  const destination =
    guestQueuePoint(
      need,
      index
    );

  return serviceRoute(
    'reception',
    need,
    lifted(
      GUEST_HANDOFF
    ),
    destination
  );
}

export function workerTransferRoute(
  from:
    NormalWaveNeedId,
  to:
    NormalWaveNeedId
): Point3[] {
  return serviceRoute(
    from,
    to,
    workerPoint(from),
    workerPoint(to)
  );
}

export function routeLength(
  route:
    readonly Point3[]
): number {
  let total =
    0;

  for (
    let index = 1;
    index < route.length;
    index += 1
  ) {
    total +=
      distance(
        route[index - 1],
        route[index]
      );
  }

  return total;
}

export function walkingDuration(
  route:
    readonly Point3[],
  speed = 2.0,
  minimum = 0.65,
  maximum = 6.0
): number {
  return Math.min(
    maximum,
    Math.max(
      minimum,
      routeLength(route) /
        speed
    )
  );
}

export function sampleRoute(
  route:
    readonly Point3[],
  progress: number
): NavigationSample {
  if (
    route.length === 0
  ) {
    return {
      point: [
        0,
        0,
        0
      ],

      direction: [
        0,
        0,
        1
      ],

      segmentProgress: 1
    };
  }

  if (
    route.length === 1
  ) {
    return {
      point:
        route[0],

      direction: [
        0,
        0,
        1
      ],

      segmentProgress: 1
    };
  }

  const clamped =
    Math.min(
      1,
      Math.max(
        0,
        progress
      )
    );

  const lengths:
    number[] = [];

  let total =
    0;

  for (
    let index = 1;
    index < route.length;
    index += 1
  ) {
    const length =
      distance(
        route[index - 1],
        route[index]
      );

    lengths.push(
      length
    );

    total +=
      length;
  }

  if (
    total <=
    0.0001
  ) {
    return {
      point:
        route[
          route.length - 1
        ],

      direction: [
        0,
        0,
        1
      ],

      segmentProgress: 1
    };
  }

  const target =
    total *
    clamped;

  let consumed =
    0;

  for (
    let index = 0;
    index < lengths.length;
    index += 1
  ) {
    const segmentLength =
      lengths[index];

    const nextConsumed =
      consumed +
      segmentLength;

    if (
      target <=
        nextConsumed ||
      index ===
        lengths.length - 1
    ) {
      const from =
        route[index];

      const to =
        route[index + 1];

      const local =
        segmentLength > 0
          ? (
              target -
              consumed
            ) /
            segmentLength
          : 1;

      const dx =
        to[0] -
        from[0];

      const dy =
        to[1] -
        from[1];

      const dz =
        to[2] -
        from[2];

      const directionLength =
        Math.hypot(
          dx,
          dy,
          dz
        ) || 1;

      return {
        point: [
          from[0] +
            dx * local,

          from[1] +
            dy * local,

          from[2] +
            dz * local
        ],

        direction: [
          dx /
            directionLength,

          dy /
            directionLength,

          dz /
            directionLength
        ],

        segmentProgress:
          Math.min(
            1,
            Math.max(
              0,
              local
            )
          )
      };
    }

    consumed =
      nextConsumed;
  }

  return {
    point:
      route[
        route.length - 1
      ],

    direction: [
      0,
      0,
      1
    ],

    segmentProgress: 1
  };
}

function smooth01(
  value: number
): number {
  const x =
    Math.min(
      1,
      Math.max(
        0,
        value
      )
    );

  return (
    x *
    x *
    (
      3 -
      2 * x
    )
  );
}

function inverseLerp(
  from: number,
  to: number,
  value: number
): number {
  if (
    Math.abs(
      to - from
    ) <
    0.00001
  ) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(
      0,
      (
        value -
        from
      ) /
        (
          to -
          from
        )
    )
  );
}

/*
 * Visual grammar for vertical traversal.
 *
 * Horizontal movement remains fully visible.
 *
 * As the current navigation edge becomes steeper:
 * - disappearance starts sooner;
 * - fade-out becomes faster;
 * - the unit remains hidden longer;
 * - it reappears close to the end of the edge.
 *
 * This intentionally does NOT hide bad horizontal routing.
 */
export function verticalTraversalOpacity(
  sample:
    NavigationSample
): number {
  const horizontal =
    Math.hypot(
      sample.direction[0],
      sample.direction[2]
    );

  const vertical =
    Math.abs(
      sample.direction[1]
    );

  const angle =
    Math.atan2(
      vertical,
      Math.max(
        horizontal,
        0.00001
      )
    ) *
    180 /
    Math.PI;

  /*
   * Under ~12° it is ordinary visible walking.
   * Around 45°+ it behaves like a level transition.
   */
  const steepness =
    smooth01(
      inverseLerp(
        12,
        48,
        angle
      )
    );

  if (
    steepness <=
    0.001
  ) {
    return 1;
  }

  const progress =
    sample.segmentProgress;

  /*
   * Gentle slope:
   *   wait ~22% of edge before fading.
   *
   * Near-vertical:
   *   wait almost nothing.
   */
  const fadeOutStart =
    0.22 +
    (
      0.015 -
      0.22
    ) *
      steepness;

  const fadeOutDuration =
    0.19 +
    (
      0.065 -
      0.19
    ) *
      steepness;

  const fadeOutEnd =
    fadeOutStart +
    fadeOutDuration;

  /*
   * On stronger vertical transitions the pawn stays hidden
   * until very near the destination level.
   */
  const fadeInStart =
    0.69 +
    (
      0.88 -
      0.69
    ) *
      steepness;

  const fadeInDuration =
    0.20 +
    (
      0.085 -
      0.20
    ) *
      steepness;

  const fadeInEnd =
    Math.min(
      1,
      fadeInStart +
      fadeInDuration
    );

  let traversalOpacity =
    1;

  if (
    progress <
    fadeOutStart
  ) {
    traversalOpacity =
      1;
  } else if (
    progress <
    fadeOutEnd
  ) {
    traversalOpacity =
      1 -
      smooth01(
        inverseLerp(
          fadeOutStart,
          fadeOutEnd,
          progress
        )
      );
  } else if (
    progress <
    fadeInStart
  ) {
    traversalOpacity =
      0;
  } else if (
    progress <
    fadeInEnd
  ) {
    traversalOpacity =
      smooth01(
        inverseLerp(
          fadeInStart,
          fadeInEnd,
          progress
        )
      );
  } else {
    traversalOpacity =
      1;
  }

  /*
   * Moderate slopes should not vanish as aggressively as
   * genuine vertical transitions.
   */
  return (
    1 -
    steepness *
      (
        1 -
        traversalOpacity
      )
  );
}

export function headingForDirection(
  direction:
    Point3
): number {
  return Math.atan2(
    direction[0],
    direction[2]
  );
}

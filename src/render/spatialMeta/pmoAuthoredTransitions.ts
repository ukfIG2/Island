/** Explicit interpretation of six original authored connector identities. *
 * This is a read-only compilation overlay, never a locomotion certificate.
 * Unrecognized, edited or user-typed objects retain their original semantics.
 */
import type { SpatialPoint, SpatialRegistry } from './registry';
import type { TransitionKind } from './navigation';

type Authored = { name: string; kind: TransitionKind; endpoints: readonly [SpatialPoint, SpatialPoint] };
const AUTHORED: Record<string, Authored> = {
  'pmo-43da1713-bffe-4888-aea1-44957b3b7bec': { name: 'stairs from place_4 to place_5', kind: 'stairs', endpoints: [[2.7129,-0.9812,1.1988],[3.3713,-0.4341,0.4165]] },
  'pmo-2d1f3e6f-85ee-4abd-96fe-fd42943edcd4': { name: 'lift from place_5 to place_6', kind: 'lift', endpoints: [[3.8532,-0.4064,-0.5487],[3.2765,0.5647,-1.202]] },
  'pmo-4857a734-792e-4798-b102-c0ecb92daf1d': { name: 'bridge from place_6 to place_7', kind: 'bridge', endpoints: [[1.8613,0.2132,-2.6254],[-0.0104,-0.0295,-3.4471]] },
  'pmo-02971a36-0dbc-47ed-a6c4-d532f148c2c0': { name: 'bridge from place_3 to place_8', kind: 'bridge', endpoints: [[0.5513,-1.0402,2.7778],[-0.7173,-0.8695,3.48]] },
  'pmo-bcd1f9a0-b520-473a-bef8-bccfc8ac2e41': { name: 'lift from place_8 to place_9', kind: 'lift', endpoints: [[-2.0794,-0.9096,2.9613],[-2.4687,-0.176,2.5048]] },
  'pmo-3ae6a767-a0f4-40af-b982-ec36346bebe6': { name: 'stairs_from_main_beach_to_places_1-4', kind: 'stairs', endpoints: [[1.6739,-2.2456,4.5734],[2.1003,-1.2289,3.6249]] }
};
const EDGE_BINDINGS: Record<string, readonly [string, string, string]> = {
  "pmo-43da1713-bffe-4888-aea1-44957b3b7bec": [
    "edge-f2055f2f-b53e-432d-81f2-d5164bd4f82c",
    "pt-4ccf59d7-ee9f-4413-8cb7-961b3248baad",
    "pt-8947211a-982b-4b9a-ac44-cb9a2a876bc3"
  ],
  "pmo-2d1f3e6f-85ee-4abd-96fe-fd42943edcd4": [
    "edge-29b0f8d7-cb3e-4ef5-9c1d-fea6f7c0cffb",
    "pt-bcd1fc34-9e38-4494-acdb-253155e15d76",
    "pt-e08ef451-3a7e-4226-b8fa-e7e095d00e56"
  ],
  "pmo-4857a734-792e-4798-b102-c0ecb92daf1d": [
    "edge-c3f782c1-e6a3-4898-97f4-4d8562ee537a",
    "pt-9dbefc41-1d63-4d34-af98-8a7bc4180676",
    "pt-b5383794-3ade-4853-866d-c2ee48cf95b6"
  ],
  "pmo-02971a36-0dbc-47ed-a6c4-d532f148c2c0": [
    "edge-5a42cd2c-9284-4bbe-8b97-3a7229859c5e",
    "pt-ba960b3d-6b1d-4cde-a8a7-192f5ff4ce17",
    "pt-ee5f4a02-6f11-4104-9879-a3c34bf58092"
  ],
  "pmo-bcd1f9a0-b520-473a-bef8-bccfc8ac2e41": [
    "edge-5c288e01-9ef8-4019-8f46-e2651517e672",
    "pt-67204e23-77ac-426a-8573-54716ac08eaf",
    "pt-6eb808f9-5ed9-4262-899d-18f597ae41cf"
  ],
  "pmo-3ae6a767-a0f4-40af-b982-ec36346bebe6": [
    "edge-75a62dfb-676b-4b60-bde3-95e51300ac3d",
    "pt-6c932cc6-1d8e-43a9-b4aa-b46cec152bed",
    "pt-b137323e-498f-4398-a8ca-08ff442e69ee"
  ]
};

const matches = (a: SpatialPoint, b: SpatialPoint) => a.every((value, i) => Math.abs(value - b[i]) <= 0.0001);

export function annotateAuthoredPmoTransitions(registry: SpatialRegistry): SpatialRegistry {
  let changed = false;
  const objects = registry.objects.map(object => {
    const spec = AUTHORED[object.id];
    if (!spec || object.geometry.type !== 'skeleton' || object.name !== spec.name || object.geometry.edges.length !== 1) return object;
    const binding = EDGE_BINDINGS[object.id], edge = object.geometry.edges[0];
    if (!binding || !edge || edge.id !== binding[0] || edge.from !== binding[1] || edge.to !== binding[2] || edge.directed !== false) return object;
    const a = object.geometry.points[binding[1]], b = object.geometry.points[binding[2]];
    if (Object.keys(object.geometry.points).length !== 2 || !a || !b || !matches(a, spec.endpoints[0]) || !matches(b, spec.endpoints[1])) return object;
    const original = object.metadata.navigation;
    const navigation: Record<string, unknown> = original && typeof original === 'object' && !Array.isArray(original)
      ? original as Record<string, unknown> : {};
    if ('transition' in navigation) return object;
    changed = true;
    return { ...object, metadata: { ...object.metadata, navigation: { ...navigation, transition: spec.kind } } };
  });
  return changed ? { ...registry, objects } : registry;
}

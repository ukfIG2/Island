// Exports the paths of Vadzim's web island (RRH) for the Unity version.
//
// Runs his own navigation code in Node against the real island mesh, exactly as his game builds it in
// the browser (PmoNavigationScope / PmoTransitionStructures / PmoProductionGuestTraffic), and writes what
// Unity needs as plain data: every visible stair, bridge, landing and lift part as a box, and the routes
// his guests walk between the beach and the buildings, all in Unity coordinates.
// Unity coordinates mirror x, as glTFast does when it imports the island model:
// position (x, y, z) -> (-x, y, z), rotation (x, y, z, w) -> (x, -y, -z, w).
//
// Usage: node Tools/WebExport/export-island-paths.mjs <path to the web project> Assets/Resources/Island/island-paths.json
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const [webRoot, outPath] = process.argv.slice(2);
if (!webRoot || !outPath) throw new Error('usage: export-island-paths.mjs <web project> <out.json>');
const require = createRequire(webRoot + '/package.json');
const vite = await import(pathToFileURL(require.resolve('vite')).href);
const server = await vite.createServer({
  root: webRoot, logLevel: 'error', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
});
const load = path => server.ssrLoadModule(path);

try {
  const THREE = await load('three');
  const meta = '/src/render/spatialMeta/';
  const { makeTerrainProjector } = await load(meta + 'terrainProjector.ts');
  const { getPublishedPmoRegistry } = await load(meta + 'pmoServiceLayout.ts');
  const { buildPmoNavigationWorld } = await load(meta + 'pmoNavigationWorld.ts');
  const { projectPmoTransitionStructures } = await load(meta + 'pmoTransitionStructures.ts');
  const { designPmoBeachGateway, BEACH_GATEWAY_ID } = await load(meta + 'pmoBeachGatewayDesign.ts');
  const { BRIDGE8_ID } = await load('/src/render/PmoBridge8Architecture.tsx');

  const island = islandMesh(THREE);
  const published = getPublishedPmoRegistry();
  const world = buildPmoNavigationWorld(published.registry, makeTerrainProjector(island), published.authority);
  const structures = projectPmoTransitionStructures(published.registry);

  // Rebuild the scene graph of his components, then read every box's world transform.
  const scene = new THREE.Group();
  const boxes = [], cylinders = [];
  const group = (parent, position = [0, 0, 0], rotation = [0, 0, 0]) => {
    const g = new THREE.Group();
    g.position.fromArray(position);
    g.rotation.set(rotation[0], rotation[1], rotation[2]);
    parent.add(g);
    return g;
  };
  const box = (parent, size, color, position, rotation) => {
    const g = group(parent, position, rotation);
    g.userData = { kind: 'box', size, color };
  };
  const cylinder = (parent, radius, length, color, position, quaternion) => {
    const g = group(parent, position);
    g.quaternion.copy(quaternion);
    g.userData = { kind: 'cylinder', size: [radius * 2, length, radius * 2], color };
  };

  for (const structure of structures) {
    if (structure.sourceId === BEACH_GATEWAY_ID) beachGateway(structure);
    else if (structure.sourceId === BRIDGE8_ID) bridge8(structure);
    else if (structure.kind === 'lift') lift(structure);
    else for (const s of structure.segments)  // PmoTransitionStructures.tsx AuthoredStructure
      box(scene, [s.width, 0.034, s.length], structure.kind === 'stairs' ? '#c6b298' : '#86a695',
        s.center, [s.pitch, s.yaw, 0]);
  }
  for (const landing of world.landingExtensions)   // CertifiedLanding
    if (landing.sourceId !== BEACH_GATEWAY_ID && landing.sourceId !== BRIDGE8_ID)
      for (const s of landing.treads) box(scene, [s.width, 0.034, s.length], '#c6b298', s.center, [0, s.yaw, 0]);
  for (const dock of world.dockExtensions)         // physical docks
    if (dock.structureSourceId !== BEACH_GATEWAY_ID && dock.structureSourceId !== BRIDGE8_ID)
      for (const s of dock.treads)
        box(scene, [s.width, 0.034, s.length], dock.kind === 'stairs' ? '#b9ad85' : '#71998f', s.center, [0, s.yaw, 0]);

  scene.updateMatrixWorld(true);
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  scene.traverse(o => {
    if (!o.userData.kind) return;
    o.matrixWorld.decompose(p, q, sc);
    const entry = { p: unityPoint([p.x, p.y, p.z]), q: [round(q.x), round(-q.y), round(-q.z), round(q.w)],
      s: o.userData.size.map(round), c: o.userData.color };
    (o.userData.kind === 'box' ? boxes : cylinders).push(entry);
  });

  const lifts = structures.filter(s => s.kind === 'lift')
    .map(s => ({ id: s.sourceId, from: unityPoint(s.from), to: unityPoint(s.to) }));

  // Guest routes, planned exactly like PmoProductionGuestTraffic.tsx: his walk areas, steps, bridges and lifts.
  const { makePmoTerrainConnector } = await load(meta + 'pmoNavigationWorld.ts');
  const { readPmoWalkAuthorization, inventoryPmoBuildingSites } = await load(meta + 'pmoWorldBindings.ts');
  const { assessPmoTransitionAccess } = await load(meta + 'pmoTransitionAccess.ts');
  const { adaptCompiledPmoGraph } = await load(meta + 'pmoCompiledGraphAdapter.ts');
  const { auditPmoWalkMotion } = await load(meta + 'pmoWalkMotionAudit.ts');
  const { auditedApproaches, siteByNeed } = await load(meta + 'pmoProductionSiteEndpoints.ts');
  const { PmoWavePedestrianTraffic } = await load(meta + 'pmoWavePedestrianTraffic.ts');
  const BEACH = [1.6739, -2.2456, 4.5734];   // PmoProductionGuestTraffic.tsx
  const connector = makePmoTerrainConnector(world.navigationRegistry, makeTerrainProjector(island));
  const adapted = adaptCompiledPmoGraph(world.graph, connector, readPmoWalkAuthorization(world.navigationRegistry),
    structures, assessPmoTransitionAccess(structures, world.graph), world.landingExtensions, world.liftTransit,
    world.dockExtensions);
  const graph = auditPmoWalkMotion(adapted.graph, connector).graph;
  const sites = inventoryPmoBuildingSites(published.registry);
  const destinations = siteByNeed(sites, auditedApproaches(graph, BEACH, sites), world.endpoints);
  const routes = [];
  const plan = (name, from, to) => {
    // A fresh traffic per route: a second guest may not start on top of the first.
    const result = new PmoWavePedestrianTraffic(graph, connector, BEACH, destinations, adapted.physical, world.liftTransit)
      .pedestrians.add({ id: name, from, to });
    if (result.status !== 'READY') throw new Error(`${name}: ${result.status} ${result.reason}`);
    routes.push(polyline(name, result.steps));
  };
  const needs = Object.keys(destinations);
  for (const need of needs) {
    plan('beach>' + need, BEACH, destinations[need]);
    plan(need + '>beach', destinations[need], BEACH);
    for (const other of needs) if (other !== need) plan(need + '>' + other, destinations[need], destinations[other]);
  }

  writeFileSync(outPath, JSON.stringify({ source: 'RRH ' + published.authority, boxes, cylinders, lifts,
    beach: unityPoint(BEACH), routes }));
  console.log(`wrote ${outPath}: ${boxes.length} boxes, ${cylinders.length} cylinders, ${lifts.length} lifts, ` +
    `${routes.length} routes`);

  // One route as a flat point list; stairs and bridges follow their sampled surface, a lift leg is marked
  // by the index of the point where the guest boards.
  function polyline(name, steps) {
    const points = [], liftLegs = [];
    const add = v => {
      const last = points[points.length - 1];
      if (!last || Math.hypot(v[0] - last[0], v[1] - last[1], v[2] - last[2]) > 1e-4) points.push(v);
    };
    for (const step of steps) {
      add(step.from);
      if (step.kind === 'lift') {
        liftLegs.push({ at: points.length - 1, id: step.helperId });
        add(step.to);
        continue;
      }
      let samples = step.helperId ? adapted.physical.get(step.helperId) : null;
      if (samples && samples.length > 1) {
        const start = samples[0], end = samples[samples.length - 1];
        if (distance(end, step.from) < distance(start, step.from)) samples = [...samples].reverse();
        for (const s of samples) add(s);
      }
      add(step.to);
    }
    return { name, p: points.flatMap(unityPoint), lifts: liftLegs };
  }

  // PmoBeachGateway.tsx: the main arrival stair as stone steps with side cheeks and an edge highlight.
  function beachGateway(stair) {
    const plan = designPmoBeachGateway(stair, world.landingExtensions, world.dockExtensions);
    if (!plan) return;
    plan.stones.filter(s => s.family === 'main').forEach((s, index) => {
      const height = s.baseDepth;
      const pos = [s.center[0], s.top - height / 2, s.center[2]];
      const dx = Math.cos(s.yaw), dz = -Math.sin(s.yaw), cheek = s.width / 2 + 0.010;
      const color = index % 5 === 0 ? '#b4a188' : index % 5 === 2 ? '#ccbaa0' : '#c2b099';
      box(scene, [s.width, height, s.length], color, pos, [0, s.yaw, 0]);
      for (const side of [-1, 1])
        box(scene, [0.025, 0.12, s.length * 1.035], '#817765',
          [pos[0] + dx * cheek * side, s.top - 0.067, pos[2] + dz * cheek * side], [0, s.yaw, 0]);
      box(scene, [s.width * 0.90, 0.012, s.length * 0.85], '#d9cab2', [s.center[0], s.top - 0.006, s.center[2]], [0, s.yaw, 0]);
    });
  }

  // PmoBridge8Architecture.tsx: span with side sills and posts, plus its approach and dock steps.
  function bridge8(structure) {
    structure.segments.forEach((s, i) => {
      const seg = group(scene, s.center, [0, s.yaw, 0]);
      box(seg, [s.width, 0.030, s.length], i % 4 === 0 ? '#b2a792' : '#c2b8a3', [0, 0, 0], [s.pitch, 0, 0]);
      for (const side of [-1, 1]) {
        const rail = group(seg, [side * (s.width / 2 + 0.033), 0, 0]);
        box(rail, [0.026, 0.10, s.length * 1.015], '#817a6a', [0, -0.065, 0], [s.pitch, 0, 0]);
        if (i % 4 === 0) box(rail, [0.023, 0.24, 0.023], '#756f62', [0, 0.105, 0]);
      }
    });
    for (const landing of world.landingExtensions.filter(l => l.sourceId === BRIDGE8_ID))
      landing.treads.forEach((s, i) => {
        const tread = group(scene, [s.center[0], s.top - 0.042, s.center[2]], [0, s.yaw, 0]);
        box(tread, [s.width, 0.084, s.length], i % 4 === 0 ? '#b2a48d' : '#c4b59e');
        for (const side of [-1, 1]) box(tread, [0.024, 0.08, s.length * 1.025], '#817969', [side * (s.width / 2 + 0.017), -0.040, 0]);
      });
    for (const dock of world.dockExtensions.filter(d => d.structureSourceId === BRIDGE8_ID))
      dock.treads.forEach((s, i) => {
        const tread = group(scene, s.center, [0, s.yaw, 0]);
        box(tread, [s.width, 0.034, s.length], i % 5 === 0 ? '#b2a48d' : '#c4b59e');
        for (const side of [-1, 1]) box(tread, [0.023, 0.09, s.length * 1.05], '#817969', [side * (s.width / 2 + 0.016), -0.045, 0]);
      });
  }

  // PmoTransitionStructures.tsx LiftVisual: rail and the two stops; Unity builds the moving cabin.
  function lift(structure) {
    const start = new THREE.Vector3(...structure.from), end = new THREE.Vector3(...structure.to);
    const direction = end.clone().sub(start);
    const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    cylinder(scene, 0.016, direction.length(), '#758a80', start.clone().add(end).multiplyScalar(0.5).toArray(), turn);
    for (const point of [structure.from, structure.to]) box(scene, [0.38, 0.045, 0.38], '#748c81', point);
  }
} finally {
  await server.close();
}

function round(v) { return Math.round(v * 1e5) / 1e5; }
function distance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }
function unityPoint(v) { return [round(-v[0]), round(v[1]), round(v[2])]; }

// The island mesh placed like ResortIslandModel.tsx: group scale 8, raised 0.55, the model's own 70° turn.
function islandMesh(THREE) {
  const glb = readFileSync(webRoot + '/public/models/cascade-isle-v2.glb');
  const jsonLength = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
  const binStart = 20 + jsonLength + 8;
  const bytes = accessor => {
    const a = gltf.accessors[accessor], view = gltf.bufferViews[a.bufferView];
    const offset = glb.byteOffset + binStart + (view.byteOffset || 0) + (a.byteOffset || 0);
    return { a, buffer: glb.buffer.slice(offset, offset + view.byteLength) };
  };
  const primitive = gltf.meshes[0].primitives[0];
  const position = bytes(primitive.attributes.POSITION), index = bytes(primitive.indices);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(position.buffer, 0, position.a.count * 3), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(index.buffer, 0, index.a.count), 1));
  const root = new THREE.Group();
  root.scale.setScalar(8);
  root.position.set(0, 0.55, 0);
  const turn = new THREE.Object3D();
  turn.quaternion.fromArray(gltf.nodes[1].rotation);
  const mesh = new THREE.Mesh(geometry);
  root.add(turn);
  turn.add(mesh);
  root.updateMatrixWorld(true);
  return mesh;
}

/** Resort Empire spatial metadata registry. DEV authoring only; never gameplay authority. */
import installedAuthoredPmo from '../../../semantic/evidence/pmo/registry-authored-2026-10-21.json';
export type SpatialPoint = [number, number, number];
export type JsonExtra = Record<string, unknown>;

export interface SkeletonGeometry extends JsonExtra {
  type: 'skeleton';
  points: Record<string, SpatialPoint>;
  edges: Array<{ id: string; from: string; to: string; directed?: boolean; metadata?: JsonExtra }>;
}
export interface PaintGeometry extends JsonExtra {
  type: 'paint';
  strokes: Array<{ id: string; radius: number; color: string; points: SpatialPoint[]; metadata?: JsonExtra }>;
}
export type SpatialGeometry = SkeletonGeometry | PaintGeometry;
export interface SpatialMetaObject extends JsonExtra {
  id: string;
  name: string;
  geometry: SpatialGeometry;
  metadata: JsonExtra;
  relations: Array<{ id: string; targetId: string; predicate: string; metadata?: JsonExtra }>;
  visible: boolean;
  revision: number;
}
export interface SpatialRegistry extends JsonExtra {
  schemaVersion: 1;
  coordinateSpace: 'world';
  objects: SpatialMetaObject[];
}
export type SpatialTool = 'select' | 'point' | 'paint';
export interface SpatialSnapshot {
  registry: SpatialRegistry;
  selectedId: string | null;
  tool: SpatialTool;
  brushRadius: number;
  brushColor: string;
  revision: number;
  canUndo: boolean;
  canRedo: boolean;
  error: string | null;
}

const STORAGE_KEY = 'rrh.spatial-meta.registry.v1';
/** One-time published-PMO upgrade: do not let an earlier browser-local copy mask
 * the user's new default authoring file after installer promotion.
 * Later editor changes remain live and must not be overwritten on page reload.
 */
const PUBLISHED_PMO_REVISION = '65880264634ADAD35633CD33F9F0DDD002B1705272B17EA2C8DDF2E79472F9A7';
const PUBLISHED_PMO_MARKER = 'rrh.spatial-meta.registry.published-pmo.sha256';
const PREVIOUS_BROWSER_PMO_BACKUP = 'rrh.spatial-meta.registry.backup.before-2026-10-25-userpaint';
const EMPTY_REGISTRY: SpatialRegistry = { schemaVersion: 1, coordinateSpace: 'world', objects: [] };
const MAX_HISTORY = 80;
const listeners = new Set<() => void>();
let initialized = false;
let past: SpatialRegistry[] = [];
let future: SpatialRegistry[] = [];
let snapshot: SpatialSnapshot = {
  registry: EMPTY_REGISTRY, selectedId: null, tool: 'select', brushRadius: 0.42,
  brushColor: '#ffca61', revision: 0, canUndo: false, canRedo: false, error: null
};

export const newSpatialId = (prefix: string): string => {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${id}`;
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isNonempty = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;
const isPoint = (v: unknown): v is SpatialPoint => Array.isArray(v) && v.length === 3 &&
  v.every(n => typeof n === 'number' && Number.isFinite(n));
function fail(message: string): never { throw new Error(message); }
const isJsonObject = (v: unknown): v is JsonExtra => isRecord(v);

export function validateSpatialObject(input: unknown): SpatialMetaObject {
  if (!isRecord(input)) fail('ПМО должен быть JSON-объектом.');
  const obj = input as Record<string, unknown>;
  if (!isNonempty(obj.id)) fail('У ПМО отсутствует непустой id.');
  if (!isNonempty(obj.name)) fail(`ПМО ${obj.id}: требуется name.`);
  if (typeof obj.visible !== 'boolean') fail(`ПМО ${obj.id}: visible должен быть boolean.`);
  if (!Number.isInteger(obj.revision) || Number(obj.revision) < 0) fail(`ПМО ${obj.id}: неверный revision.`);
  if (!isJsonObject(obj.metadata)) fail(`ПМО ${obj.id}: metadata должен быть объектом.`);
  if (!Array.isArray(obj.relations)) fail(`ПМО ${obj.id}: relations должен быть массивом.`);
  const relationIds = new Set<string>();
  for (const rel of obj.relations) {
    if (!isRecord(rel) || !isNonempty(rel.id) || !isNonempty(rel.targetId) || !isNonempty(rel.predicate))
      fail(`ПМО ${obj.id}: неверная relation.`);
    if (relationIds.has(rel.id)) fail(`ПМО ${obj.id}: дублирующаяся relation.id ${rel.id}.`);
    relationIds.add(rel.id);
  }
  const g = obj.geometry;
  if (!isRecord(g)) fail(`ПМО ${obj.id}: geometry должен быть объектом.`);
  if (g.type === 'skeleton') {
    if (!isRecord(g.points)) fail(`ПМО ${obj.id}: skeleton.points должен быть объектом.`);
    for (const [id, point] of Object.entries(g.points)) {
      if (!isNonempty(id) || !isPoint(point)) fail(`ПМО ${obj.id}: некорректная точка ${id}.`);
    }
    if (!Array.isArray(g.edges)) fail(`ПМО ${obj.id}: skeleton.edges должен быть массивом.`);
    const edgeIds = new Set<string>();
    for (const edge of g.edges) {
      if (!isRecord(edge) || !isNonempty(edge.id) || !isNonempty(edge.from) || !isNonempty(edge.to))
        fail(`ПМО ${obj.id}: неверное ребро.`);
      if (edgeIds.has(edge.id)) fail(`ПМО ${obj.id}: повторяется edge.id ${edge.id}.`);
      if (!(edge.from in g.points) || !(edge.to in g.points))
        fail(`ПМО ${obj.id}: ребро ${edge.id} ссылается на отсутствующую точку.`);
      if (edge.from === edge.to) fail(`ПМО ${obj.id}: ребро ${edge.id} замкнуто на ту же точку.`);
      if (edge.directed !== undefined && typeof edge.directed !== 'boolean')
        fail(`ПМО ${obj.id}: edge.directed должен быть boolean.`);
      edgeIds.add(edge.id);
    }
  } else if (g.type === 'paint') {
    if (!Array.isArray(g.strokes)) fail(`ПМО ${obj.id}: paint.strokes должен быть массивом.`);
    const strokeIds = new Set<string>();
    for (const stroke of g.strokes) {
      if (!isRecord(stroke) || !isNonempty(stroke.id) ||
          typeof stroke.radius !== 'number' || !Number.isFinite(stroke.radius) || stroke.radius <= 0 ||
          typeof stroke.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(stroke.color) ||
          !Array.isArray(stroke.points) || stroke.points.length < 1 || !stroke.points.every(isPoint))
        fail(`ПМО ${obj.id}: неверный мазок раскраски.`);
      if (strokeIds.has(stroke.id)) fail(`ПМО ${obj.id}: повторяется stroke.id ${stroke.id}.`);
      strokeIds.add(stroke.id);
    }
  } else {
    fail(`ПМО ${obj.id}: geometry.type должен быть skeleton или paint.`);
  }
  return input as unknown as SpatialMetaObject;
}

export function validateSpatialRegistry(value: unknown): SpatialRegistry {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.coordinateSpace !== 'world' || !Array.isArray(value.objects))
    fail('Неверный реестр: ожидается {schemaVersion:1, coordinateSpace:"world", objects:[]}.');
  const objects: SpatialMetaObject[] = value.objects.map(validateSpatialObject);
  const ids = new Set<string>();
  for (const obj of objects) {
    if (ids.has(obj.id)) fail(`Дублирующийся id ПМО: ${obj.id}.`);
    ids.add(obj.id);
  }
  for (const obj of objects) {
    for (const rel of obj.relations) {
      if (!ids.has(rel.targetId)) fail(`ПМО ${obj.id}: relation указывает на отсутствующий ПМО ${rel.targetId}.`);
    }
  }
  return value as unknown as SpatialRegistry;
}

function emit(next: Partial<SpatialSnapshot>) {
  snapshot = { ...snapshot, ...next, revision: snapshot.revision + 1,
    canUndo: past.length > 0, canRedo: future.length > 0 };
  listeners.forEach(l => l());
}
function persist(reg: SpatialRegistry) {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(reg)); }
  catch { /* Export JSON remains available if browser storage is blocked. */ }
}
function bootstrap() {
  if (initialized) return;
  initialized = true;
  const installed = validateSpatialRegistry(installedAuthoredPmo);
  // The installed JSON is the explicit default authority for this revision.
  // Existing localStorage may contain the previous 37/38-object editor copy.
  try {
    const storage = typeof localStorage !== 'undefined' ? localStorage : null;
    const isPublished = storage?.getItem(PUBLISHED_PMO_MARKER) === PUBLISHED_PMO_REVISION;
    if (!isPublished) {
      const previous = storage?.getItem(STORAGE_KEY);
      // Back up the previous browser registry before replacement, even if it is
      // invalid JSON: the user must still be able to recover their work.
      if (previous && storage) storage.setItem(PREVIOUS_BROWSER_PMO_BACKUP, previous);
      snapshot = { ...snapshot, registry: installed };
      if (storage) {
        storage.setItem(STORAGE_KEY, JSON.stringify(installed));
        storage.setItem(PUBLISHED_PMO_MARKER, PUBLISHED_PMO_REVISION);
      }
      if (typeof console !== 'undefined') console.info(
        'RRH_PMO_USER_PAINT_PUBLISHED', PUBLISHED_PMO_REVISION,
        'objects', installed.objects.length);
    } else {
      const saved = storage?.getItem(STORAGE_KEY);
      snapshot = { ...snapshot, registry: saved
        ? validateSpatialRegistry(JSON.parse(saved)) : installed };
    }
  } catch (e) {
    // Never resurrect the stale browser PMO after a failed migration.
    // The old browser storage, if intact, remains recoverable.
    snapshot = { ...snapshot, registry: installed,
      error: `Не удалось обновить браузерный PMO: ${String(e)}` };
  }
}
export function getSpatialSnapshot(): SpatialSnapshot { bootstrap(); return snapshot; }
export function subscribeSpatial(listener: () => void): () => void {
  bootstrap(); listeners.add(listener); return () => listeners.delete(listener);
}
function commit(reg: SpatialRegistry) {
  bootstrap();
  validateSpatialRegistry(reg);
  past.push(snapshot.registry);
  if (past.length > MAX_HISTORY) past.shift();
  future = [];
  persist(reg);
  emit({ registry: reg, error: null });
}
export function setSpatialSelection(id: string | null) {
  bootstrap();
  emit({ selectedId: id, tool: 'select', error: null });
}
export function setSpatialTool(tool: SpatialTool) { bootstrap(); emit({ tool, error: null }); }
export function setSpatialBrushRadius(radius: number) {
  if (!Number.isFinite(radius) || radius <= 0) return;
  bootstrap(); emit({ brushRadius: radius });
}
export function setSpatialBrushColor(color: string) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return;
  bootstrap(); emit({ brushColor: color });
}
export function setSpatialError(message: string | null) { bootstrap(); emit({ error: message }); }
export function createSpatialObject(kind: 'skeleton' | 'paint') {
  bootstrap();
  const id = newSpatialId('pmo');
  const obj: SpatialMetaObject = {
    id, name: kind === 'skeleton' ? 'Новый скелет' : 'Новая раскраска',
    geometry: kind === 'skeleton' ? { type: 'skeleton', points: {}, edges: [] }
      : { type: 'paint', strokes: [] },
    metadata: {}, relations: [], visible: true, revision: 0
  };
  commit({ ...snapshot.registry, objects: [...snapshot.registry.objects, obj] });
  emit({ selectedId: id, tool: kind === 'skeleton' ? 'point' : 'paint' });
}
export function replaceSpatialObject(id: string, next: SpatialMetaObject) {
  bootstrap();
  validateSpatialObject(next);
  if (next.id !== id) fail('id существующего ПМО неизменяем; создайте новый объект или измените реестр целиком.');
  const objects = snapshot.registry.objects.map(o => o.id === id ? next : o);
  if (!objects.some(o => o.id === id)) fail('ПМО не найден.');
  commit({ ...snapshot.registry, objects });
}
export function deleteSpatialObject(id: string) {
  bootstrap();
  const references = snapshot.registry.objects.filter(o => o.id !== id && o.relations.some(r => r.targetId === id));
  if (references.length) fail('Сначала удалите отношения к ПМО: ' + references.map(o => o.name).join(', '));
  commit({ ...snapshot.registry, objects: snapshot.registry.objects.filter(o => o.id !== id) });
  emit({ selectedId: null, tool: 'select' });
}
export function renameSpatialObject(id: string, name: string) {
  if (!name.trim()) fail('Имя не может быть пустым.');
  const obj = getSpatialSnapshot().registry.objects.find(o => o.id === id);
  if (!obj) fail('ПМО не найден.');
  replaceSpatialObject(id, { ...obj, name: name.trim(), revision: obj.revision + 1 });
}
export function toggleSpatialObject(id: string) {
  const obj = getSpatialSnapshot().registry.objects.find(o => o.id === id);
  if (obj) replaceSpatialObject(id, { ...obj, visible: !obj.visible, revision: obj.revision + 1 });
}
export function handleSpatialPick(point: SpatialPoint) {
  bootstrap();
  if (!isPoint(point) || !snapshot.selectedId) return;
  const obj = snapshot.registry.objects.find(o => o.id === snapshot.selectedId);
  if (!obj) return;
  if (obj.geometry.type === 'skeleton' && snapshot.tool === 'point') {
    const pid = newSpatialId('pt');
    replaceSpatialObject(obj.id, { ...obj, revision: obj.revision + 1,
      geometry: { ...obj.geometry, points: { ...obj.geometry.points,
        [pid]: point.map(n => Number(n.toFixed(4))) as SpatialPoint } } });
  } else if (obj.geometry.type === 'paint' && snapshot.tool === 'paint') {
    const strokeId = newSpatialId('stroke');
    replaceSpatialObject(obj.id, { ...obj, revision: obj.revision + 1,
      geometry: { ...obj.geometry, strokes: [...obj.geometry.strokes,
        { id: strokeId, radius: snapshot.brushRadius, color: snapshot.brushColor,
          points: [point.map(n => Number(n.toFixed(4))) as SpatialPoint] }] } });
  }
}
export function connectSpatialPoints(objectId: string, from: string, to: string, directed: boolean) {
  const obj = getSpatialSnapshot().registry.objects.find(o => o.id === objectId);
  if (!obj || obj.geometry.type !== 'skeleton') fail('Ожидается скелет.');
  if (!obj.geometry.points[from] || !obj.geometry.points[to] || from === to)
    fail('Выберите две разные существующие точки.');
  replaceSpatialObject(objectId, { ...obj, revision: obj.revision + 1,
    geometry: { ...obj.geometry, edges: [...obj.geometry.edges,
      { id: newSpatialId('edge'), from, to, directed }] } });
}
export function deleteSpatialPoint(objectId: string, pointId: string) {
  const obj = getSpatialSnapshot().registry.objects.find(o => o.id === objectId);
  if (!obj || obj.geometry.type !== 'skeleton') fail('Ожидается скелет.');
  const points = { ...obj.geometry.points };
  delete points[pointId];
  replaceSpatialObject(objectId, { ...obj, revision: obj.revision + 1,
    geometry: { ...obj.geometry, points, edges: obj.geometry.edges.filter(e => e.from !== pointId && e.to !== pointId) } });
}
export function deleteSpatialEdge(objectId: string, edgeId: string) {
  const obj = getSpatialSnapshot().registry.objects.find(o => o.id === objectId);
  if (!obj || obj.geometry.type !== 'skeleton') fail('Ожидается скелет.');
  replaceSpatialObject(objectId, { ...obj, revision: obj.revision + 1,
    geometry: { ...obj.geometry, edges: obj.geometry.edges.filter(e => e.id !== edgeId) } });
}
export function replaceSpatialRegistry(reg: SpatialRegistry) {
  commit(validateSpatialRegistry(reg));
  emit({ selectedId: null, tool: 'select' });
}
export function undoSpatial() {
  bootstrap(); if (!past.length) return;
  future.push(snapshot.registry);
  const registry = past.pop()!;
  persist(registry); emit({ registry, error: null });
}
export function redoSpatial() {
  bootstrap(); if (!future.length) return;
  past.push(snapshot.registry);
  const registry = future.pop()!;
  persist(registry); emit({ registry, error: null });
}

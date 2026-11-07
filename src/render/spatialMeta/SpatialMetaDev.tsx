import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type ChangeEvent } from 'react';
import * as THREE from 'three';
import { getPublishedPmoRegistry } from './pmoServiceLayout';
import {
  connectSpatialPoints, createSpatialObject, deleteSpatialEdge, deleteSpatialObject,
  deleteSpatialPoint, getSpatialSnapshot, redoSpatial, renameSpatialObject,
  replaceSpatialObject, replaceSpatialRegistry, setSpatialBrushColor,
  setSpatialBrushRadius, setSpatialError, setSpatialSelection, setSpatialTool,
  subscribeSpatial, toggleSpatialObject, undoSpatial, validateSpatialObject,
  validateSpatialRegistry,
  type SpatialMetaObject, type SpatialPoint
} from './registry';

const panelStyle: CSSProperties = {
  position: 'absolute', top: 12, right: 12, width: 365, maxWidth: 'calc(100% - 24px)',
  maxHeight: 'calc(100% - 24px)', overflowY: 'auto', zIndex: 90, boxSizing: 'border-box',
  background: 'rgba(8, 21, 28, .97)', color: '#e9f4f7', padding: 14,
  border: '1px solid #46606d', borderRadius: 12, font: '12px/1.5 system-ui, sans-serif',
  boxShadow: '0 7px 24px #0007'
};
const buttonStyle: CSSProperties = {
  cursor: 'pointer', background: '#243d48', color: '#f5fcff', border: '1px solid #4c6976',
  padding: '5px 8px', borderRadius: 5, font: 'inherit'
};
const inputStyle: CSSProperties = {
  color: '#f5fcff', background: '#182e38', border: '1px solid #4c6976',
  borderRadius: 5, padding: '5px 6px', minWidth: 0, boxSizing: 'border-box', font: 'inherit'
};
const rowStyle: CSSProperties = { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' };
function asMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function tryEdit(action: () => void) { try { action(); } catch (e) { setSpatialError(asMessage(e)); } }
function serialize(obj: unknown): string { return JSON.stringify(obj, null, 2); }
function exportJson(data: unknown, filename: string) {
  const blob = new Blob([serialize(data)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename;
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
}
function Segment({ from, to, color = '#90eaff' }: { from: SpatialPoint; to: SpatialPoint; color?: string }) {
  const shape = useMemo(() => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to);
    const direction = b.clone().sub(a);
    return { position: a.add(b).multiplyScalar(0.5),
      quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()),
      length: direction.length() };
  }, [from[0], from[1], from[2], to[0], to[1], to[2]]);
  if (shape.length < 0.0001) return null;
  return <mesh position={shape.position} quaternion={shape.quaternion} raycast={() => null}>
    <cylinderGeometry args={[0.025, 0.025, shape.length, 5]} />
    <meshBasicMaterial color={color} depthTest={false} />
  </mesh>;
}

/** Isolated R3F projection of authoring metadata. Gameplay systems never consult this component. */
export function SpatialMetaOverlay() {
  const { selectedId } = useSyncExternalStore(subscribeSpatial, getSpatialSnapshot);
  // An empty editor registry is not an empty game world: production uses the
  // immutable authored fallback. Visual inspection must show that same source.
  const { registry } = getPublishedPmoRegistry();
  return <group name="rrh-spatial-dev-overlay">
    {registry.objects.filter(obj => obj.visible).map(obj => {
      const selected = obj.id === selectedId;
      if (obj.geometry.type === 'skeleton') {
        const points = obj.geometry.points;
        return <group key={obj.id}>
          {obj.geometry.edges.map(e => <Segment key={e.id} from={points[e.from]} to={points[e.to]}
            color={selected ? '#fff17f' : '#5fe4ee'} />)}
          {Object.entries(points).map(([id, point]) => <mesh key={id} position={point} raycast={() => null}>
            <sphereGeometry args={[selected ? 0.095 : 0.068, 12, 8]} />
            <meshBasicMaterial color={selected ? '#ffd45d' : '#62dbea'} depthTest={false} />
          </mesh>)}
        </group>;
      }
      return <group key={obj.id}>
        {obj.geometry.strokes.flatMap(s => s.points.map((p, i) =>
          <mesh key={`${s.id}-${i}`} position={p} raycast={() => null}>
            <sphereGeometry args={[s.radius, 16, 10]} />
            <meshBasicMaterial color={s.color} transparent opacity={selected ? 0.22 : 0.12}
              depthTest={true} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>))}
      </group>;
    })}
  </group>;
}

/** Non-mutating view of the exact PMO source used by the navigation scope.
 * The stored browser editor is NOT implicitly hydrated: importing the published
 * registry is an explicit, reversible user action. */
export function PublishedPmoRegistryPreview({inPathfindingTest = false}: {inPathfindingTest?: boolean}) {
  const snapshot = useSyncExternalStore(subscribeSpatial, getSpatialSnapshot);
  const { registry, authority } = getPublishedPmoRegistry();
  const [filter, setFilter] = useState('');
  const [showFullJson, setShowFullJson] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const filtered = registry.objects.filter(o =>
    (o.name + ' ' + o.id + ' ' + o.geometry.type).toLowerCase().includes(filter.toLowerCase()));
  const current = registry.objects.find(o => o.id === snapshot.selectedId) ??
    registry.objects.find(o => o.name === 'building_3') ?? filtered[0] ?? null;
  const previewStyle: CSSProperties = inPathfindingTest
    ? {...panelStyle, left: 12, right: 'auto', top: 58, maxHeight: 'calc(100% - 70px)'}
    : panelStyle;
  return <aside aria-label="Published PMO registry inspector" style={previewStyle}>
    <div style={{...rowStyle, justifyContent: 'space-between'}}>
      <strong style={{fontSize:15}}>Реестр PMO · {registry.objects.length} объектов</strong>
      <button type="button" onClick={() => setExpanded(v => !v)} style={buttonStyle}>
        {expanded ? 'Свернуть' : 'Развернуть'}
      </button>
    </div>
    <div style={{fontSize:11, color:'#a7d6de', marginTop:5}}>
      Источник: {authority === 'authored-snapshot' ? 'канонический авторский снимок (только чтение)' : 'локальный реестр браузера'}
    </div>
    {!expanded ? null : <>
      <p style={{color:'#d8e9f0', margin:'9px 0'}}>
        Эти объекты использует навигация. Просмотр и экспорт ничего не изменяют.
      </p>
      <input aria-label="Найти PMO в реестре" value={filter} onChange={e => setFilter(e.target.value)}
        placeholder="building_3, building_8, bridge, lift, zone…"
        style={{...inputStyle, width:'100%'}} />
      <div style={{maxHeight:175, overflowY:'auto', marginTop:8, display:'grid', gap:4}}>
        {filtered.map(o => <button key={o.id} type="button" onClick={() => setSpatialSelection(o.id)}
          style={{...buttonStyle, textAlign:'left', background:current?.id===o.id?'#345c65':'#243d48'}}>
          {o.geometry.type==='skeleton'?'◇':'◉'} {o.name}
          <span style={{opacity:0.7}}> · {o.geometry.type === 'skeleton'
            ? Object.keys(o.geometry.points).length+' точек' : o.geometry.strokes.length+' мазков'}</span>
        </button>)}
        {!filtered.length && <div>Нет совпадений</div>}
      </div>
      <div style={{...rowStyle, justifyContent:'space-between', marginTop:10}}>
        <strong>{showFullJson?'Весь реестр':current?.name ?? 'Выбери объект'}</strong>
        <button type="button" onClick={() => setShowFullJson(v => !v)} style={buttonStyle}>
          {showFullJson?'JSON объекта':'JSON реестра'}
        </button>
      </div>
      <textarea readOnly spellCheck={false} aria-label="Published PMO JSON"
        value={serialize(showFullJson?registry:current)}
        style={{...inputStyle, width:'100%', height:215, marginTop:6, resize:'vertical', fontFamily:'monospace', fontSize:11}} />
      <div style={{...rowStyle, marginTop:8}}>
        <button type="button" style={buttonStyle}
          onClick={() => exportJson(registry,'rrh-published-pmo-registry.json')}>Экспорт реестра JSON</button>
        {current && <button type="button" style={buttonStyle}
          onClick={() => exportJson(current,`${current.id}.json`)}>Экспорт объекта</button>}
      </div>
      <div style={{fontSize:11, marginTop:10, padding:8, border:'1px solid #40545b', borderRadius:6}}>
        Для редактирования сначала явно создай локальную копию. Она сохраняется в браузере;
        исходный авторский JSON не перезаписывается. После импорта навигация читает эту копию.
      </div>
      <button type="button" style={{...buttonStyle, marginTop:9, width:'100%'}}
        onClick={() => {
          if (window.confirm('Скопировать авторский PMO в локальный редактор браузера? Навигация после этого начнёт использовать локальную копию.')) {
            tryEdit(() => replaceSpatialRegistry(validateSpatialRegistry(JSON.parse(serialize(registry)))));
          }
        }}>Создать редактируемую копию PMO</button>
    </>}
  </aside>;
}

export function SpatialMetaDevPanel({inPathfindingTest = false}: {inPathfindingTest?: boolean} = {}) {
  const snapshot = useSyncExternalStore(subscribeSpatial, getSpatialSnapshot);
  const { registry, selectedId, tool, brushColor, brushRadius, canUndo, canRedo, error } = snapshot;
  const panelPosition: CSSProperties = inPathfindingTest
    ? {...panelStyle, left:12, right:'auto', top:58, maxHeight:'calc(100% - 70px)'} : panelStyle;
  const selected = registry.objects.find(o => o.id === selectedId) ?? null;
  const [tab, setTab] = useState<'edit' | 'json' | 'registry'>('edit');
  const [draft, setDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [edgeFrom, setEdgeFrom] = useState('');
  const [edgeTo, setEdgeTo] = useState('');
  const [edgeDirected, setEdgeDirected] = useState(false);
  const [registryDraft, setRegistryDraft] = useState('');
  const [registryDirty, setRegistryDirty] = useState(false);
  useEffect(() => { if (!dirty) setDraft(selected ? serialize(selected) : ''); }, [selected, dirty]);
  useEffect(() => { setDirty(false); setDraft(selected ? serialize(selected) : ''); setNameDraft(selected?.name ?? '');
    setEdgeFrom(''); setEdgeTo(''); }, [selectedId]);
  useEffect(() => { if (!registryDirty) setRegistryDraft(serialize(registry)); }, [registry, registryDirty]);
  useEffect(() => { setRegistryDirty(false); setRegistryDraft(serialize(registry)); }, [tab === 'registry']);

  const pointIds = selected?.geometry.type === 'skeleton' ? Object.keys(selected.geometry.points) : [];
  const button = (label: string, fn: () => void, disabled = false) =>
    <button type="button" disabled={disabled} onClick={() => tryEdit(fn)} style={{ ...buttonStyle,
      opacity: disabled ? 0.45 : 1 }}>{label}</button>;
  const hr = <hr style={{ border: 0, borderTop: '1px solid #34505b', margin: '12px 0' }} />;
  if (!registry.objects.length) return <PublishedPmoRegistryPreview inPathfindingTest={inPathfindingTest}/>;
  return <aside aria-label="Spatial metadata DEV editor" style={panelPosition}>
    <div style={{ ...rowStyle, justifyContent: 'space-between' }}>
      <strong style={{ fontSize: 15 }}>Spatial Meta DEV</strong>
      <span style={{ color: '#9dced1' }}>Локальная копия · XYZ</span>
    </div>
    <div style={{ fontSize: 11, opacity: 0.75 }}>Только ?spatialDev=1 · сохраняется локально в браузере</div>
    {hr}
    <div style={{ ...rowStyle, justifyContent: 'space-between' }}>
      <b>Реестр · {registry.objects.length}</b>
      <div style={rowStyle}>
        {button('+ Скелет', () => createSpatialObject('skeleton'))}
        {button('+ Раскраска', () => createSpatialObject('paint'))}
      </div>
    </div>
    <div style={{ marginTop: 6, display: 'grid', gap: 4, maxHeight: 170, overflowY: 'auto' }}>
      {registry.objects.map(obj => <div key={obj.id} style={{ ...rowStyle,
        padding: 5, borderRadius: 5, border: obj.id === selectedId ? '1px solid #9ad6b5' : '1px solid #334a54' }}>
        <button type="button" onClick={() => setSpatialSelection(obj.id)}
          style={{ ...buttonStyle, textAlign: 'left', flex: 1, overflowWrap: 'anywhere' }}>
          {obj.geometry.type === 'skeleton' ? '◇' : '◉'} {obj.name}
        </button>
        <button type="button" aria-label="Переключить видимость ПМО" title="Видимость"
          onClick={() => tryEdit(() => toggleSpatialObject(obj.id))} style={buttonStyle}>{obj.visible ? '◉' : '○'}</button>
      </div>)}
      {!registry.objects.length && <div style={{ opacity: 0.7 }}>Создай первый ПМО кнопкой +.</div>}
    </div>
    <div style={{ ...rowStyle, marginTop: 9 }}>
      {button('Undo', undoSpatial, !canUndo)} {button('Redo', redoSpatial, !canRedo)}
      {button('Экспорт всего JSON', () => exportJson(registry, 'resort-spatial-registry.json'))}
      <label style={{ ...buttonStyle, cursor: 'pointer' }}>Импорт JSON
        <input type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={async (e: ChangeEvent<HTMLInputElement>) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          if (!file) return;
          try {
            const raw = await file.text();
            tryEdit(() => replaceSpatialRegistry(validateSpatialRegistry(JSON.parse(raw))));
          } catch (reason) { setSpatialError(asMessage(reason)); }
          finally { input.value = ''; }
        }} />
      </label>
    </div>
    {hr}
    <div style={rowStyle}>
      {button('Редактор', () => setTab('edit'))}
      {button('JSON ПМО', () => setTab('json'))}
      {button('JSON реестра', () => setTab('registry'))}
    </div>
    {tab === 'edit' && selected && <section style={{ marginTop: 10 }}>
      <div style={rowStyle}>
        <input aria-label="Имя ПМО" value={nameDraft} onChange={(e: ChangeEvent<HTMLInputElement>) => setNameDraft(e.target.value)} style={{ ...inputStyle, flex: 1 }}/>
        {button('Имя ✓', () => renameSpatialObject(selected.id, nameDraft))}
        {button('Удалить ПМО', () => {
          if (window.confirm(`Удалить ПМО «${selected.name}»?`)) deleteSpatialObject(selected.id);
        })}
      </div>
      <div style={{ opacity: 0.65, marginTop: 4, overflowWrap: 'anywhere' }}>id: {selected.id}</div>
      {selected.geometry.type === 'skeleton' ? <>
        <p>Точки: <b>{pointIds.length}</b> · связи: <b>{selected.geometry.edges.length}</b></p>
        {button(tool === 'point' ? '● Добавление точек включено' : '+ Разместить точки кликом', () => setSpatialTool(tool === 'point' ? 'select' : 'point'))}
        <div style={{ marginTop: 7, maxHeight: 115, overflowY: 'auto' }}>
          {pointIds.map(id => <div key={id} style={{ ...rowStyle, marginBottom: 3 }}>
            <code style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }} title={id}>{id.slice(0, 16)}… {serialize(selected.geometry.type === 'skeleton' ? selected.geometry.points[id] : [])}</code>
            {button('×', () => deleteSpatialPoint(selected.id, id))}
          </div>)}
        </div>
        <b style={{ display: 'block', marginTop: 9 }}>Связать точки вручную</b>
        <div style={{ ...rowStyle, marginTop: 5 }}>
          <select aria-label="Начало связи" value={edgeFrom} onChange={(e: ChangeEvent<HTMLSelectElement>) => setEdgeFrom(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
            <option value="">Откуда...</option>{pointIds.map(id => <option key={id} value={id}>{id.slice(0, 16)}</option>)}
          </select>
          <select aria-label="Конец связи" value={edgeTo} onChange={(e: ChangeEvent<HTMLSelectElement>) => setEdgeTo(e.target.value)} style={{ ...inputStyle, flex: 1 }}>
            <option value="">Куда...</option>{pointIds.map(id => <option key={id} value={id}>{id.slice(0, 16)}</option>)}
          </select>
          {button('Связать', () => connectSpatialPoints(selected.id, edgeFrom, edgeTo, edgeDirected), !edgeFrom || !edgeTo)}
        </div>
        <label style={{ display: 'block', marginTop: 5 }}>
          <input type="checkbox" checked={edgeDirected} onChange={(e: ChangeEvent<HTMLInputElement>) => setEdgeDirected(e.target.checked)} /> Направленная связь
        </label>
        {selected.geometry.edges.map(e => <div key={e.id} style={{ ...rowStyle, marginTop: 4 }}>
          <code style={{ flex: 1 }}>{e.from.slice(0, 8)} → {e.to.slice(0, 8)} {e.directed ? '(one-way)' : '(both)'}</code>
          {button('×', () => deleteSpatialEdge(selected.id, e.id))}
        </div>)}
      </> : <>
        <p>Мазки: <b>{selected.geometry.strokes.length}</b>. Клик по острову ставит цветной объёмный маркер радиуса кисти.</p>
        {button(tool === 'paint' ? '● Кисть включена' : 'Кисть по клику', () => setSpatialTool(tool === 'paint' ? 'select' : 'paint'))}
        <div style={{ ...rowStyle, marginTop: 9 }}>
          <label>Радиус <input type="number" step="0.1" min="0.01" max="20" value={brushRadius}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setSpatialBrushRadius(Number(e.target.value))} style={{ ...inputStyle, width: 70 }} /></label>
          <label>Цвет <input type="color" value={brushColor} onChange={(e: ChangeEvent<HTMLInputElement>) => setSpatialBrushColor(e.target.value)} /></label>
        </div>
        <p style={{ fontSize: 11, opacity: 0.7 }}>Это семантические 3D-отметки/области, не изменение текстуры GLB и пока не точная decal-проекция по треугольникам.</p>
      </>}
    </section>}
    {tab === 'edit' && !selected && <p>Выбери существующий ПМО либо создай новый.</p>}
    {tab === 'json' && <section style={{ marginTop: 10 }}>
      {!selected ? <p>Выбери ПМО.</p> : <>
        <p>Изменения применяются только после проверки. Неизвестные поля сохраняются.</p>
        <textarea spellCheck={false} aria-label="JSON выбранного ПМО" value={draft}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => { setDraft(e.target.value); setDirty(true); }}
          style={{ ...inputStyle, width: '100%', height: 245, resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}/>
        <div style={{ ...rowStyle, marginTop: 7 }}>
          {button('Проверить', () => { validateSpatialObject(JSON.parse(draft)); setSpatialError('JSON ПМО корректен.'); })}
          {button('Применить JSON', () => { replaceSpatialObject(selected.id,
            validateSpatialObject(JSON.parse(draft)) as SpatialMetaObject); setDirty(false); })}
          {button('Сбросить правки', () => { setDraft(serialize(selected)); setDirty(false); })}
          {button('Скачать ПМО', () => exportJson(selected, `${selected.id}.json`))}
        </div>
      </>}
    </section>}
    {tab === 'registry' && <section style={{ marginTop: 10 }}>
      <p>Полный реестр: можно вручную изменить/добавить ПМО и отношения между ними.</p>
      <textarea spellCheck={false} aria-label="JSON всего пространственного реестра" value={registryDraft}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => { setRegistryDraft(e.target.value); setRegistryDirty(true); }}
        style={{ ...inputStyle, width: '100%', height: 245, resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }}/>
      <div style={{ ...rowStyle, marginTop: 7 }}>
        {button('Проверить', () => { validateSpatialRegistry(JSON.parse(registryDraft)); setSpatialError('Реестр JSON корректен.'); })}
        {button('Применить реестр', () => { replaceSpatialRegistry(validateSpatialRegistry(JSON.parse(registryDraft))); setRegistryDirty(false); })}
        {button('Сбросить правки', () => { setRegistryDraft(serialize(registry)); setRegistryDirty(false); })}
      </div>
    </section>}
    {error && <p style={{ color: error.includes('корректен') ? '#8fe6a5' : '#ffb097', overflowWrap: 'anywhere' }}>
      {error} <button type="button" onClick={() => setSpatialError(null)} style={buttonStyle}>×</button>
    </p>}
    <div style={{ marginTop: 12, opacity: 0.7, fontSize: 11 }}>
      Координаты: мировые XYZ от текущего renderer pick. Регистр не управляет геймплеем.
      Сделай экспорт JSON для переноса между браузерами или перед заменой геометрии острова.
    </div>
  </aside>;
}

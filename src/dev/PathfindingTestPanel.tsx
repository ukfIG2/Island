import {useState,type CSSProperties} from 'react';
import {INITIAL_TEST_STATUS,type PathfindingTestStatus} from './PathfindingTestScene';
const panel:CSSProperties={position:'absolute',top:12,right:12,zIndex:40,width:300,maxWidth:'calc(100% - 24px)',
  padding:14,background:'rgba(12,27,39,.95)',border:'1px solid #678ba4',borderRadius:12,
  color:'#f1f6fa',fontFamily:'system-ui, sans-serif',fontSize:12,boxShadow:'0 9px 30px #0008'};
const btn:CSSProperties={display:'block',width:'100%',marginTop:9,padding:'10px 8px',borderRadius:8,
  border:'1px solid #8ab9d3',background:'#1b6080',color:'white',fontWeight:600,cursor:'pointer'};
export function PathfindingTestPanel({status,onWave,onShuffle,onFullAudit,onFullWave,onCrowd}:{status:PathfindingTestStatus|null;onWave:()=>void;onShuffle:()=>void;onFullAudit:()=>void;onFullWave:()=>void;onCrowd:()=>void}){
  status=status??INITIAL_TEST_STATUS;
  const enabled=status.phase==='ready';
  const [copyResult,setCopyResult]=useState('Скопировать диагностику');
  const copy=()=>{
    if(!navigator.clipboard){setCopyResult('Буфер обмена недоступен');return;}
    void navigator.clipboard.writeText(JSON.stringify(status,null,2))
      .then(()=>setCopyResult('Диагностика скопирована'))
      .catch(()=>setCopyResult('Не удалось скопировать'));
  };
  return <section style={panel} aria-label="RRH pathfinding test controls" data-testid="pathfinding-panel">
    <strong style={{fontSize:15}}>RRH · Pathfinding</strong>
    <div style={{marginTop:6,color:'#abc7da'}}>Тот же остров и 3D-движок игры · DEV, без записи в экономику</div>
    <button type="button" style={btn} disabled={!enabled || status.queued>0 || status.crowd?.phase==='running' || Boolean(status.fullWave&&status.fullWave.phase!=='complete'&&status.fullWave.phase!=='blocked')} onClick={onWave} data-testid="spawn-wave">{status.queued>0 ? `Выпуск волны · осталось ${status.queued}` : 'Создать волну · 12 гостей'}</button>
    <button type="button" style={{...btn,background:'#226c5a'}} disabled={!enabled||Boolean(status.fullAudit?.running)}
      onClick={onFullAudit} data-testid="pmo-full-path-audit">
      {status.fullAudit?.running
        ? `Полный аудит · ${status.fullAudit.report?.totals.completed??0}/${status.fullAudit.report?.totals.planned??90}`
        : 'Полный быстрый аудит · 90 направлений'}
    </button>
    {status.fullAudit?.report?<section data-testid="pmo-full-audit-result" style={{maxHeight:180,overflowY:'auto',whiteSpace:'pre-wrap',padding:8,border:'1px solid #537d77',marginTop:6}}>
      <strong>PMO matrix · {status.fullAudit.report.totals.completed}/{status.fullAudit.report.totals.planned}</strong>
      <div>Прибыли {status.fullAudit.report.totals.arrived} · блок {status.fullAudit.report.totals.blocked} · нет связи {status.fullAudit.report.totals.unreachable} · отказ {status.fullAudit.report.totals.rejected} · timeout {status.fullAudit.report.totals.timeout}</div>
      {status.fullAudit.report.endpoints.map(site=><div key={site.sourceId}>{site.name}: {site.connectedToBeach?'BEACH_CONNECTED':site.reason??'ISOLATED'}</div>)}
      <small>Кнопка «Скопировать диагностику» включает полный JSON с координатами всех маршрутов.</small>
    </section>:null}
    {status.fullAudit?.error?<div style={{color:'#ffb1af'}}>{status.fullAudit.error}</div>:null}
    <button type="button" style={{...btn,background:'#38704f'}} disabled={!enabled||Boolean(status.fullWave&&status.fullWave.phase!=='complete'&&status.fullWave.phase!=='blocked')||status.crowd?.phase==='running'}
      onClick={onFullWave} data-testid="full-wave-test">Full Wave Test · ferry + 12 guests + queues + return</button>
    {status.fullWave ? <div data-testid="full-wave-status" style={{marginTop:8,color:status.fullWave.phase==='blocked'?'#ffacac':'#b6e6d0',fontVariantNumeric:'tabular-nums'}}>
      Phase: {status.fullWave.phase} · Disembarked {status.fullWave.disembarked}/12 · Queue {status.fullWave.queued} · Service {status.fullWave.servicing} · Served {status.fullWave.served} · Returning {status.fullWave.returning} · Boarded {status.fullWave.boarded}/12
      {status.fullWave.error?' | '+status.fullWave.error:''}
    </div>:null}
    <button type="button" style={{...btn,background:'#6b4634'}}
      disabled={!enabled||status.crowd?.phase==='running'||Boolean(status.fullWave&&status.fullWave.phase!=='complete'&&status.fullWave.phase!=='blocked')}
      onClick={onCrowd} data-testid="crowd-100-test">Crowd Stress Test · 100 одновременно (остров)</button>
    <button type="button" style={{...btn,background:'#267281'}}
      disabled={!enabled||status.crowd?.phase==='running'||Boolean(status.fullWave&&status.fullWave.phase!=='complete'&&status.fullWave.phase!=='blocked')}
      onClick={()=>{const u=new URL(window.location.href);u.searchParams.set('crowd','transport');window.history.replaceState(null,'',u.toString());onCrowd();}}
      data-testid="crowd-transport-100-test">Transport Full Wave · 100 пассажиров</button>
    {status.crowd?<div data-testid="crowd-100-status" style={{marginTop:7,padding:7,border:'1px solid #715c46',borderRadius:6,fontVariantNumeric:'tabular-nums',overflowWrap:'anywhere'}}>
      <strong>{status.crowd.phase.toUpperCase()} · {status.crowd.launched}/100 выпущено</strong>
      <div>Режим: {status.crowd.mode==='transport'?'ПАРОМ: ПОЛНАЯ ВОЛНА 100':status.crowd.mode==='distributed'?'100 ОДНОВРЕМЕННО на острове':'ПЛЯЖНЫЙ ШЛЮЗ · пропускная способность'}</div>
      <div>В пути: {status.crowd.active} · ждут проход: {status.crowd.waitingSpace} · {status.crowd.mode==='distributed'?'ожидают размещения':'ждут на пляже'}: {status.crowd.pendingBeach}</div>
      <div>Дошли: {status.crowd.arrived} · заблокированы: {status.crowd.blocked} · пик в пути: {status.crowd.peakActive} · пик ожидания: {status.crowd.peakWaitingSpace}</div>
      {status.crowd.mode==='distributed'
        ?<div>Параллельная нагрузка: пик {status.crowd.peakActive}/100 · реальные PMO-маршруты и коллизии</div>
        :<div>Пляжный шлюз: занято {status.crowd.bottleneckOccupied}/2 · очередь {status.crowd.bottleneckQueue} · отложено попыток {status.crowd.deferredByCapacity}</div>}
      {status.crowd.mode==='distributed'?<div>Ожидают сервис: {status.crowd.serviceQueued??0} · обслуживаются: {status.crowd.serviceActive??0} · обслужены: {status.crowd.served??0}</div>:null}
      {status.crowd.mode==='distributed'?<div>Личные PMO-позиции: {status.crowd.personalizedEndpoints??0} · отклонённые маршруты: {status.crowd.viaRoutes??0}</div>:null}
      <div>Ожидание более 8 с: {status.crowd.criticalWaiters} · подтверждённых перепланирований: {status.crowd.replans} · прогулок: {status.crowd.wanders}</div>
      <div>Время теста: {status.crowd.seconds.toFixed(1)} с</div>
      {status.crowd.congestionWitness?<div data-testid="crowd-congestion-witness" style={{fontSize:11,opacity:.8}}>Физический затор: {status.crowd.congestionWitness}</div>:null}
      {status.crowd.transport?<div data-testid="crowd-ferry-manifest" style={{marginTop:7,color:'#97edf7'}}>
      Паром: {status.crowd.transport.phase} · высадились {status.crowd.transport.disembarked}/100 ·
      сервис {status.crowd.transport.served} · обратно {status.crowd.transport.returning} ·
      сели {status.crowd.transport.boarded}/100 · физически заблокированы {status.crowd.transport.blocked} ·
      посещений {status.crowd.transport.visited}/100 · в очереди к лифту {status.crowd.transport.waitingHelper} ·
      физически идут {status.crowd.transport.walking} · ждут свободное место {status.crowd.transport.waitingSpace}
      {status.crowd.transport.error?<div data-testid="ferry-v6-3-cause" style={{marginTop:7,color:'#ffb7aa',overflowWrap:'anywhere'}}>
        Причина остановки: {status.crowd.transport.error}
      </div>:null}
      </div>:null}
      {status.crowd.error?<div style={{color:'#ffabab'}}>{status.crowd.error}</div>:null}
    </div>:null}
    <div style={{color:'#a3bdcc',marginTop:5}}>100 физических пешек одновременно на реальных PMO-позициях возле зданий. В тесте есть короткое обслуживание (3 места на здание) и очереди учёта; положение ожидающих — индивидуальные физически достижимые PMO-точки. Это не перенесено в Core игры. Для прежнего теста пропускной способности пляжа открой /pathfinding-test?crowd=beach.</div>
    <button type="button" style={{...btn,background:'#344c6d'}} disabled={!enabled || status.crowd?.phase==='running' || Boolean(status.fullWave&&status.fullWave.phase!=='complete'&&status.fullWave.phase!=='blocked')} onClick={onShuffle} data-testid="shuffle-buildings">Переставить 5 зданий</button>
    <button type="button" style={{...btn,background:'#644f4b'}}
      onClick={()=>window.location.reload()} data-testid="reset-pathfinding-test">
      Сбросить тест (очистить пешек)
    </button>
    <button type="button" style={{...btn,background:'#334857'}} onClick={copy} data-testid="copy-pmo-diagnostics">{copyResult}</button>
    <div role="status" aria-live="polite" style={{whiteSpace:'pre-wrap',paddingTop:12,lineHeight:1.55,color:status.phase==='blocked'?'#ffb1af':'#d6e7f2'}}>
      {status.message}
    </div>
    <div style={{marginTop:7,fontVariantNumeric:'tabular-nums'}}>
      PMO nodes: {status.nodes} · Buildings: {status.buildings}/5
      <div>Walking: {status.walking} · Waiting: {status.waiting} · Arrived: {status.arrived} · Blocked: {status.blocked}</div>
      <div>Spawn queued: {status.queued} · Confirmed moving: {status.moved}</div>
      <div>Layout seed: {status.seed || '—'}</div>
      <div style={{marginTop:7,color:'#9bc8eb'}}>{status.sourceAuthority}</div>
      <div data-testid="nine-site-audit" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',marginTop:6}}>{status.siteReport.replace(/ · /g,'\n')}</div>
      <div data-testid="motion-diagnostic" style={{marginTop:6,color:status.motionDiagnostic.startsWith('BLOCKED')||status.motionDiagnostic.startsWith('NO_MOVEMENT')?'#ffb1af':'#b1dacf',overflowWrap:'anywhere'}}>{status.motionDiagnostic}</div>
    </div>
    <small style={{display:'block',marginTop:9,color:'#a3bdcc'}}>Блокировка маршрута показывается как ошибка, а не маскируется прямым движением.</small>
  </section>;
}

/**
 * Isolated PMO lab page: GET /src/dev/pmo-lab.html on RRH Vite dev server.
 * Browser-only visual diagnostics; never imports canonical state or persistence.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { makeTerrainProjector } from '../render/spatialMeta/terrainProjector';
import { makePmoTerrainConnector } from '../render/spatialMeta/pmoNavigationWorld';
import { readPmoWalkAuthorization } from '../render/spatialMeta/pmoWorldBindings';
import { compilePmoBrushCorridors } from '../render/spatialMeta/pmoBrushCorridors';
import { PmoPedestrianRuntime } from '../render/spatialMeta/pmoPedestrianRuntime';
import { seedFromUrl, generatePmoDevBuildings, seededRandom } from './pmoDevBuildings';

const html = (id:string):HTMLElement => { const element=document.getElementById(id);if(!element)throw Error('MISSING_DOM_'+id);return element; };
const log = (message:string):void=> {html('diagnostics').textContent += `${message}\n`;};
const setText = (id:string, value:string):void => {html(id).textContent=value;};
const params = new URLSearchParams(window.location.search);
const seed = seedFromUrl(window.location.search,()=>crypto.getRandomValues(new Uint32Array(1))[0]);
const rand = seededRandom(seed ^ 0xf12410);
const number=(n:number):string=>Number.isFinite(n)?n.toFixed(2):'?';
const colorStatus=(status:string):string=>status==='READY'?'good':'bad';

html('regenerate').addEventListener('click',()=>window.location.assign(window.location.pathname));
html('repro').addEventListener('click',()=>window.location.assign(`${window.location.pathname}?seed=${seed}`));
setText('seed',`Seed: ${seed}${params.has('seed')?' (повторение сохранённого сценария)':' (новый на каждый reload)'}`);
setText('diagnostics','');

if (!import.meta.env.DEV) {
  setText('stats','Этот endpoint доступен только в Vite development.');
  throw Error('PMO_LAB_DISABLED_IN_PRODUCTION');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color('#153447');
scene.add(new THREE.HemisphereLight(0xe8f5ff,0x354347,2.5));
const direct = new THREE.DirectionalLight(0xffffff,2.2);
direct.position.set(5,9,3);scene.add(direct);
const camera = new THREE.PerspectiveCamera(51,1,0.01,150);
camera.position.set(8,7.5,10);
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
const canvasHost=html('canvas');canvasHost.append(renderer.domElement);
const controls = new OrbitControls(camera,renderer.domElement);
controls.target.set(0,-0.8,0);controls.enableDamping=true;
function resize():void {
  const width=canvasHost.clientWidth||window.innerWidth,height=canvasHost.clientHeight||600;
  camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);
}
resize();window.addEventListener('resize',resize);
html('topview').addEventListener('click',()=>{camera.position.set(0,13,0.01);controls.target.set(0,-1,0);controls.update();});
let actors: PmoPedestrianRuntime|null=null;
let instance: THREE.InstancedMesh|null=null;
let simulationTicks=0;
const matrix=new THREE.Object3D();
function frame():void {
  requestAnimationFrame(frame);
  if(actors && instance){
    const snapshots=actors.snapshots();instance.count=snapshots.length;
    snapshots.forEach((s,i)=>{
      matrix.position.set(s.position[0],s.position[1]+0.065,s.position[2]);
      matrix.rotation.set(0,0,0);matrix.scale.setScalar(1);matrix.updateMatrix();
      instance!.setMatrixAt(i,matrix.matrix);
      instance!.setColorAt(i,new THREE.Color(s.status==='arrived'?'#45dfb3':s.status==='blocked'?'#ff6262':'#f6d774'));
    });
    instance.instanceMatrix.needsUpdate=true;
    if(instance.instanceColor)instance.instanceColor.needsUpdate=true;
  }
  controls.update();renderer.render(scene,camera);
}
frame();

function labelSprite(text:string):THREE.Sprite {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle='rgba(12,28,38,.88)';ctx.fillRect(0,5,255,54);
  ctx.font='bold 22px system-ui';ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(text,128,41);
  const texture=new THREE.CanvasTexture(canvas);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));
  sprite.scale.set(0.85,0.21,1);return sprite;
}
function buildBox(index:number,where:readonly number[],name:string):void {
  const shades=['#ffca86','#a9e1f0','#d3b5f8','#94e0ba','#f0aabc'];
  const height=0.18+(index%3)*0.05;
  const box=new THREE.Mesh(new THREE.BoxGeometry(0.22,height,0.23),new THREE.MeshStandardMaterial({color:shades[index%shades.length],roughness:0.72}));
  box.position.set(where[0],where[1]+height/2,where[2]);scene.add(box);
  const tag=labelSprite(name);tag.position.set(where[0],where[1]+0.32,where[2]);scene.add(tag);
}
function routeLine(coords:readonly (readonly number[])[],reachable:boolean):void {
  const points=coords.map(p=>new THREE.Vector3(p[0],p[1]+0.065,p[2]));
  const g=new THREE.BufferGeometry().setFromPoints(points);
  const material=new THREE.LineBasicMaterial({color:reachable?'#5df9b0':'#ff5a6f',transparent:true,opacity:0.95});
  scene.add(new THREE.Line(g,material));
}
async function startup():Promise<void> {
  log('GET /models/cascade-isle-v2.glb …');
  const gltf=await new GLTFLoader().loadAsync('/models/cascade-isle-v2.glb');
  const island=gltf.scene;
  island.position.y=0.55;
  island.rotation.y=70*Math.PI/180;
  island.scale.setScalar(8);
  scene.add(island);island.updateMatrixWorld(true);
  let terrainMesh:THREE.Mesh|null=null;
  island.traverse(obj=>{if(!terrainMesh && (obj as THREE.Mesh).isMesh)terrainMesh=obj as THREE.Mesh;});
  if(!terrainMesh)throw Error('PMO_DEV_GLB_NO_MESH');
  log('GLB сцена загружена. Рельеф: первый mesh из исходного острова.');
  const registryResponse=await fetch('/semantic/evidence/pmo/registry-authored-2026-10-21.json',{cache:'no-store'});
  if(!registryResponse.ok)throw Error(`PMO_DEV_REGISTRY_FETCH_HTTP_${registryResponse.status}`);
  const raw=await registryResponse.json();
  const registry=[raw,raw.registry,raw.snapshot,raw.snapshot?.registry,raw.authoredSnapshot].find(
    (candidate:any)=>candidate?.schemaVersion===1&&Array.isArray(candidate.objects));
  if(!registry)throw Error('PMO_DEV_AUTHORED_REGISTRY_SCHEMA_INVALID');
  log(`Authored PMO registry: ${registry.objects.length} objects. Это НЕ подтверждение live state.`);
  const projector=makeTerrainProjector(terrainMesh);
  const connector=makePmoTerrainConnector(registry,projector);
  const stamps=readPmoWalkAuthorization(registry);
  log(`Authorized paint stamps: ${stamps.length}. Компиляция коридоров…`);
  const started=performance.now();
  const graph=compilePmoBrushCorridors(stamps,connector,[],{
    maxGrade:0.72,maxStepY:0.20,step:0.18,maxWalkLink:0.28,maxNodes:18000,
  });
  log(`Corridors compiled in ${Math.round(performance.now()-started)} ms; nodes ${graph.nodes.length}.`);
  // Inspect where actual PMO walk samples exist; sampled green points are read-only.
  const stride=Math.max(1,Math.ceil(graph.nodes.length/1600));
  const sampleCount=Math.ceil(graph.nodes.length/stride);
  const sitePoints=new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.014,5,4),
    new THREE.MeshBasicMaterial({color:'#7af7b2',transparent:true,opacity:0.72,depthWrite:false}),
    Math.max(1,sampleCount));
  for(let index=0,indexOnScene=0;index<graph.nodes.length;index+=stride,indexOnScene++){
    const p=graph.nodes[index].point;
    matrix.position.set(p[0],p[1]+0.035,p[2]);matrix.rotation.set(0,0,0);matrix.scale.setScalar(1);matrix.updateMatrix();
    sitePoints.setMatrixAt(indexOnScene,matrix.matrix);
  }
  sitePoints.count=sampleCount;sitePoints.instanceMatrix.needsUpdate=true;
  sitePoints.frustumCulled=false;scene.add(sitePoints);
  const scenario=generatePmoDevBuildings(graph,connector,seed);
  const success=scenario.buildings.filter(b=>b.routeStatus==='READY').length;
  if(!scenario.beachAttachmentCertified)log(`BEACH_ATTACHMENT_UNPROVEN: nearest PMO node is ${number(scenario.distanceToAuthoredBeachEnd)} units from authored beach-stairs endpoint.`);
  const entryBeacon=new THREE.Mesh(new THREE.SphereGeometry(0.07,12,8),new THREE.MeshStandardMaterial({color:'#5ae4ff',emissive:'#208b9f'}));
  entryBeacon.position.set(scenario.entryPoint[0],scenario.entryPoint[1]+0.13,scenario.entryPoint[2]);scene.add(entryBeacon);
  const entryLabel=labelSprite('PMO START');entryLabel.position.set(scenario.entryPoint[0],scenario.entryPoint[1]+0.43,scenario.entryPoint[2]);scene.add(entryLabel);
  setText('stats',`${registry.objects.length} объектов PMO · ${stamps.length} мазков · ${graph.nodes.length} проходимых узлов\n${scenario.buildings.length} временных зданий · ${success} достижимы от ближайшего PMO-узла к пляжу · ${scenario.buildings.length-success} недостижимы\nСвязь с пляжной лестницей: ${scenario.beachAttachmentCertified?'подтверждена':'НЕ подтверждена'}`);
  if(scenario.failures.length)scenario.failures.forEach(log);
  const list=html('buildings');list.replaceChildren();
  scenario.buildings.forEach((b,i)=>{
    buildBox(i,b.position,b.name);
    routeLine(b.routeStatus==='READY'?b.routePoints:[scenario.entryPoint,b.position],b.routeStatus==='READY');
    const row=document.createElement('div');row.className='building';
    const title=document.createElement('strong');title.textContent=b.name;
    const status=document.createElement('span');status.className=colorStatus(b.routeStatus);status.textContent=b.routeStatus;
    const coords=document.createElement('small');coords.textContent=`[${b.position.map(number).join(', ')}] · route ${b.routeDistance!==null?number(b.routeDistance):'blocked'}`;
    row.append(title,status,coords);list.append(row);
  });
  // 24 *separate* simulated actors if painted space is sufficient. The scene layer
  // never determines authoritative arrival or reward; it only presents diagnostics.
  actors=new PmoPedestrianRuntime(graph,connector,{collisionSpacing:0.10});
  const targets=scenario.buildings.filter(b=>b.routeStatus==='READY');
  const spawnPool=[...graph.nodes].sort((a,b)=>{
    const d=(p:readonly number[])=>Math.hypot(p[0]-scenario.entryPoint[0],p[1]-scenario.entryPoint[1],p[2]-scenario.entryPoint[2]);
    return d(a.point)-d(b.point);
  }).slice(0,100);
  let accepted=0,rejected=0;
  for(let i=0;i<24 && targets.length;i++) {
    const target=targets[Math.floor(rand()*targets.length)];
    const candidate=spawnPool[Math.floor(rand()*spawnPool.length)];
    if(!candidate)break;
    const result=actors.add({id:`dev-guest-${i}`,from:candidate.point,to:target.position,speed:0.29+rand()*0.09});
    if(result.status==='READY')accepted++;else rejected++;
  }
  log(`Guest spawn requests: 24; accepted: ${accepted}; rejected: ${rejected} (collision/route rejection).`);
  const geom=new THREE.CapsuleGeometry(0.031,0.085,4,6);
  const mat=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:0.7});
  instance=new THREE.InstancedMesh(geom,mat,100);instance.count=0;instance.frustumCulled=false;scene.add(instance);
  setText('actors',`${accepted} тестовых гостей в сцене; ожидание первых кадров…`);
  setInterval(()=>{
    if(!actors)return;
    actors.tick(0.05);simulationTicks++;
    if(simulationTicks%10===0){
      const positions=actors.snapshots(),counts:Record<string,number>={};
      for(const p of positions)counts[p.status]=(counts[p.status]||0)+1;
      setText('actors',`${positions.length} пешек · такты ${simulationTicks}\n`+Object.entries(counts).map(([k,v])=>`${k}: ${v}`).join(' · '));
    }
  },50);
}
startup().catch(err=>{
  const error=err instanceof Error?err.stack||err.message:String(err);
  log('FAILED: '+error);
  setText('stats','Ошибка dev endpoint. См. диагностический блок; никаких изменений Core не выполнено.');
});

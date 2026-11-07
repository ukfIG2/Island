/** /тест: only the actual island + randomized dev buildings placed on PMO walk paint. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { makeTerrainProjector } from '../render/spatialMeta/terrainProjector';
import { makePmoTerrainConnector } from '../render/spatialMeta/pmoNavigationWorld';
import { readPmoWalkAuthorization } from '../render/spatialMeta/pmoWorldBindings';
import { placeTestBuildings, TEST_NAMES } from './pmoTestPlacement';

const root=document.getElementById('app')!,hud=document.getElementById('hud')!;
const info=(value:string)=>{hud.textContent=value;};
if (!import.meta.env.DEV) throw Error('DEV_ONLY_ENDPOINT');
const scene=new THREE.Scene();scene.background=new THREE.Color('#14232d');
scene.add(new THREE.HemisphereLight(0xd9eaff,0x3c5156,2.8));
const sun=new THREE.DirectionalLight(0xffffff,2.1);sun.position.set(3,8,7);scene.add(sun);
const camera=new THREE.PerspectiveCamera(55,1,.01,150);camera.position.set(9,8,10);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));root.append(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.target.set(0,-.8,0);
function resize(){const w=root.clientWidth||innerWidth,h=root.clientHeight||innerHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();}
addEventListener('resize',resize);resize();
function frame(){requestAnimationFrame(frame);controls.update();renderer.render(scene,camera);}frame();
function titleSprite(text:string):THREE.Sprite{
  const canvas=document.createElement('canvas');canvas.width=280;canvas.height=72;
  const cx=canvas.getContext('2d')!;cx.fillStyle='#0f1b2fdc';cx.fillRect(1,4,278,62);
  cx.fillStyle='#fff';cx.font='bold 24px system-ui';cx.textAlign='center';cx.fillText(text,140,45);
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),depthTest:false}));sprite.scale.set(.8,.21,1);return sprite;
}
function building(position: readonly number[],name:string,color:string){
  // Non-persistent, recognizable miniature building; never edits game entities.
  const house=new THREE.Group();house.position.set(position[0],position[1],position[2]);
  const walls=new THREE.Mesh(new THREE.BoxGeometry(.19,.14,.19),new THREE.MeshStandardMaterial({color,roughness:.9}));walls.position.y=.07;house.add(walls);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(.155,.105,4),new THREE.MeshStandardMaterial({color:'#754a3b',roughness:.8}));roof.rotation.y=Math.PI/4;roof.position.y=.185;house.add(roof);
  const door=new THREE.Mesh(new THREE.BoxGeometry(.042,.074,.007),new THREE.MeshStandardMaterial({color:'#2e3b47'}));door.position.set(0,.038,.099);house.add(door);
  const label=titleSprite(name);label.position.set(0,.35,0);house.add(label);scene.add(house);
}
async function start(){
  const loaded=await new GLTFLoader().loadAsync('/models/cascade-isle-v2.glb');
  const island=loaded.scene;island.position.y=.55;island.rotation.y=70*Math.PI/180;island.scale.setScalar(8);scene.add(island);island.updateMatrixWorld(true);
  let terrain:THREE.Mesh|undefined;island.traverse(o=>{if(!terrain&&(o as THREE.Mesh).isMesh)terrain=o as THREE.Mesh;});
  if(!terrain)throw Error('GLB_HAS_NO_TERRAIN_MESH');
  const response=await fetch('/semantic/evidence/pmo/registry-authored-2026-10-21.json',{cache:'no-store'});
  if(!response.ok)throw Error('PMO_REGISTRY_HTTP_'+response.status);
  const data=await response.json();
  const registry=[data,data?.registry,data?.snapshot,data?.snapshot?.registry,data?.authoredSnapshot].find(x=>x?.schemaVersion===1&&Array.isArray(x.objects));
  if(!registry)throw Error('PMO_REGISTRY_SCHEMA_INVALID');
  const stamps=readPmoWalkAuthorization(registry),projector=makeTerrainProjector(terrain),connector=makePmoTerrainConnector(registry,projector);
  // Each reload obtains fresh cryptographically seeded randomness; no fixed default positions.
  const entropy=crypto.getRandomValues(new Uint32Array(1))[0];let state=entropy||0x6d2b79f5;
  const rand=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;state>>>=0;return state/4294967296;};
  const found=placeTestBuildings(stamps,connector,rand);
  const colors=['#f4bc86','#a8d7f2','#c8b5ee','#a5dbb9','#f7bbc5'];
  found.forEach((s,i)=>building(s.position,s.name,colors[i%colors.length]));
  info(`PMO — случайные здания\nF5 — новая расстановка\n${found.length} из ${TEST_NAMES.length} размещено на мазках\n${stamps.length} точек PMO · снимок 21.10.2026\n${found.map(s=>`${s.name}: ${s.position[0].toFixed(2)}, ${s.position[2].toFixed(2)}`).join('\n')}${found.length<TEST_NAMES.length?'\nНекоторым зданиям не нашлось безопасного места.':''}`);
}
start().catch(e=>info(`PMO /тест — ошибка: ${e instanceof Error?e.message:String(e)}\nНичего не записано в состояние игры.`));

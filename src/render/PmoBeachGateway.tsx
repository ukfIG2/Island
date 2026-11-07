/** Main arrival stair — architectural finish exactly following PMO physical treads.
 * Every central stone's top matches the collider sampled by the original stair
 * or the physically supported derived tread. Side cheeks/riser face are decoration
 * BELOW or OUTSIDE the certified walking corridor, never gameplay authority.
 */
import { useMemo } from 'react';
import * as THREE from 'three';
import type { PmoStructure } from './spatialMeta/pmoTransitionStructures';
import type { PmoLandingExtension } from './spatialMeta/pmoLandingRepair';
import type { PmoDockExtension } from './spatialMeta/pmoTransitionDockRepair';
import { designPmoBeachGateway, type GatewayStone } from './spatialMeta/pmoBeachGatewayDesign';

function StoneStep({step,index}:{step:GatewayStone;index:number}){
  // For authored stairs the original 34mm tread top is centerY+17mm; for
  // compiled landings it is exactly 'top'. Building downward preserves that.
  const stoneHeight=step.family==='main'?step.baseDepth:step.family==='landing'?0.105:0.090;
  const pos:[number,number,number]=[step.center[0],step.top-stoneHeight/2,step.center[2]];
  const bevel=0.012;
  const cheekOffset=step.width/2+0.010;
  const dx=Math.cos(step.yaw),dz=-Math.sin(step.yaw);
  const color=index%5===0?'#b4a188':index%5===2?'#ccbaa0':'#c2b099';
  return <group name={'gateway-stone:'+step.id}>
    <mesh raycast={()=>{}} position={pos} rotation={[0,step.yaw,0]} receiveShadow castShadow>
      <boxGeometry args={[step.width,stoneHeight,step.length]}/>
      <meshStandardMaterial color={color} roughness={0.96} metalness={0}/>
    </mesh>
    {/* Masonry side stringers make the staircase read as one embedded structure.
        No lid spanning an unverified gap between successive certified treads. */}
    {[-1,1].map(side=><mesh key={side} raycast={()=>{}}
      position={[pos[0]+dx*cheekOffset*side,step.top-(step.family==='main'?0.067:0.055),pos[2]+dz*cheekOffset*side]}
      rotation={[0,step.yaw,0]} receiveShadow castShadow>
      <boxGeometry args={[0.025,step.family==='main'?0.12:0.09,step.length*1.035]}/>
      <meshStandardMaterial color="#817765" roughness={1} metalness={0}/>
    </mesh>)}
    {/* Edge highlight sits *below* the top instead of inventing a new surface. */}
    {<mesh raycast={()=>{}}
      position={[step.center[0],step.top-bevel/2,step.center[2]]}
      rotation={[0,step.yaw,0]} receiveShadow>
      <boxGeometry args={[step.width*.90,bevel,step.length*.85]}/>
      <meshStandardMaterial color="#d9cab2" roughness={0.92}/>
    </mesh>}
  </group>;
}

export function PmoBeachGateway({stair,landings,docks}:{
  stair:PmoStructure;landings:readonly PmoLandingExtension[];docks:readonly PmoDockExtension[];
}){
  const plan=useMemo(()=>designPmoBeachGateway(stair,landings,docks),[stair,landings,docks]);
  if(!plan)return null;
  return <group name="pmo-main-beach-gateway-authoritative-tread-projection">
    {/* The small upper terrace keeps its certified walking treads, but no longer
        reads as a separate thin floating platform: the matching stone cheeks
        continue from the entrance flight into this physical connector. */}
    {/* Render ONLY the original canonical stair. The floating slab was the FIRST
        derived pmo-landing (without :terrace:0), so filtering terrace:0 alone
        left it hovering above the upper port. All derived landing and dock
        surfaces remain in the navigation graph; this is an aesthetic removal,
        not a claim that the physical incline has been rebuilt. */}
    {plan.stones.filter(step=>step.family==='main').map((step,i)=><StoneStep key={step.id} step={step} index={i}/>)}
  </group>;
}

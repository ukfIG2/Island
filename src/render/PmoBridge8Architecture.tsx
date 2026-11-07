/** Bridge 3→8 architectural carrier.
 * Built exclusively from the existing authored bridge, certified remote docks,
 * and compiled landing treads. Decorative elements never participate in PMO,
 * navigation, raycasting, or collision. A missing certified dock is not invented.
 */
import type { PmoStructure } from './spatialMeta/pmoTransitionStructures';
import type { PmoLandingExtension } from './spatialMeta/pmoLandingRepair';
import type { PmoDockExtension } from './spatialMeta/pmoTransitionDockRepair';

export const BRIDGE8_ID = 'pmo-02971a36-0dbc-47ed-a6c4-d532f148c2c0';

function BridgeSpan({structure}:{structure:PmoStructure}) {
  return <group name="rrh-bridge8-authorial-span">
    {structure.segments.map((segment,i)=>
      <group key={structure.edgeId+':'+i} position={segment.center} rotation={[0,segment.yaw,0]}>
        <mesh raycast={()=>{}} rotation={[segment.pitch,0,0]} castShadow receiveShadow>
          {/* Upper surface stays 0.002m BELOW the original authored 0.034m box. */}
          <boxGeometry args={[segment.width,0.030,segment.length]}/>
          <meshStandardMaterial color={i%4===0?'#b2a792':'#c2b8a3'} roughness={0.94}/>
        </mesh>
        {[-1,1].map(side=><group key={side} position={[side*(segment.width/2+0.033),0,0]}>
          {/* Side sills are OUTSIDE the authored passable width. */}
          <mesh raycast={()=>{}} position={[0,-0.065,0]} rotation={[segment.pitch,0,0]}>
            <boxGeometry args={[0.026,0.10,segment.length*1.015]}/>
            <meshStandardMaterial color="#817a6a" roughness={0.98}/>
          </mesh>
          {i%4===0&&<mesh raycast={()=>{}} position={[0,0.105,0]}>
            <boxGeometry args={[0.023,0.24,0.023]}/>
            <meshStandardMaterial color="#756f62" roughness={0.94}/>
          </mesh>}
        </group>)}
      </group>)}
  </group>;
}

function PhysicalDock({dock}:{dock:PmoDockExtension}) {
  return <group name={'rrh-bridge8-certified-dock:'+dock.id}>
    {dock.treads.map((s,i)=>
      <group key={dock.id+':'+i} position={s.center} rotation={[0,s.yaw,0]}>
        <mesh raycast={()=>{}} castShadow receiveShadow>
          {/* DrawableDock center is already 0.017m below physical centre line. */}
          <boxGeometry args={[s.width,0.034,s.length]}/>
          <meshStandardMaterial color={i%5===0?'#b2a48d':'#c4b59e'} roughness={0.96}/>
        </mesh>
        {[-1,1].map(side=><mesh raycast={()=>{}} key={side}
          position={[side*(s.width/2+0.016),-0.045,0]}>
          <boxGeometry args={[0.023,0.09,s.length*1.05]}/>
          <meshStandardMaterial color="#817969" roughness={1}/>
        </mesh>)}
      </group>)}
  </group>;
}

function PhysicalApproach({landing}:{landing:PmoLandingExtension}) {
  return <group name={'rrh-bridge8-certified-approach:'+landing.id}>
    {landing.treads.map((s,i)=>
      <group key={landing.id+':'+i} position={[s.center[0],s.top-0.042,s.center[2]]}
        rotation={[0,s.yaw,0]}>
        <mesh raycast={()=>{}} castShadow receiveShadow>
          <boxGeometry args={[s.width,0.084,s.length]}/>
          <meshStandardMaterial color={i%4===0?'#b2a48d':'#c4b59e'} roughness={0.96}/>
        </mesh>
        {[-1,1].map(side=><mesh raycast={()=>{}} key={side}
          position={[side*(s.width/2+0.017),-0.040,0]}>
          <boxGeometry args={[0.024,0.08,s.length*1.025]}/>
          <meshStandardMaterial color="#817969" roughness={1}/>
        </mesh>)}
      </group>)}
  </group>;
}

export function PmoBridge8Architecture({structure,landings,docks}:{
  structure:PmoStructure;
  landings:readonly PmoLandingExtension[];
  docks:readonly PmoDockExtension[];
}) {
  if(structure.sourceId!==BRIDGE8_ID||structure.kind!=='bridge')return null;
  return <group name="rrh-bridge8-unified-authored-and-certified-architecture">
    <BridgeSpan structure={structure}/>
    {landings.filter(l=>l.sourceId===BRIDGE8_ID).map(l=><PhysicalApproach key={l.id} landing={l}/>)}
    {docks.filter(d=>d.structureSourceId===BRIDGE8_ID).map(d=><PhysicalDock key={d.id} dock={d}/>)}
  </group>;
}

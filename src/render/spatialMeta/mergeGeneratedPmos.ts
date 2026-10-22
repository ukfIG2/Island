/** Pure, idempotent, no-overwrite merge of generated PMOs into the live editor registry. */
import type { SpatialRegistry } from './registry';
export function mergeGeneratedPmos(live: SpatialRegistry, authoredSnapshot: SpatialRegistry,
  generated: SpatialRegistry): {registry: SpatialRegistry; added: number} {
  if(live.schemaVersion!==1||generated.schemaVersion!==1||authoredSnapshot.schemaVersion!==1 ||
      live.coordinateSpace!=='world'||generated.coordinateSpace!=='world'||authoredSnapshot.coordinateSpace!=='world')
    throw new Error('PMO coordinate-space/schema mismatch');
  const baselineIds=new Set(authoredSnapshot.objects.map(x=>x.id));
  const originalMap=new Map(authoredSnapshot.objects.map(x=>[x.id,x]));
  const generatedMap=new Map(generated.objects.map(x=>[x.id,x]));
  for(const [id,obj] of originalMap) {
    if(!generatedMap.has(id)||JSON.stringify(generatedMap.get(id))!==JSON.stringify(obj))
      throw new Error('Generated overlay modifies an authored PMO: '+id);
  }
  const liveMap=new Map(live.objects.map(o=>[o.id,o]));
  // Never overwrite edited positions: regenerate the overlay from the new
  // locally authored snapshot rather than installing outdated coordinates.
  for(const [id,obj] of originalMap) {
    if(!liveMap.has(id)||JSON.stringify(liveMap.get(id))!==JSON.stringify(obj))
      throw new Error('Live authored PMO differs from protected snapshot: '+id);
  }
  const additions=[];
  for(const obj of generated.objects) {
    if(baselineIds.has(obj.id)) continue;
    const flags=obj.metadata?.navigation as Record<string,unknown>|undefined;
    if(flags?.generated!==true||flags?.virtual!==true) throw new Error('Unexpected generated payload '+obj.id);
    const existing=liveMap.get(obj.id);
    if(existing) {
      if(JSON.stringify(existing)!==JSON.stringify(obj)) throw new Error('Generated PMO ID conflict '+obj.id);
      continue;
    }
    additions.push(obj);
  }
  return {registry:{...live,objects:[...live.objects,...additions]},added:additions.length};
}

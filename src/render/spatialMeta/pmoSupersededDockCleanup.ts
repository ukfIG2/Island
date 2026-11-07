/** Remove obsolete auto-docks only AFTER the corresponding authored portal has
 * a replacement physically certified remote dock.  Both graph edges and rendered
 * surfaces are retired together: never hide a drawable surface while retaining
 * its traversable shortcut in the navigation graph.
 */
import type { NavigationGraph } from './navigation';
import type { PmoDockExtension } from './pmoTransitionDockRepair';

export interface PmoDockCleanup {
  graph: NavigationGraph;
  docks: readonly PmoDockExtension[];
  diagnostics: readonly string[];
}

export function retireSupersededPmoDocks(
  input:NavigationGraph, allDocks:readonly PmoDockExtension[],
  replacements:readonly PmoDockExtension[],
):PmoDockCleanup {
  const replacementSides=new Set(replacements
    .filter(d=>d.id.startsWith('pmo-remote-dock:'))
    .map(d=>`${d.structureSourceId}:${d.side}`));
  const obsolete=allDocks.filter(d=>d.id.startsWith('pmo-dock:') &&
    replacementSides.has(`${d.structureSourceId}:${d.side}`));
  if(!obsolete.length)return {graph:input,docks:allDocks,diagnostics:[]};
  const ids=new Set(obsolete.map(d=>d.id));
  // An authored transition edge is never touched: only the exact derived
  // shortcut source IDs are removed, on BOTH sides of each previous dock.
  const outgoing=Object.fromEntries(Object.entries(input.outgoing).map(([id,edges])=>
    [id,edges.filter(e=>!ids.has(e.sourceId))]));
  const diagnostics=obsolete.map(d=>`PMO_SUPERSEDED_DOCK_RETIRED:${d.id}`);
  return {graph:{...input,outgoing},docks:allDocks.filter(d=>!ids.has(d.id)),diagnostics};
}

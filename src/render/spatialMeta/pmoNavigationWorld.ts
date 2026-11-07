import {PmoLiftTransit} from './pmoLiftTransit';
import {buildWalkPaintLabRegistry,retireGeneratedStairsForPaintLab} from './pmoWalkPaintLab';
import {repairAuthoredBridge7Bank} from './pmoBridge7BankRepair';
import {repairCanonicalRemoteBranches} from './pmoRemoteBranchRepair';
import {retireSupersededPmoDocks} from './pmoSupersededDockCleanup';
import {repairAuthoredLiftExitLanding} from './pmoLiftExitLandingRepair';
import {repairBeachReachableDocks} from './pmoReachableDockRepair';
import {repairPmoTransitionDocks,type PmoDockExtension} from './pmoTransitionDockRepair';
import {repairCertifiedWalkComponents} from './pmoWalkComponentRepair';
import {joinBeachGatewayToMainWalk} from './pmoGatewayNetworkLink';
import {refineFifthSiteWalkExit} from './pmoCertifiedWalkRefinement';
import {repairSite5DirectedCut} from './pmoSite5DirectedCut';
import {compilePmoLandingRepair,compileAdditionalBeachLandings,type PmoLandingExtension} from './pmoLandingRepair';
import { assessPmoTransitionAccess } from './pmoTransitionAccess';
import { projectPmoTransitionStructures } from './pmoTransitionStructures';
import { buildPmoSupportedGraph } from './pmoSupportedTransitions';
import { certifyPmoSupportedWalkGraph, planPmoSupportedServiceRoute } from './pmoSpecialServiceRoutes';
/** Read-only, terrain-bound world/navigation projection.
 * Never grants motion from unverified virtual links, disconnected graphs or legacy world anchors.
 */
import type { NormalWaveNeedId } from '../../core/state';
import type { SpatialPoint, SpatialRegistry } from './registry';
import type { NavigationGraph, TerrainProjector } from './navigation';
import { compileNavigation } from './navigation';
import { annotateAuthoredPmoTransitions } from './pmoAuthoredTransitions';
import { planPmoRoute, type PmoRouteAssessment } from './pmoRoutePlan';
import { resolvePmoServiceLayout, type PmoServiceLayoutResult } from './pmoServiceLayout';
import { isPmoPaintAuthorized, readPmoWalkAuthorization } from './pmoWorldBindings';

export interface PmoNavigationWorld {
  readonly layout: PmoServiceLayoutResult;
  readonly graph: NavigationGraph;
  /** Effective read-only paint registry for the exact compiled graph (lab only). */
  readonly navigationRegistry: SpatialRegistry;
  readonly endpoints: Partial<Record<NormalWaveNeedId, SpatialPoint>>;
  readonly diagnostics: readonly string[];
  readonly landingExtensions:readonly PmoLandingExtension[];
  readonly dockExtensions:readonly PmoDockExtension[];
  readonly liftTransit:PmoLiftTransit;
  readonly walkPaintLabStamps?:readonly SpatialPoint[];
  readonly terrainBound: true;
  /** Motion is permitted only for a fully terrain-certified walking path. */
  serviceRoute(from: NormalWaveNeedId, to: NormalWaveNeedId): PmoRouteAssessment;
}

const distanceXZ = (a: SpatialPoint, b: SpatialPoint) => Math.hypot(a[0] - b[0], a[2] - b[2]);
const distance3 = (a: SpatialPoint, b: SpatialPoint) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const blocked = (reason: string): PmoRouteAssessment => ({
  status: 'UNREACHABLE', confidence: null, points: [], traversedEdges: [],
  graphNodeIds: [], issues: [reason], terrainVerified: false
});

/** Every connector sample must sit on the imported terrain and within authored PMO paint.
 * It must also remain outside blocked paint; an endpoint cannot invent a path across gaps.
 */
export function makePmoTerrainConnector(registry: SpatialRegistry, terrain: TerrainProjector) {
  const walk = readPmoWalkAuthorization(registry);
  const blockedPaint = registry.objects.filter(object => {
    const nav = object.metadata.navigation as Record<string, unknown> | undefined;
    return object.geometry.type === 'paint' &&
      (nav?.blocked === true || nav?.collision === 'exclude');
  }).flatMap(object => object.geometry.type === 'paint' ? object.geometry.strokes.flatMap(stroke =>
    stroke.points.map(center => ({ center, radius: stroke.radius }))) : []);
  const authorized = (point: SpatialPoint) =>
    isPmoPaintAuthorized(walk, point) && !blockedPaint.some(stamp =>
      distanceXZ(stamp.center, point) <= stamp.radius &&
      Math.abs(stamp.center[1] - point[1]) <= 0.52);
  const project = (point: SpatialPoint): SpatialPoint | null => {
    const hit = terrain.project(point[0], point[2], point[1]);
    return hit && Math.abs(point[1] - hit[1]) <= 0.52 && authorized(hit) ? hit : null;
  };
  const verify = (from: SpatialPoint, to: SpatialPoint): boolean => {
    const start = project(from), end = project(to);
    if (!start || !end || distance3(start, from) > 0.52 || distance3(end, to) > 0.52) return false;
    const length = distanceXZ(start, end);
    if (length < 1e-9) return Math.abs(start[1] - end[1]) < 1e-8;
    const count = Math.ceil(length / 0.07);
    let previous = start;
    for (let i = 1; i <= count; i++) {
      const t = i / count;
      const x = start[0] + (end[0] - start[0]) * t;
      const z = start[2] + (end[2] - start[2]) * t;
      const hint = start[1] + (end[1] - start[1]) * t;
      const hit = terrain.project(x, z, hint);
      if (!hit || !authorized(hit)) return false;
      const delta = Math.abs(hit[1] - previous[1]);
      const step = distanceXZ(hit, previous);
      if (delta > 0.20 + 1e-8 || (step > 1e-8 && delta / step > 0.72 + 1e-8)) return false;
      previous = hit;
    }
    return Math.abs(previous[1] - end[1]) <= 0.20;
  };
  return { project, verify };
}

/** Construct once per island mesh / authoring revision; callers own cache lifecycle. */
export function buildPmoNavigationWorld(
  registry: SpatialRegistry, terrain: TerrainProjector,
  authority: PmoServiceLayoutResult['authority'] = 'live-registry',
  mode:'entry'|'paint-baseline'|'paint-trial'='entry',
  originalRegistry:SpatialRegistry=registry,
): PmoNavigationWorld {
  const inPaintLab=mode==='entry' && typeof window!=='undefined' &&
    /^\/pathfinding-test\/?$/.test(window.location.pathname) &&
    new URLSearchParams(window.location.search).get('pmoWalkPaintLab')==='1';
  if(inPaintLab){
    const baseline=buildPmoNavigationWorld(registry,terrain,authority,'paint-baseline',registry);
    const overlay=buildWalkPaintLabRegistry(registry,terrain,baseline.landingExtensions,baseline.dockExtensions);
    const trial=buildPmoNavigationWorld(overlay.registry,terrain,authority,'paint-trial',registry);
    return {...trial,walkPaintLabStamps:overlay.stamps,
      diagnostics:[...trial.diagnostics,...overlay.diagnostics,
        'PMO_WALK_PAINT_LAB_NONPERSISTENT:CANONICAL_PMO_UNCHANGED']};
  }
  const layout = resolvePmoServiceLayout(originalRegistry, undefined, authority);
  const connector = makePmoTerrainConnector(registry, terrain);
  const compiled = compileNavigation(annotateAuthoredPmoTransitions(registry), terrain,
    {strictTransitionTypes:true,sampleStep:0.14,portalSnapRadius:0.94});
  const structures = projectPmoTransitionStructures(registry);
  const repairedDocks=repairPmoTransitionDocks(compiled,structures,connector,terrain);
  const transitionAccess = assessPmoTransitionAccess(structures, repairedDocks.graph);
  const liftTransit=new PmoLiftTransit(structures,transitionAccess,connector,repairedDocks.extensions);
  const landing=compilePmoLandingRepair(repairedDocks.graph,connector,structures,transitionAccess);
  const walkRepair=repairCertifiedWalkComponents(landing.graph,connector);
  // A second, bounded lattice-independent pass heals ONLY physically and
  // author-paint certified terrain gaps beyond the original short snap radius.
  const walkExtended=repairCertifiedWalkComponents(walkRepair.graph,connector,0.68);
  const terraces=compileAdditionalBeachLandings(walkExtended.graph,connector,structures,transitionAccess,landing.extensions);
  const gateway=joinBeachGatewayToMainWalk(terraces.graph,registry,structures,connector,terrain,
    [...landing.extensions,...terraces.extensions]);
  const allLandings=[...landing.extensions,...terraces.extensions,...gateway.extensions];
  const beachDocks=repairBeachReachableDocks(gateway.graph,registry,structures,connector,terrain,
    repairedDocks.extensions,allLandings);
  const liftExit=repairAuthoredLiftExitLanding(beachDocks.graph,registry,structures,connector,terrain);
  const bridge7=repairAuthoredBridge7Bank(liftExit.graph,registry,structures,connector,terrain);
  const bentBridgeLab=mode!=='paint-trial' && typeof window!=='undefined' &&
    /^\/pathfinding-test\/?$/.test(window.location.pathname) &&
    new URLSearchParams(window.location.search).get('pmoBentBridge3')==='1';
  const remote=repairCanonicalRemoteBranches(bridge7.graph,registry,structures,connector,terrain,bentBridgeLab);
  const deduplicated=retireSupersededPmoDocks(remote.graph,
    [...repairedDocks.extensions,...beachDocks.extensions,...bridge7.docks,...remote.docks],remote.docks);
  const allCompletedLandings=[...allLandings,...liftExit.extensions,...bridge7.extensions,...remote.landings];
  const paintRetired=mode==='paint-trial'?retireGeneratedStairsForPaintLab(deduplicated.graph,allCompletedLandings,deduplicated.docks):null;
  // Only terrain/PMO-approved short walk detours, certified bidirectionally
  // using the exact physical 6mm pedestrian gate. Fail closed if no route.
  const fifthExit=mode==='paint-trial'?null:refineFifthSiteWalkExit(deduplicated.graph,registry,structures,connector);
  const site5Cut=mode==='paint-trial'?null:repairSite5DirectedCut(fifthExit?.graph??deduplicated.graph,structures,connector);
  const graph=paintRetired?.graph??site5Cut?.graph??fifthExit?.graph??deduplicated.graph;
  const completedLandings=paintRetired?.landings??allCompletedLandings;
  const finalDocks=paintRetired?.docks??deduplicated.docks;
  const finalTransitionAccess=assessPmoTransitionAccess(structures,graph);
  const finalLiftTransit=new PmoLiftTransit(structures,finalTransitionAccess,connector,finalDocks);
  const supported = certifyPmoSupportedWalkGraph(
    buildPmoSupportedGraph(registry, graph, structures, finalTransitionAccess,completedLandings,finalDocks), connector.verify
  );
  const endpoints: PmoNavigationWorld['endpoints'] = {};
  const diagnostics: string[] = [...layout.errors, ...graph.issues.map(i => `${i.code}:${i.sourceId ?? ''}`),...landing.diagnostics,...repairedDocks.diagnostics,...walkRepair.diagnostics,
    ...walkExtended.diagnostics.map(d=>d.replace('PMO_TERRAIN_WALK_STITCH:', 'PMO_TERRAIN_WALK_STITCH_EXTENDED:')),
    ...beachDocks.diagnostics,...terraces.diagnostics,...gateway.diagnostics,...liftExit.diagnostics,...bridge7.diagnostics,...remote.diagnostics,...deduplicated.diagnostics,...(fifthExit?.diagnostics??[]),...(site5Cut?.diagnostics??[]),...(paintRetired?.diagnostics??[]),...finalLiftTransit.rejected];
  for (const access of finalTransitionAccess) for (const issue of access.issues) diagnostics.push(`PMO_TRANSITION:${access.sourceId}:${issue}`);
  for (const [service, site] of Object.entries(layout.services)) {
    if (!site) continue;
    const endpoint = connector.project(site.entrance);
    if (endpoint) endpoints[service as NormalWaveNeedId] = endpoint;
    else diagnostics.push(`ENDPOINT_TERRAIN_UNAUTHORIZED:${service}`);
  }
  return {
    layout, graph, endpoints, diagnostics, navigationRegistry:registry, terrainBound: true,landingExtensions:completedLandings,dockExtensions:finalDocks,liftTransit:finalLiftTransit,
    serviceRoute(from, to) {
      const start = endpoints[from], goal = endpoints[to];
      if (!start || !goal) return blocked(`MISSING_CERTIFIED_PMO_ENDPOINT:${from}:${to}`);
      const route = planPmoRoute(registry, graph, {
        start, goal,
        snapRadius: 0.44,
        certifiedTerrainGraph: graph,
        verifyConnector: connector.verify
      });
      // Prefer terrain-only motion unless the physically supported special route is shorter or terrain is blocked.
      const special = planPmoSupportedServiceRoute(supported, start, goal, connector.verify);
      if (special && special.specialSourceIds.length > 0 && special.points.length >= 3) {
        const ordinaryReady = route.status === 'READY' && route.terrainVerified;
        const ordinaryLength = route.points.slice(1).reduce((sum, point, index) =>
          sum + distance3(route.points[index], point), 0);
        if (!ordinaryReady || special.distance + 1e-8 < ordinaryLength) {
          return { status: 'READY', confidence: 'authored-transition',
            points: special.points, traversedEdges: special.traversedEdges,
            graphNodeIds: special.graphNodeIds, issues: [], terrainVerified: true };
        }
      }
      if (route.status !== 'READY' || !route.terrainVerified) {
        return { ...route, points: [] };
      }
      return route;
    }
  };
}

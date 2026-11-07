import type { BrushGraph, PmoTerrainConnector, SpatialPoint } from './pmoBrushCorridors';
import {certifyDirectedWalk,type WalkStepFault} from './pmoWalkKinematics';

export type MotionAuditReason = WalkStepFault;
export interface MotionAuditFailure {
  readonly reason: MotionAuditReason;
  readonly at: SpatialPoint;
  readonly toward: SpatialPoint;
  readonly dx: number;
  readonly dy: number;
  readonly verifyForward: boolean;
  readonly verifyReverse: boolean;
}
export interface MotionAuditResult {
  readonly graph: BrushGraph;
  readonly walkDirectedAccepted: number;
  readonly walkDirectedRejected: number;
  readonly examples: readonly { fromNode: number; toNode: number; failure: MotionAuditFailure }[];
}

/** Exact same physical gate as PmoPedestrianRuntime, with fixed subframe increments. */
export function certifyWalkMotion(from:SpatialPoint,to:SpatialPoint,graph:BrushGraph,
  connector:PmoTerrainConnector,increment=0.006):MotionAuditFailure|null{
  const failed=certifyDirectedWalk(from,to,graph,connector,increment);
  return failed ? {reason:failed.fault,...failed}:null;
}

/** Keep only truly executable walk directions; helpers retain separate certification. */
export function auditPmoWalkMotion(graph: BrushGraph, connector: PmoTerrainConnector): MotionAuditResult {
  let accepted = 0, rejected = 0;
  const examples: { fromNode: number; toNode: number; failure: MotionAuditFailure }[] = [];
  const neighbors = graph.neighbors.map((edges, fromNode) => edges.filter(edge => {
    if (edge.kind !== 'walk') return true;
    const failure = certifyWalkMotion(graph.nodes[fromNode].point, graph.nodes[edge.to].point, graph, connector);
    if (!failure) { accepted++; return true; }
    rejected++;
    if (examples.length < 8) examples.push({fromNode, toNode: edge.to, failure});
    return false;
  }));
  return { graph: { ...graph, neighbors }, walkDirectedAccepted: accepted,
    walkDirectedRejected: rejected, examples };
}

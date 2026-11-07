/** Broad-phase physical occupancy index for one pedestrian tick.
 * Coordinates are in canonical PMO world units; no collision is inferred from
 * grid cells alone: every candidate must still pass the exact narrow-phase gate.
 * Rebuilt each tick, so it cannot become a second source of actor truth.
 */
export interface PmoOccupant {
  readonly position: readonly [number, number, number];
  readonly status: string;
}

export class PmoOccupancyGrid<T extends PmoOccupant> {
  private readonly cells = new Map<string, Set<T>>();
  private readonly placement = new Map<T, string>();
  constructor(private readonly spacing: number) {
    if (!(spacing > 0 && Number.isFinite(spacing))) throw Error('PMO_INVALID_GRID_SPACING');
  }
  private cell(p: readonly [number, number, number]): [number, number] {
    return [Math.floor(p[0] / this.spacing), Math.floor(p[2] / this.spacing)];
  }
  private key(x: number, z: number): string { return x + ':' + z; }
  private eligible(actor: T): boolean { return actor.status !== 'blocked' && actor.status !== 'arrived'; }
  rebuild(actors: Iterable<T>): void {
    this.cells.clear();this.placement.clear();
    for (const actor of actors) this.sync(actor);
  }
  /** After one actor advances/blocks, update the index before the next actor. */
  sync(actor: T): void {
    const previous = this.placement.get(actor);
    const active = this.eligible(actor);
    const [x,z] = active ? this.cell(actor.position) : [0,0];
    const next = active ? this.key(x,z) : null;
    if (previous === next) return;
    if (previous !== undefined) {
      const old = this.cells.get(previous);
      old?.delete(actor);
      if (old?.size === 0) this.cells.delete(previous);
      this.placement.delete(actor);
    }
    if (next !== null) {
      let bucket = this.cells.get(next);
      if (!bucket) {bucket = new Set<T>();this.cells.set(next,bucket);}
      bucket.add(actor);this.placement.set(actor,next);
    }
  }
  remove(actor: T): void {
    const key = this.placement.get(actor);
    if (key === undefined) return;
    const bucket = this.cells.get(key);
    bucket?.delete(actor);
    if (bucket?.size === 0) this.cells.delete(key);
    this.placement.delete(actor);
  }
  occupied(mover: T, next: readonly [number, number, number]): boolean {
    const [x,z] = this.cell(next);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const bucket = this.cells.get(this.key(x+dx,z+dz));
      if (!bucket) continue;
      for (const other of bucket) {
        if (other === mover || !this.eligible(other)) continue;
        const p = other.position;
        if (Math.hypot(p[0]-next[0], p[2]-next[2]) < this.spacing &&
            Math.abs(p[1]-next[1]) < 0.19) return true;
      }
    }
    return false;
  }
}

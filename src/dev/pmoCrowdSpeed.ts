/** Deterministic per-person real walking speed, lab-only. */
export function crowdSpeed(id:string):number {
  let h=2166136261;for(let i=0;i<id.length;i++)h=Math.imul(h^id.charCodeAt(i),16777619);
  h^=h>>>13;
  return +(0.23+((h>>>0)%421)/1000).toFixed(3);
}
/** Leisure detours are deliberately slow: 0.11–0.19 m/s, versus 0.23–0.65 normally.
 * All walkers keep their stable ID and resume their own regular pace afterward.
 */
export function crowdWanderSpeed(id:string):number {
  const normal=crowdSpeed(id);
  return +(0.11+(normal-0.23)*(0.08/0.42)).toFixed(3);
}

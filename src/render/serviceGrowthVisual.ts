/** NFR-007: presentational tiers derived strictly from authoritative Core levels. */
export function serviceGrowthTiers(level:number):readonly number[]{
 const clamped=Number.isFinite(level)?Math.max(1,Math.min(5,Math.floor(level))):1;
 return Array.from({length:clamped-1},(_,i)=>i+2);
}

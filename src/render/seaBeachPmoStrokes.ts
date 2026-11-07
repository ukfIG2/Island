/** Sea berth paint authority: the actual PMO strokes, including their radii. */
import type {SpatialRegistry} from './spatialMeta/registry';
import type {SeaPaintStroke} from './seaCoastNavigation';

export function readSeaBeachPmoStrokes(registry:SpatialRegistry):SeaPaintStroke[] {
  const paint=registry.objects.find(o=>o.name==='zone_main_beach_entries' && o.geometry.type==='paint');
  if(!paint || paint.geometry.type!=='paint') return [];
  return paint.geometry.strokes
    .filter(s=>s.color.toLowerCase()==='#000000' && s.radius>0 && s.points.length>0)
    .map(s=>({id:s.id,radius:s.radius,points:s.points}));
}

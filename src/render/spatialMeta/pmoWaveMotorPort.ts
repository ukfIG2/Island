import type {SpatialPoint} from './pmoBrushCorridors';
import type {PedestrianSpawn,PedestrianSnapshot} from './pmoPedestrianRuntime';
export interface PmoWaveMotorPort {
  add(spawn:PedestrianSpawn):{status:string;reason?:string};
  reroute(id:string,to:SpatialPoint):{status:string;reason?:string};
  snapshots():readonly PedestrianSnapshot[];
  remove(id:string):void;
  tick(dt:number):void;
  diagnostic?(id:string):string;
}

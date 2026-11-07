import {runBackgroundWork} from './background-work';
export type DerivedKind='refinement'|'commute';
export type BackgroundDispatchEnv={BACKGROUND_WORK?:{run(kind:DerivedKind,deviceId:string):Promise<unknown>;backup():Promise<unknown>;cleanup?():Promise<unknown>}};
export async function dispatchDerivedWork(env:BackgroundDispatchEnv&{DB:D1Database},kind:DerivedKind,deviceId:string,local:()=>Promise<unknown>){
  if(env.BACKGROUND_WORK)return env.BACKGROUND_WORK.run(kind,deviceId);
  return runBackgroundWork(env.DB,kind,deviceId,local);
}

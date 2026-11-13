import {runCaptureWriter,runCaptureWriterDescendant,stagedCaptureWriterConfigured} from './capture-writer-boundary';
type Context=Parameters<typeof runCaptureWriter>[3];
// These are static application SQL strings, not an authorization/parser boundary.
// Only a single plain SELECT is exempt. WITH/PRAGMA/EXPLAIN/comments/semicolon
// sequences are conservatively owned, even when they turn out to be read-only.
const plainSelect=(sql:string)=>/^\s*SELECT\b/i.test(sql)&&!sql.includes(';');
const adapters=new WeakMap<object,{original:D1Database;parent:Context}>();
export function stagedCaptureDatabase(original:D1Database,parent:Context):D1Database{
 const prior=adapters.get(original);if(prior){if(prior.parent===parent)return original;original=prior.original;}
 if(!stagedCaptureWriterConfigured(original))return original;
 const statements=new WeakMap<object,{original:D1PreparedStatement;readOnly:boolean}>();
 const execute=<T>(operation:string,work:()=>Promise<T>)=>runCaptureWriterDescendant(original,operation,parent,work);
 function statement(raw:D1PreparedStatement,readOnly:boolean):D1PreparedStatement{
  const result={bind(...args:unknown[]){return statement(raw.bind(...args),readOnly);},
   first(...args:unknown[]){const work=()=>Reflect.apply(raw.first,raw,args);return readOnly?work():execute('d1.first',work);},
   all(...args:unknown[]){const work=()=>Reflect.apply(raw.all,raw,args);return readOnly?work():execute('d1.all',work);},
   run(...args:unknown[]){const work=()=>Reflect.apply(raw.run,raw,args);return readOnly?work():execute('d1.run',work);},
   raw(...args:unknown[]){const work=()=>Reflect.apply(raw.raw,raw,args);return readOnly?work():execute('d1.raw',work);}} as D1PreparedStatement;
  statements.set(result,{original:raw,readOnly});return result;
 }
 function database(raw:D1Database|D1DatabaseSession,isSession:boolean):D1Database|D1DatabaseSession{
  const result={prepare(sql:string){return statement(raw.prepare(sql),plainSelect(sql));},
   batch<T=unknown>(items:D1PreparedStatement[]){const known=items.map(s=>{const value=statements.get(s);if(!value)throw Error('CAPTURE_D1_FOREIGN_STATEMENT');return value;});const work=()=>raw.batch<T>(known.map(s=>s.original));return known.every(s=>s.readOnly)?work():execute('d1.batch',work);}};
  if(isSession)return {...result,getBookmark:()=>(raw as D1DatabaseSession).getBookmark()} as D1DatabaseSession;
  return {...result,exec:(sql:string)=>execute('d1.exec',()=>(raw as D1Database).exec(sql)),
   withSession:(constraint?:string)=>database((raw as D1Database).withSession(constraint),true),
   dump:()=>(raw as D1Database).dump()} as D1Database;
 }
 const wrapped=database(original,false) as D1Database;adapters.set(wrapped,{original,parent});return wrapped;
}
export function stagedCaptureDatabases<T extends {DB?:D1Database;BETA_DB?:D1Database}>(env:T,parent:Context):T{
 const DB=env.DB?stagedCaptureDatabase(env.DB,parent):undefined,BETA_DB=env.BETA_DB?stagedCaptureDatabase(env.BETA_DB,parent):undefined;
 return DB===env.DB&&BETA_DB===env.BETA_DB?env:{...env,...(DB?{DB}:{}),...(BETA_DB?{BETA_DB}:{})};
}

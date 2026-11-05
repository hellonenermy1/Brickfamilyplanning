// Conservative statement counter, including failed executions and every batch
// statement. Reserve outside this wrapper for durable receipt completion.
export function d1WorkBudget(original:D1Database,limit:number){
  if(!Number.isSafeInteger(limit)||limit<1||limit>48)throw Error('invalid D1 work budget');
  let used=0;const originals=new WeakMap<object,D1PreparedStatement>();
  function reserve(n:number){if(used+n>limit)throw Error('background D1 statement budget exhausted');used+=n;}
  function wrap(statement:D1PreparedStatement):D1PreparedStatement{
    const result={bind(...args:unknown[]){return wrap(statement.bind(...args));},
      async first(...args:unknown[]){reserve(1);return (statement.first as Function).apply(statement,args);},
      async all(...args:unknown[]){reserve(1);return (statement.all as Function).apply(statement,args);},
      async run(...args:unknown[]){reserve(1);return (statement.run as Function).apply(statement,args);},
      async raw(...args:unknown[]){reserve(1);return (statement.raw as Function).apply(statement,args);}} as D1PreparedStatement;
    originals.set(result,statement);return result;
  }
  const db={prepare(sql:string){return wrap(original.prepare(sql));},async batch(statements:D1PreparedStatement[]){
    const unwrapped=statements.map(s=>{const value=originals.get(s);if(!value)throw Error('foreign D1 budget statement');return value;});
    reserve(unwrapped.length);return original.batch(unwrapped);
  },exec(){throw Error('unbounded D1 exec disabled for background work');},withSession(){throw Error('unbounded D1 session disabled for background work');},dump(){throw Error('D1 dump disabled for background work');}} as unknown as D1Database;
  return{db,used:()=>used,limit};
}

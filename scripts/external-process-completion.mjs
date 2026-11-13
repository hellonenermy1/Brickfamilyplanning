// A close receipt covers this child's inherited pipes only. Detached descendants,
// remote effects and unrelated credential holders still need separate accounting.
import {spawn} from 'node:child_process';

export function runExternalProcess(command,args,{capture=false,input,quiet=false}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{
      shell:process.platform==='win32',env:{...process.env},
      // Always own output pipes, including when forwarding without capture.
      stdio:[input===undefined?'inherit':'pipe','pipe','pipe']
    });
    let output='',failure=null;
    const failed=()=>{failure??=Error('EXTERNAL_PROCESS_IO_UNCERTAIN');};
    child.on('error',failed);
    for(const [stream,destination] of [[child.stdout,process.stdout],[child.stderr,process.stderr]]){
      stream.on('error',failed);
      stream.on('data',chunk=>{
        if(capture)output+=chunk.toString();
        if(!quiet)try{destination.write(chunk);}catch{failed();}
      });
    }
    if(input!==undefined){child.stdin.on('error',failed);child.stdin.end(input);}
    // exit alone does not establish pipe completion. A signalled/nonzero/error
    // outcome cannot establish remote rollback and must not release ownership.
    child.on('close',(code,signal)=>{
      if(failure)reject(failure);
      else if(code!==0||signal)reject(Error('EXTERNAL_PROCESS_OUTCOME_UNCERTAIN'));
      else resolve(output);
    });
  });
}

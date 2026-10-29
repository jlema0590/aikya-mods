"""Run against a matching Harness checkout: python tests/integration_flow_bridge.py /path/to/harness."""
import json,os,subprocess,tempfile,sys
from pathlib import Path
harness=Path(sys.argv[1]).resolve();mods=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='aikya-flow-contract-') as temporary:
 base=Path(temporary).resolve();root=base/'project';root.mkdir();cache=base/'cache'
 bridge={'schema':1,'origin_root':str(root),'session_id':'contract-session','invocation_id':'a'*32,'command':'aikya-analyze','cache_root':str(cache)}
 env={**os.environ,'PYTHONPATH':str(harness/'src'),'PYTHONDONTWRITEBYTECODE':'1','AIKYA_FLOW_CONTEXT':json.dumps(bridge),'AIKYA_EXECUTION_CACHE':str(cache)}
 env.pop('CLAUDE_SESSION_ID',None)
 sys.path.insert(0,str(harness/'src'))
 from aikya.middleware.observer import observe
 from unittest.mock import patch
 with patch.dict(os.environ, env):
  observe({'root':str(root),'session_id':'contract-session','cache_root':str(cache)}, {'hook_event_name':'UserPromptSubmit','prompt':'/aikya-analyze'})
 shared=root/'.claude/worktrees/shared';shared.mkdir(parents=True);(shared/'pom.xml').write_text('<project/>')
 workers=[subprocess.Popen([sys.executable,'-B','-m','aikya','analyze','--target',str(shared),'--focus',focus,'--methodology','odd','--dry-run'],env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE) for focus in ('architecture','security')]
 for worker in workers:
  stdout,stderr=worker.communicate(timeout=60)
  assert worker.returncode==0,stderr
 for preview in (True, False):
  for focus in ('architecture','security'):
   target=root/'.claude/worktrees'/focus;target.mkdir(parents=True,exist_ok=True)
   if not (target/'pom.xml').exists():(target/'pom.xml').write_text('<project/>')
   proc=subprocess.run([sys.executable,'-B','-m','aikya','analyze','--target',str(target),'--focus',focus,'--methodology','odd','--dry-run' if preview else '--approved'],env=env,capture_output=True,text=True)
   assert proc.returncode==0,proc.stderr
 script="""
import { readFileSync } from 'node:fs';
import { executionIdentity, acceptSnapshot } from './mods/aikya-flow/lib/snapshot.js';
import { validateIndex, selectExecution } from './mods/aikya-flow/lib/bridge.js';
const context=JSON.parse(process.argv[1]);
const identity=await executionIdentity(context.origin_root,context.session_id);
const index=JSON.parse(readFileSync(context.cache_root+'/'+identity+'/flow-'+context.invocation_id+'.json','utf8'));
const entries=validateIndex(index,{...context,identity});
if(entries?.length!==7)throw new Error('Expected parent dispatch, parallel shared-worktree previews and separate preview/approved executions');
const runs=entries.map(row=>{
 const raw=JSON.parse(readFileSync(context.cache_root+'/'+row.identity+'/'+row.run_id+'.json','utf8'));
 const snapshot=acceptSnapshot(raw,{identity:row.identity,runId:row.run_id,command:context.command,invocationId:context.invocation_id,minStartedAt:Date.now()+10000});
 if(!snapshot||(row.mode!=='observed'&&snapshot.status!=='completed'))throw new Error('Actual Harness snapshot rejected');
 if(row.mode==='preview'&&snapshot.phases.find(p=>p.id==='implement').status!=='skipped')throw new Error('Preview applicability lost');
 if(row.mode==='approved'&&snapshot.phases.find(p=>p.id==='implement').status!=='completed')throw new Error('Approved installation evidence lost');
 if(acceptSnapshot(raw,{identity:row.identity,command:context.command,invocationId:'b'.repeat(32)}))throw new Error('Foreign invocation accepted');
 return {...snapshot,...row};
});
if(selectExecution(runs).focus!=='security'||selectExecution(runs).mode!=='approved')throw new Error('Untouched parent dispatch hid child execution results');
console.log(JSON.stringify({result:'PASS',runs:runs.map(run=>({focus:run.focus,mode:run.mode,status:run.status})),selected:selectExecution(runs).focus,earlierHookAccepted:true,foreignInvocationRejected:true}));
"""
 proc=subprocess.run(['node','--input-type=module','-e',script,json.dumps(bridge)],cwd=mods,text=True,capture_output=True)
 print(proc.stdout,end='');print(proc.stderr,end='',file=sys.stderr);assert proc.returncode==0

 # The mobile workflow is a skill, not the analyze CLI: run its installed classic hook.
 from aikya.installation.registration import setup
 registered=base/'registered';setup(harness,registered,'project',home=base/'home')
 runtime=registered/'.aikya/runtime'
 mobile={**bridge,'command':'aikya-mobile-feature','invocation_id':'b'*32}
 mobile_env={**env,'PYTHONPATH':'','AIKYA_FLOW_CONTEXT':json.dumps(mobile)}
 payload={'cwd':str(root),'session_id':'contract-session','hook_event_name':'UserPromptSubmit',
          'prompt_id':'mobile-fixture','prompt':'/aikya-mobile-feature'}
 hook=subprocess.run([sys.executable,'-B',str(runtime/'execution_observer.py'),'hook'],input=json.dumps(payload),
                     cwd=base,env=mobile_env,capture_output=True,text=True)
 assert hook.returncode==0,hook.stderr
 phase=subprocess.run([sys.executable,'-B',str(runtime/'execution_observer.py'),'phase','--root',str(root),
                       '--phase','explore','--status','running'],cwd=base,env=mobile_env,capture_output=True,text=True)
 assert phase.returncode==0,phase.stderr
 mobile_script="""
import { readFileSync } from 'node:fs';
import { executionIdentity, acceptSnapshot } from './mods/aikya-flow/lib/snapshot.js';
import { validateIndex } from './mods/aikya-flow/lib/bridge.js';
const context=JSON.parse(process.argv[1]);
const identity=await executionIdentity(context.origin_root,context.session_id);
const index=JSON.parse(readFileSync(context.cache_root+'/'+identity+'/flow-'+context.invocation_id+'.json','utf8'));
const entries=validateIndex(index,{...context,identity});
if(entries?.length!==1)throw new Error('Installed mobile skill did not publish one correlated execution');
const row=entries[0];
const raw=JSON.parse(readFileSync(context.cache_root+'/'+row.identity+'/'+row.run_id+'.json','utf8'));
const snapshot=acceptSnapshot(raw,{identity:row.identity,runId:row.run_id,command:context.command,invocationId:context.invocation_id});
if(!snapshot||snapshot.phases.find(p=>p.id==='explore').status!=='running')throw new Error('Mobile skill phase rejected');
if(snapshot.phases.find(p=>p.id==='implement').status!=='pending')throw new Error('Mobile execution fabricated implementation evidence');
console.log(JSON.stringify({result:'PASS',command:context.command,registeredRuntime:true,sourceImports:false,explore:'running',implement:'pending'}));
"""
 proc=subprocess.run(['node','--input-type=module','-e',mobile_script,json.dumps(mobile)],cwd=mods,text=True,capture_output=True)
 print(proc.stdout,end='');print(proc.stderr,end='',file=sys.stderr);assert proc.returncode==0

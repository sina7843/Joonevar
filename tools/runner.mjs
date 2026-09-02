#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import crypto from 'node:crypto';
const root=path.resolve(process.env.PROMPT_STARTER_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
const stateDir=path.join(root,'.runner');
const statusFile=path.join(root,'PROJECT_STATUS.md');
const stateFile=path.join(stateDir,'state.json');
const lockFile=path.join(stateDir,'plan.lock');
const outputFile=path.join(stateDir,'current-prompt.txt');
const read=p=>fs.readFileSync(p,'utf8').replace(/^\uFEFF/,'');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function fail(s){throw new Error(s);}
function write(p,s){fs.mkdirSync(path.dirname(p),{recursive:true});const temp=p+'.'+process.pid+'.tmp';fs.writeFileSync(temp,s);fs.renameSync(temp,p);}
function run(cmd,args){return spawnSync(cmd,args,{cwd:root,encoding:'utf8',shell:false});}
function git(args){const r=run('git',args);if(r.error||r.status!==0)fail(`git ${args[0]} failed: ${r.error?.message||r.stderr}`);return r.stdout.trim();}
function head(){const r=run('git',['rev-parse','--verify','HEAD']);return r.status===0?r.stdout.trim():null;}
function repoRoot(){const r=run('git',['rev-parse','--show-toplevel']);return r.status===0?path.resolve(r.stdout.trim()):null;}
function assertRepo(){if(repoRoot()!==root)fail('Run this package from the target Git repository root. Existing worktrees are supported. Do not run inside an unrelated parent repository.');}
function manifest(){const m=JSON.parse(read(path.join(root,'prompts/prompt-manifest.json')));if(!Array.isArray(m.prompts)||!m.prompts.length)fail('Invalid manifest');return m;}
function fingerprint(){return hash(read(path.join(root,'prompts/prompt-manifest.json')));}
function locked(){if(!fs.existsSync(lockFile))fail('Run setup first; plan is not locked.');if(JSON.parse(read(lockFile)).manifestHash!==fingerprint())fail('Manifest changed after setup; inspect the intentional plan change before proceeding.');}
function state(){return fs.existsSync(stateFile)?JSON.parse(read(stateFile)):{};}
function save(s){write(stateFile,JSON.stringify({...s,updatedAt:new Date().toISOString()},null,2)+'\n');}
function log(e){fs.mkdirSync(stateDir,{recursive:true});fs.appendFileSync(path.join(stateDir,'history.jsonl'),JSON.stringify({at:new Date().toISOString(),...e})+'\n');}
function flags(m){const text=read(statusFile);const map=new Map();for(const p of m.prompts){const found=[...text.matchAll(new RegExp(`^- \\[([ x])\\] ${p.id} — .+$`,'gm'))];if(found.length!==1)fail(`Invalid status row for ${p.id}`);map.set(p.id,found[0][1]==='x');}return {text,map};}
function id(raw,m){if(raw===undefined)return null;const s=String(raw).toUpperCase();const n=/^(?:PROMPT-)?(\d{1,3})$/.exec(s);const out=n?'PROMPT-'+n[1].padStart(3,'0'):null;if(!m.prompts.some(p=>p.id===out))fail('Unknown prompt: '+s);return out;}
function deps(p,f){const missing=p.dependsOn.filter(x=>!f.get(x));if(missing.length)fail('Incomplete dependency: '+missing.join(', '));}
function core(){const r=run(process.execPath,[path.join(root,'tools/validate-core.mjs')]);if(r.status!==0)fail(r.stderr||r.stdout);process.stdout.write(r.stdout);}
function setup(){
 core();const top=repoRoot();if(top&&top!==root)fail('Package is nested in another repository. Put the package contents at the intended repository root; no files were staged or committed.');
 if(!top)git(['init']);assertRepo();fs.mkdirSync(stateDir,{recursive:true});
 if(fs.existsSync(lockFile))locked();else write(lockFile,JSON.stringify({manifestHash:fingerprint(),createdAt:new Date().toISOString()},null,2)+'\n');
 if(!fs.existsSync(stateFile))save({currentPrompt:null});
 console.log('Setup ready. Git identity/index/history were not modified; Claude owns work commits. Use start or prepare.');
}
function status(){const m=manifest(),f=flags(m),s=state();const done=[...f.map.values()].filter(Boolean).length;const next=m.prompts.find(p=>!f.map.get(p.id));console.log(`${m.project}: ${done}/${m.prompts.length} complete\nCurrent: ${s.currentPrompt||'none'}\nNext: ${next?.id||'none'}`);}
function prepare(raw){
 locked();assertRepo();const m=manifest(),f=flags(m),s=state();const requested=id(raw,m);const p=requested?m.prompts.find(x=>x.id===requested):m.prompts.find(x=>!f.map.get(x.id));
 if(!p){if(fs.existsSync(outputFile))fs.unlinkSync(outputFile);console.log('All prompts complete. Consult production readiness separately.');return;}
 if(f.map.get(p.id))fail('Prompt already complete; use reopen if warranted.');deps(p,f.map);
 if(s.currentPrompt&&s.currentPrompt!==p.id)fail(`Finish or checkpoint current ${s.currentPrompt} before preparing a different prompt.`);
 const previous=m.prompts.slice(0,m.prompts.indexOf(p));
 if(previous.some(x=>f.map.get(x.id))){
  const r=run('git',['diff','HEAD','--','PROJECT_STATUS.md']);if(r.status!==0||r.stdout.trim())fail('Commit pending PROJECT_STATUS.md progress before preparing the next prompt.');
 }
 const text=read(path.join(root,'prompts',p.file));const body=/```text\s*\r?\n([\s\S]*?)\r?\n```/.exec(text);if(!body)fail('Missing prompt text');
 write(outputFile,body[1].trim()+'\n');
 if(s.currentPrompt!==p.id)save({currentPrompt:p.id,startHead:head(),preparedAt:new Date().toISOString()});
 log({event:'prepared',prompt:p.id});console.log(`Prepared ${p.id}: ${p.title}\n${outputFile}\nClaude executes, verifies, commits, then runs complete. No manual user approval gate.`);
}
function complete(args){
 locked();assertRepo();const m=manifest(),f=flags(m),s=state();const raw=args[0]?.startsWith('--')?undefined:args[0];const pid=id(raw,m)||s.currentPrompt;if(!pid)fail('No current prompt; prepare first.');
 const p=m.prompts.find(x=>x.id===pid);if(f.map.get(pid)){if(s.currentPrompt===pid){save({currentPrompt:null,lastCompleted:pid,recoveredAt:new Date().toISOString()});if(fs.existsSync(outputFile))fs.unlinkSync(outputFile);log({event:'completion-recovered',prompt:pid});}console.log(pid+' already complete. Ensure its progress status is committed.');return;}
 if(s.currentPrompt!==pid)fail('Complete only the prepared prompt.');deps(p,f.map);
 const at=args.indexOf('--commit');if(at<0||!args[at+1])fail('Completion requires --commit HEAD (or a current HEAD hash).');
 const ref=args[at+1];if(!/^(HEAD|[0-9a-f]{7,40})$/i.test(ref))fail('Invalid commit reference.');
 const sha=git(['rev-parse','--verify',ref+'^{commit}']);if(sha!==head())fail('Completion evidence must be committed in current HEAD.');
 if(sha===s.startHead)fail('No new work commit since prepare.');
 if(s.startHead){const anc=run('git',['merge-base','--is-ancestor',s.startHead,sha]);if(anc.status!==0)fail('Work commit must descend from prepared HEAD.');}
 const msg=git(['show','-s','--format=%B',sha]);if(!msg.includes(pid))fail('Work commit message must include '+pid);
 const reportPath=`docs/reports/${pid}.json`;
 let report;try{report=JSON.parse(git(['show',sha+':'+reportPath]));}catch{fail('A valid committed report is required: '+reportPath);}
 if(report.promptId!==pid||report.status!=='COMPLETE')fail('Committed report must identify prompt and status COMPLETE.');
 if(typeof report.summary!=='string'||report.summary.trim().length<12)fail('Concrete completion summary required.');
 if(!Array.isArray(report.blockers)||report.blockers.length)fail('Unresolved blockers prevent completion.');
 if(!Array.isArray(report.limitations)||typeof report.readiness!=='object'||!report.readiness)fail('Explicit limitations and readiness required.');
 if(!Array.isArray(report.changedFiles)||!report.changedFiles.length)fail('Committed changedFiles evidence required.');
 for(const file of report.changedFiles){if(typeof file!=='string'||path.isAbsolute(file)||file.split(/[\\/]/).includes('..'))fail('Invalid evidence path');if(git(['cat-file','-t',sha+':'+file])!=='blob')fail('Evidence file must exist in commit: '+file);}
 const checks=report.checks;if(!Array.isArray(checks))fail('Check records required.');
 for(const check of p.requiredChecks||[]){const c=checks.find(x=>x.id===check);if(!c||c.result!=='PASS'||typeof c.command!=='string'||!c.command.trim()||typeof c.evidence!=='string'||!c.evidence.trim())fail('Missing passing evidence for required check: '+check);}
 if(checks.some(x=>x.result!=='PASS'))fail('Non-passing checks cannot be included in a COMPLETE report; resolve required failures and identify optional external gaps in limitations.');
 const range=s.startHead?['diff','--name-only',s.startHead,sha,'--',reportPath]:['ls-tree','-r','--name-only',sha,'--',reportPath];
 if(!git(range).split('\n').includes(reportPath))fail('Report was not part of work since prepare.');
 const line=`- [x] ${pid} — ${p.title} <!-- work-commit:${sha} -->`;
 write(statusFile,f.text.replace(new RegExp(`^- \\[ \\] ${pid} — .+$`,'m'),line));
 save({currentPrompt:null,lastCompleted:pid,lastWorkCommit:sha});log({event:'completed',prompt:pid,commit:sha});
 if(fs.existsSync(outputFile))fs.unlinkSync(outputFile);
 console.log(`Completed ${pid} with work commit ${sha}.\nClaude must now commit only PROJECT_STATUS.md as a progress commit, report both hashes, then continue.`);
}
function reopen(args){
 locked();assertRepo();const m=manifest(),f=flags(m);const cascade=args.includes('--cascade');const target=id(args.find(a=>a!=='--cascade'),m)||[...m.prompts].reverse().find(p=>f.map.get(p.id))?.id;
 if(!target||!f.map.get(target))fail('No completed target to reopen.');
 const index=m.prompts.findIndex(p=>p.id===target),later=m.prompts.slice(index+1).filter(p=>f.map.get(p.id));if(later.length&&!cascade)fail('Later prompts completed; use --cascade.');
 const targets=(cascade?m.prompts.slice(index):[m.prompts[index]]).filter(p=>f.map.get(p.id));let text=f.text;
 for(const p of targets)text=text.replace(new RegExp(`^- \\[x\\] ${p.id} — .+$`,'m'),`- [ ] ${p.id} — ${p.title}`);
 write(statusFile,text);save({currentPrompt:null,reopened:target});log({event:'reopened',prompts:targets.map(p=>p.id)});
 if(fs.existsSync(outputFile))fs.unlinkSync(outputFile);console.log('Reopened '+targets.map(p=>p.id).join(', ')+'. Git history preserved. Record reason and commit progress update.');
}
function doctor(){console.log('Node: '+process.version);for(const cmd of ['git','claude']){const r=spawnSync(cmd,['--version'],{cwd:root,encoding:'utf8',shell:process.platform==='win32'});console.log(`${cmd}: ${r.status===0?(r.stdout||r.stderr).trim():'not available (required to execute in target environment)'}`);}}
function help(){console.log(`Hamzist Runner — agent-owned completion
setup                 validate package; initialize Git only if absent; no auto-stage/commit
prepare | next [N]    prepare next eligible prompt, preserve active baseline on resume
complete | done [N] --commit HEAD
                      verify committed report, mark progress; Claude commits that update
status                show persisted progress
check                 validate package + sequential progress
reopen [N] [--cascade] reopen progress without rewriting Git history
start                 shell wrappers start Claude with START_CLAUDE.md
start-step [N]        shell wrappers start Claude with one active prompt
doctor                inspect local tool availability
Typical implementation loop: prepare -> implement -> verify -> commit -> complete -> progress commit.
No unattended model subprocess loop, no automatic push/deploy, no fabricated test results.`);}
const [command='help',...args]=process.argv.slice(2);
try{switch(command){case'setup':setup();break;case'prepare':case'next':prepare(args[0]);break;case'complete':case'done':complete(args);break;case'status':status();break;case'reopen':reopen(args);break;case'check':case'validate':{core();const m=manifest(),f=flags(m);let gap=false;for(const p of m.prompts){if(!f.map.get(p.id))gap=true;else {if(gap)fail('Completed prompt after incomplete predecessor');deps(p,f.map);}}console.log('Sequential status valid.');break;}case'doctor':doctor();break;case'help':case'--help':case'-h':help();break;default:fail('Unknown command: '+command);}}
catch(e){console.error('ERROR: '+e.message);process.exitCode=1;}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
const base=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const runner=path.join(base,'tools/runner.mjs');
const roots=[];
process.on('exit',()=>{for(const r of roots)fs.rmSync(r,{recursive:true,force:true});});
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hamzist-runner-'));roots.push(root);
 for(const p of ['prompts','.runner','docs/reports'])fs.mkdirSync(path.join(root,p),{recursive:true});
 const prompts=[1,2,3].map(n=>({id:`PROMPT-${String(n).padStart(3,'0')}`,title:'Step '+n,file:`${String(n).padStart(3,'0')}-step.md`,dependsOn:n===1?[]:[`PROMPT-${String(n-1).padStart(3,'0')}`],requiredChecks:['behavior-check']}));
 const m=JSON.stringify({project:'Fixture',promptCount:3,prompts});fs.writeFileSync(path.join(root,'prompts/prompt-manifest.json'),m);
 for(const p of prompts)fs.writeFileSync(path.join(root,'prompts',p.file),`# ${p.id}\n\n\`\`\`text\nExecute ${p.id}.\n\`\`\`\n`);
 fs.writeFileSync(path.join(root,'PROJECT_STATUS.md'),prompts.map(p=>`- [ ] ${p.id} — ${p.title}`).join('\n')+'\n');
 fs.writeFileSync(path.join(root,'.gitignore'),'.runner/\n');
 fs.writeFileSync(path.join(root,'.runner/plan.lock'),JSON.stringify({manifestHash:crypto.createHash('sha256').update(m).digest('hex')}));
 const g=(...args)=>{const r=spawnSync('git',args,{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 g('init');g('config','user.name','Test Fixture');g('config','user.email','test@local.invalid');g('config','commit.gpgSign','false');g('add','.');g('commit','-m','fixture baseline');
 return {root,g,prompts};
}
function run(f,...args){return spawnSync(process.execPath,[runner,...args],{cwd:f.root,encoding:'utf8',env:{...process.env,PROMPT_STARTER_ROOT:f.root}});}
function ok(r){assert.equal(r.status,0,r.stderr);return r;}
function report(f,n=1,patch={}){
 const pid=`PROMPT-${String(n).padStart(3,'0')}`;const file=`docs/reports/${pid}.json`;
 const data={promptId:pid,status:'COMPLETE',summary:'Concrete fixture behavior implemented and checked',changedFiles:[file],decisions:[],checks:[{id:'behavior-check',command:'fixture test',result:'PASS',evidence:'observed fixture behavior'}],blockers:[],limitations:[],readiness:{code:'VERIFIED',production:'NOT_READY'},...patch};
 fs.writeFileSync(path.join(f.root,file),JSON.stringify(data));return file;
}
function work(f,n=1,patch={}){const p=report(f,n,patch);f.g('add','--',p);f.g('commit','-m',`feat: PROMPT-${String(n).padStart(3,'0')} fixture work`);return f.g('rev-parse','HEAD');}
function progress(f){f.g('add','--','PROJECT_STATUS.md');f.g('commit','-m','chore: progress');}
test('help and first prompt preparation',()=>{const f=fixture();assert.match(ok(run(f,'help')).stdout,/agent-owned/);ok(run(f,'prepare'));assert.equal(fs.readFileSync(path.join(f.root,'.runner/current-prompt.txt'),'utf8'),'Execute PROMPT-001.\n');});
test('dependencies block skipping ahead',()=>{const f=fixture();const r=run(f,'prepare','3');assert.notEqual(r.status,0);assert.match(r.stderr,/dependency/);});
test('same prompt resume preserves starting HEAD',()=>{const f=fixture();ok(run(f,'prepare'));const start=JSON.parse(fs.readFileSync(path.join(f.root,'.runner/state.json'))).startHead;work(f);ok(run(f,'prepare'));assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'.runner/state.json'))).startHead,start);});
test('cannot complete without work commit',()=>{const f=fixture();ok(run(f,'prepare'));report(f);const r=run(f,'complete','1','--commit','HEAD');assert.notEqual(r.status,0);assert.match(r.stderr,/No new work commit/);});
test('reads committed evidence, rejects uncommitted corrected report',()=>{const f=fixture();ok(run(f,'prepare'));work(f,1,{status:'PARTIAL'});report(f,1);const r=run(f,'complete','1','--commit','HEAD');assert.notEqual(r.status,0);assert.match(r.stderr,/status COMPLETE/);});
test('rejects skipped required check',()=>{const f=fixture();ok(run(f,'prepare'));work(f,1,{checks:[{id:'behavior-check',command:'fixture test',result:'SKIP',evidence:'not run'}]});const r=run(f,'complete','1','--commit','HEAD');assert.notEqual(r.status,0);assert.match(r.stderr,/required check/);});
test('rejects blockers even with COMPLETE label',()=>{const f=fixture();ok(run(f,'prepare'));work(f,1,{blockers:['missing test']});assert.notEqual(run(f,'complete','1','--commit','HEAD').status,0);});
test('requires current HEAD evidence',()=>{const f=fixture();ok(run(f,'prepare'));const sha=work(f);f.g('commit','--allow-empty','-m','fixture unrelated');const r=run(f,'complete','1','--commit',sha);assert.notEqual(r.status,0);assert.match(r.stderr,/current HEAD/);});
test('success records hash, requires progress commit before next',()=>{const f=fixture();ok(run(f,'prepare'));const sha=work(f);ok(run(f,'complete','1','--commit','HEAD'));assert.ok(fs.readFileSync(path.join(f.root,'PROJECT_STATUS.md'),'utf8').includes('work-commit:'+sha));assert.notEqual(run(f,'prepare').status,0);progress(f);assert.match(ok(run(f,'prepare')).stdout,/PROMPT-002/);});
test('completion is idempotent after interruption before progress commit',()=>{const f=fixture();ok(run(f,'prepare'));work(f);ok(run(f,'complete','1','--commit','HEAD'));assert.match(ok(run(f,'complete','1','--commit','HEAD')).stdout,/already complete/);});
test('completion preserves unrelated user staged changes',()=>{const f=fixture();ok(run(f,'prepare'));work(f);fs.writeFileSync(path.join(f.root,'user.txt'),'user work');f.g('add','user.txt');const before=f.g('diff','--cached');ok(run(f,'complete','1','--commit','HEAD'));assert.equal(f.g('diff','--cached'),before);});
test('reopen cascades progress and preserves commit history',()=>{const f=fixture();for(const n of [1,2]){ok(run(f,'prepare'));work(f,n);ok(run(f,'complete',String(n),'--commit','HEAD'));progress(f);}const sha=f.g('rev-parse','HEAD');assert.notEqual(run(f,'reopen','1').status,0);ok(run(f,'reopen','1','--cascade'));assert.match(fs.readFileSync(path.join(f.root,'PROJECT_STATUS.md'),'utf8'),/- \[ \] PROMPT-001/);assert.equal(f.g('rev-parse','HEAD'),sha);});
test('manifest lock mismatch is rejected',()=>{const f=fixture();fs.appendFileSync(path.join(f.root,'prompts/prompt-manifest.json'),' ');assert.match(run(f,'prepare').stderr,/Manifest changed/);});
test('runner refuses a nested directory in another repo',()=>{const f=fixture();const nested=path.join(f.root,'nested');fs.mkdirSync(nested);fs.cpSync(path.join(f.root,'prompts'),path.join(nested,'prompts'),{recursive:true});fs.cpSync(path.join(f.root,'.runner'),path.join(nested,'.runner'),{recursive:true});fs.copyFileSync(path.join(f.root,'PROJECT_STATUS.md'),path.join(nested,'PROJECT_STATUS.md'));const r=run({root:nested},'prepare');assert.notEqual(r.status,0);assert.match(r.stderr,/repository root/);});

test('repair interruption between status write and runner-state write',()=>{const f=fixture();ok(run(f,'prepare'));work(f);ok(run(f,'complete','1','--commit','HEAD'));fs.writeFileSync(path.join(f.root,'.runner/state.json'),JSON.stringify({currentPrompt:'PROMPT-001'}));ok(run(f,'complete','1','--commit','HEAD'));assert.equal(JSON.parse(fs.readFileSync(path.join(f.root,'.runner/state.json'))).currentPrompt,null);progress(f);assert.match(ok(run(f,'prepare')).stdout,/PROMPT-002/);});
test('phase 2 runs its own package with derived order and checks, leaving phase 1 progress untouched',()=>{
 const f=fixture();fs.mkdirSync(path.join(f.root,'prompts-2'));fs.mkdirSync(path.join(f.root,'.runner/phase-2'),{recursive:true});
 // Shape of the delivered phase 2 manifest: bare ids, a prompts/ path, no dependsOn, no requiredChecks, no fenced text block.
 const m=JSON.stringify({version:'1.0',count:2,prompts:[1,2].map(n=>({id:`00${n}`,slug:'s'+n,title:'Phase two '+n,file:`prompts/00${n}-p.md`}))});
 fs.writeFileSync(path.join(f.root,'prompts-2/prompt-manifest.json'),m);
 for(const n of [1,2])fs.writeFileSync(path.join(f.root,`prompts-2/00${n}-p.md`),`# PROMPT-00${n}\n\nPhase two body ${n}.\n`);
 fs.writeFileSync(path.join(f.root,'PROJECT_STATUS-PHASE-2.md'),'- [ ] PROMPT-001 — Phase two 1\n- [ ] PROMPT-002 — Phase two 2\n');
 fs.writeFileSync(path.join(f.root,'.runner/phase-2/plan.lock'),JSON.stringify({manifestHash:crypto.createHash('sha256').update(m).digest('hex')}));
 f.g('add','.');f.g('commit','-m','phase 2 fixture');
 const phase1=fs.readFileSync(path.join(f.root,'PROJECT_STATUS.md'),'utf8');
 assert.match(run(f,'prepare','2','--phase','2').stderr,/Incomplete dependency: PROMPT-001/);
 ok(run(f,'--phase','2','prepare'));
 assert.match(fs.readFileSync(path.join(f.root,'.runner/phase-2/current-prompt.txt'),'utf8'),/Phase two body 1/);
 const file='docs/reports/phase-2/PROMPT-001.json';fs.mkdirSync(path.join(f.root,'docs/reports/phase-2'),{recursive:true});
 const data={promptId:'PROMPT-001',status:'COMPLETE',summary:'Concrete phase two fixture behavior',changedFiles:[file],checks:['typecheck','build','product-tests'].map(id=>({id,command:'fixture',result:'PASS',evidence:'observed'})),blockers:[],limitations:[],readiness:{}};
 const commit=msg=>{fs.writeFileSync(path.join(f.root,file),JSON.stringify(data));f.g('add','--',file);f.g('commit','-m',msg);};
 commit('feat: PROMPT-001 phase two');
 assert.match(run(f,'--phase','2','complete','--commit','HEAD').stderr,/required check: browser-tests/);
 data.checks.push({id:'browser-tests',command:'fixture',result:'PASS',evidence:'observed'});commit('feat: PROMPT-001 phase two browser evidence');
 ok(run(f,'--phase','2','complete','--commit','HEAD'));
 assert.match(fs.readFileSync(path.join(f.root,'PROJECT_STATUS-PHASE-2.md'),'utf8'),/^- \[x\] PROMPT-001 — Phase two 1 <!-- work-commit:[0-9a-f]{40} -->$/m);
 assert.equal(fs.readFileSync(path.join(f.root,'PROJECT_STATUS.md'),'utf8'),phase1);
 assert.match(run(f,'--phase','3','status').stderr,/Unknown phase: 3/);
});
test('supports existing Git worktree metadata file',()=>{const f=fixture();const wt=path.join(os.tmpdir(),'hamzist-worktree-'+crypto.randomUUID());roots.push(wt);f.g('worktree','add','--detach',wt);fs.mkdirSync(path.join(wt,'.runner'),{recursive:true});fs.copyFileSync(path.join(f.root,'.runner/plan.lock'),path.join(wt,'.runner/plan.lock'));assert.ok(fs.statSync(path.join(wt,'.git')).isFile());assert.match(ok(run({root:wt},'prepare')).stdout,/PROMPT-001/);});

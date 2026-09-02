#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(process.env.PROMPT_STARTER_ROOT||path.join(path.dirname(fileURLToPath(import.meta.url)),'..'));
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const required=['CLAUDE.md','EXECUTION_CONTRACT.md','Requirements.md','ARCHITECTURE_BASELINE.md','IMPLEMENTATION_DECISIONS.md','DECISIONS.md','IMPLEMENTATION_STATUS.md','PROJECT_STATUS.md','REQUIREMENTS_TRACEABILITY.md','ACCEPTANCE_MATRIX.md','START_CLAUDE.md','README_START_HERE_FA.md','REFERENCES.md','SOURCE_DISCOVERY.md','source-manifest.json','starter.config.json','RUNNER.cmd','runner.ps1','runner.sh','tools/runner.mjs','tools/tests/runner.test.mjs','.claude/settings.json','.claude/hooks/local-guard.mjs','.claude/tests/guardrails.test.mjs'];
for(const p of required)assert.ok(fs.existsSync(path.join(root,p)),`Missing ${p}`);
const m=JSON.parse(read('prompts/prompt-manifest.json'));const config=JSON.parse(read('starter.config.json'));
assert.equal(m.promptCount,m.prompts.length);assert.ok(m.promptCount>=config.minPrompts&&m.promptCount<=config.maxPrompts);assert.equal(m.completionOwner,'claude');
const f=fs.readdirSync(path.join(root,'prompts')).filter(p=>/^\d{3}-.+\.md$/.test(p));assert.equal(f.length,m.promptCount);
const trace=JSON.parse(read('prompts/requirements-traceability.json'));assert.deepEqual(Object.keys(trace),m.prompts.map(p=>p.id));
const status=read('PROJECT_STATUS.md');const seen=new Set();
for(let i=0;i<m.prompts.length;i++){
 const p=m.prompts[i];assert.equal(p.id,`PROMPT-${String(i+1).padStart(3,'0')}`);assert.ok(!seen.has(p.file));seen.add(p.file);
 assert.ok(p.file.startsWith(String(i+1).padStart(3,'0')+'-')&&!p.file.includes('/')&&!p.file.includes('\\'));
 assert.deepEqual(p.dependsOn,i?[m.prompts[i-1].id]:[]);
 const text=read('prompts/'+p.file);assert.equal((text.match(/```text\n/g)||[]).length,1);assert.match(text,new RegExp('^# '+p.id));assert.match(text,/Git commit/);assert.match(text,/DEC-NNNN/);assert.match(text,/--commit HEAD/);
 assert.ok(p.requiredChecks.length>0);assert.equal(new Set(p.requiredChecks).size,p.requiredChecks.length);
 assert.ok(trace[p.id].requirementAreas.length);assert.deepEqual(trace[p.id].requiredChecks,p.requiredChecks);
 assert.equal((status.match(new RegExp('^- \\[[ x]\\] '+p.id+' — .+$','gm'))||[]).length,1);
}
const source=JSON.parse(read('source-manifest.json'));
for(const p of ['Requirements.md','reference-inputs/Hamzist_Project_Reference_v1.1.md']){
 const bytes=fs.readFileSync(path.join(root,p));assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),source.product.sha256,'Original source changed: '+p);
}
const ref=read('Requirements.md'), matrix=read('ACCEPTANCE_MATRIX.md'), mapping=read('REQUIREMENTS_TRACEABILITY.md');
for(let n=1;n<=29;n++){const key='s'+String(n).padStart(2,'0');assert.ok(Object.values(trace).some(v=>v.requirementAreas.includes(key)));assert.ok(mapping.includes('Requirements.md#'+key));}
for(let n=1;n<=19;n++){const key='D'+String(n).padStart(2,'0');assert.ok(Object.values(trace).some(v=>v.decisions.includes(key)));assert.ok(mapping.includes('| '+key+' |'));}
const rows=[...ref.matchAll(/^- \[ \] (.+)$/gm)];assert.equal(rows.length,33);for(const row of rows)assert.ok(matrix.includes(row[1]),'Missing exact source acceptance row');
const links=[...ref.matchAll(/https?:\/\/[^\s)<>]+/g)].map(x=>x[0]);for(const link of links)assert.ok(read('REFERENCES.md').includes(link));
const settings=JSON.parse(read('.claude/settings.json'));assert.equal(settings.permissions.defaultMode,'acceptEdits');assert.ok(settings.permissions.allow.includes('Bash(git commit *)'));
for(const event of Object.values(settings.hooks||{}))for(const hook of event)for(const h of hook.hooks){assert.equal(h.type,'command');assert.ok(h.command.includes('node '));assert.equal(h.args,undefined);}
console.log(`Package valid: ${m.promptCount} prompts; 29 sections; 19 decisions; ${rows.length} exact acceptance rows; source hashes and links intact. Product implementation NOT asserted.`);

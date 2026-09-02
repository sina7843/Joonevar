import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import test from 'node:test';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const hook=path.join(root,'.claude/hooks/local-guard.mjs');
function check(tool,input){return spawnSync(process.execPath,[hook],{cwd:root,encoding:'utf8',input:JSON.stringify({tool_name:tool,tool_input:input}),env:{...process.env,CLAUDE_PROJECT_DIR:root}});}
test('ordinary local commit permitted',()=>assert.equal(check('Bash',{command:'git commit -m "feat: PROMPT-001"'}).status,0));
test('decisions and runtime report edits permitted',()=>{for(const p of ['DECISIONS.md','docs/reports/PROMPT-001.json','PROJECT_STATUS.md'])assert.equal(check('Write',{file_path:path.join(root,p)}).status,0);});
test('original reference protected',()=>assert.equal(check('Write',{file_path:path.join(root,'Requirements.md')}).status,2));
test('source reads allowed',()=>assert.equal(check('Read',{file_path:path.join(root,'Requirements.md')}).status,0));
test('real env read denied, example allowed',()=>{assert.equal(check('Read',{file_path:path.join(root,'.env.production')}).status,2);assert.equal(check('Read',{file_path:path.join(root,'.env.example')}).status,0);});
test('remote pushes and destructive git denied',()=>{for(const command of ['git push origin main','git reset --hard HEAD','git clean -fd','git commit --amend','git commit --no-verify -m x'])assert.equal(check('Bash',{command}).status,2);});
test('runner complete allowed',()=>assert.equal(check('Bash',{command:'node tools/runner.mjs complete 1 --commit HEAD'}).status,0));

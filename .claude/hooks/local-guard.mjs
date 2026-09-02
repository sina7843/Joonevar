import fs from 'node:fs';
import path from 'node:path';
function deny(reason){process.stderr.write(reason+'\n');process.exit(2);}
let input;try{input=JSON.parse(fs.readFileSync(0,'utf8')||'{}');}catch{deny('Invalid hook input.');}
const tool=input.tool_name||'';const data=input.tool_input||{};
const root=path.resolve(process.env.CLAUDE_PROJECT_DIR||input.cwd||process.cwd());
const file=data.file_path||data.notebook_path;
if(file){
 const full=path.resolve(root,file);let rel=path.relative(root,full).replaceAll('\\','/');
 const base=path.basename(full);const writing=['Edit','Write','NotebookEdit'].includes(tool);
 if((base==='.env'||base.startsWith('.env.'))&&base!=='.env.example')deny('Real environment file is protected; use documented names and .env.example.');
 if(/(?:^|\/)(?:secrets|\.ssh)(?:\/|$)|\.(?:pem|key|p12|pfx)$/.test(rel))deny('Private credential material is protected.');
 if(writing&&(rel==='Requirements.md'||rel.startsWith('reference-inputs/')||rel==='.git'||rel.startsWith('.git/')))deny('Original reference or internal Git metadata is protected. Record technical decisions in DECISIONS.md; use Git CLI for local commits.');
 if(writing&&fs.existsSync(full)){
  const real=fs.realpathSync(full);const rr=path.relative(root,real).replaceAll('\\','/');
  if(rr==='Requirements.md'||rr.startsWith('reference-inputs/')||rr==='.git'||rr.startsWith('.git/'))deny('A symlink cannot be used to overwrite a protected original.');
 }
}
if(tool==='Bash'){
 const c=String(data.command||'');
 if(/\bgit\s+(?:-[Cc]\s+\S+\s+)*push\b/i.test(c))deny('This workflow authorizes local commits only; remote push is not part of the task.');
 if(/\bgit\s+(?:-[Cc]\s+\S+\s+)*(?:reset\s+--hard|clean\b)/i.test(c))deny('Destructive Git cleanup is not authorized. Preserve user changes.');
 if(/\bgit\s+commit\b[^\n]*(?:--amend|--no-verify)\b/i.test(c))deny('Create ordinary new commits and respect hooks; do not amend or skip verification.');
 if(/\bdocker\s+(?:volume|system)\s+prune\b|\bdocker\s+compose\b[^\n]*\bdown\b[^\n]*(?:\s-v\b|--volumes)/i.test(c))deny('Destructive persistent-data cleanup is not authorized.');
}

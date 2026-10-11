'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const omit=new Set(['node_modules','.git','dist','.verification']);
const failures=[];let scanned=0;
const rules=[
 ['personal absolute path',/(?:[A-Z]:[\\/]Users[\\/][^\\/\s"']+|\/home\/[^/\s"']+|\/Users\/[^/\s"']+)/gi],
 ['access token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9_-]{24,})\b/g],
 ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g]
];
function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
 if(omit.has(e.name))continue;
 const p=path.join(dir,e.name),relative=path.relative(root,p).replaceAll('\\','/');
 if(e.isSymbolicLink()){failures.push(`${relative}: symlink is not permitted`);continue;}
 if(e.isDirectory()){walk(p);continue;}
 if(/^(?:\.env(?:\.|$)|dashboard-state\.json|auth\.json|cookies|credentials)/i.test(e.name)||/\.(?:pfx|pem|key|log)$/i.test(e.name)){failures.push(`${relative}: private or runtime file`);continue;}
 if(!/\.(?:cjs|js|json|html|css|md|txt|ya?ml)$/.test(e.name)&&e.name!=='LICENSE'&&e.name!=='.gitignore')continue;
 const source=fs.readFileSync(p,'utf8');scanned++;
 for(const [name,re] of rules){re.lastIndex=0;if(re.test(source))failures.push(`${relative}: ${name}`);}
}}
walk(root);
if(failures.length){console.error(failures.join('\n'));process.exitCode=1;}
else console.log(`Privacy scan passed: ${scanned} text files; no local profiles, private paths or credential patterns.`);

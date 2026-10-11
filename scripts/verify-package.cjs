'use strict';
const fs=require('node:fs'),path=require('node:path'),asar=require('@electron/asar'),assert=require('node:assert/strict');
const base=path.resolve(process.argv[2]||'dist/win-unpacked'),archive=path.join(base,'resources','app.asar');
const entries=asar.listPackage(archive).map(x=>x.replaceAll('\\','/').replace(/^\//,''));
for(const name of entries){assert.ok(name==='app'||name.startsWith('app/')||['package.json','LICENSE','NOTICE.md'].includes(name),`Unexpected packaged file: ${name}`);}
for(const name of entries.filter(x=>/\.(?:js|cjs|json|html|css|md)$/.test(x))){let content;try{content=asar.extractFile(archive,name).toString('utf8');}catch{continue;}
 assert.ok(!/(?:[A-Z]:[\\/]Users[\\/][^\\/\s"']+|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(content),`Private content in ${name}`);
}
for(const name of ['app/main.cjs','app/ui/i18n.js','LICENSE','NOTICE.md'])assert.ok(entries.includes(name),`Missing ${name}`);
for(const name of ['Codex Reset Dashboard.exe','LICENSE.electron.txt','LICENSES.chromium.html'])assert.ok(fs.existsSync(path.join(base,name)),`Missing ${name}`);
console.log(`Packaged privacy/content check passed: ${entries.length} archive entries.`);

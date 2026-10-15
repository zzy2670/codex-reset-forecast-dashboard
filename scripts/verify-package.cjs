'use strict';
const fs=require('node:fs'),path=require('node:path'),asar=require('@electron/asar'),assert=require('node:assert/strict');
const base=path.resolve(process.argv[2]||'dist/win-unpacked'),archive=path.join(base,'resources','app.asar');
const entries=asar.listPackage(archive).map(x=>x.replaceAll('\\','/').replace(/^\//,''));
for(const name of entries){assert.ok(name==='app'||name.startsWith('app/')||['package.json','LICENSE','NOTICE.md'].includes(name),`Unexpected packaged file: ${name}`);}
for(const name of entries.filter(x=>/\.(?:js|cjs|json|html|css|md)$/.test(x))){const content=asar.extractFile(archive,name.split('/').join(path.sep)).toString('utf8');
 assert.ok(!/(?:[A-Z]:[\\/]Users[\\/][^\\/\s"']+|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(content),`Private content in ${name}`);
}
for(const name of ['app/main.cjs','app/ui/i18n.js','LICENSE','NOTICE.md'])assert.ok(entries.includes(name),`Missing ${name}`);
for(const name of ['Codex Reset Dashboard.exe','LICENSE.electron.txt','LICENSES.chromium.html'])assert.ok(fs.existsSync(path.join(base,name)),`Missing ${name}`);
const crypto=require('node:crypto'),expected=require('../third_party/codex/runtime.json');
const runtime=path.join(base,'resources','codex');
assert.deepEqual(fs.readdirSync(runtime).sort(),['LICENSE','NOTICE','codex.exe','runtime.json'].sort());
assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(runtime,'codex.exe'))).digest('hex'),expected.sha256,'Official Codex checksum');
assert.deepEqual(JSON.parse(fs.readFileSync(path.join(runtime,'runtime.json'),'utf8')),expected);
for(const name of ['LICENSE','NOTICE'])assert.ok(fs.readFileSync(path.join(runtime,name)).equals(fs.readFileSync(path.join(__dirname,'..','third_party','codex',name))),`Codex ${name} differs`);
console.log(`Packaged privacy/content check passed: ${entries.length} archive entries.`);

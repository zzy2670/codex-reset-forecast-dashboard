'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
function cleanFolder(value){return typeof value==='string'?value.trim().replace(/^"(.*)"$/,'$1'):'';}
function codexCandidates(options={}){
 const env=options.env||process.env,home=options.home||os.homedir(),resourcesPath=options.resourcesPath===undefined?process.resourcesPath:options.resourcesPath;
 const candidates=[],add=p=>{if(p&&!candidates.includes(p))candidates.push(p);};
 if(resourcesPath)add(path.join(resourcesPath,'codex','codex.exe'));
 const arch=options.arch||process.arch,target=arch==='arm64'?'aarch64-pc-windows-msvc':'x86_64-pc-windows-msvc';
 const prefixes=[path.join(env.APPDATA||path.join(home,'AppData','Roaming'),'npm'),env.npm_config_prefix,env.NPM_CONFIG_PREFIX];
 const folders=(env.PATH||env.Path||'').split(options.delimiter||path.delimiter).map(cleanFolder).filter(Boolean);
 for(const folder of folders){add(path.join(folder,'codex.exe'));prefixes.push(folder);}
 for(const prefixValue of prefixes){const prefix=cleanFolder(prefixValue);if(!prefix)continue;
  const scoped=path.join(prefix,'node_modules','@openai');
  for(const root of [path.join(scoped,'codex'),path.join(scoped,`codex-win32-${arch}`),path.join(scoped,'codex','node_modules','@openai',`codex-win32-${arch}`),path.join(scoped,'codex-sdk')]){
   for(const tail of [['vendor',target,'codex','codex.exe'],['vendor',target,'bin','codex.exe'],['vendor',target,'codex.exe']])add(path.join(root,...tail));
  }
 }
 return candidates;
}
function findCodex(options={}){
 const isFile=options.isFile||function(file){try{return fs.statSync(file).isFile();}catch{return false;}};
 return codexCandidates(options).find(isFile)||null;
}
module.exports={codexCandidates,findCodex};

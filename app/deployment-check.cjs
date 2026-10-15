'use strict';
const fs=require('node:fs'),path=require('node:path');
async function deploymentReport(client,version){
 try{
  const status=await client.setupStatus();
  if(status.errorCode)return {version,status:'error',quotaConnected:false,reasonCode:status.errorCode};
  if(!status.authenticated)return {version,status:'login_required',quotaConnected:false,reasonCode:'CHATGPT_LOGIN_REQUIRED'};
  const quota=await client.read();
  const valid=quota?.state==='ok'&&quota.limits?.some(b=>['primary','secondary'].some(k=>b[k]&&Number.isFinite(b[k].usedPercent)&&b[k].durationMins>0&&Date.parse(b[k].resetsAt)>Date.now()));
  return valid?{version,status:'ready',quotaConnected:true,reasonCode:null}:{version,status:'error',quotaConnected:false,reasonCode:'QUOTA_UNAVAILABLE'};
 }catch(error){return {version,status:'error',quotaConnected:false,reasonCode:['RUNTIME_MISSING','REQUEST_TIMEOUT','CONNECTION_CLOSED'].includes(error.code)?error.code:'QUOTA_UNAVAILABLE'};}
}
function writeDeploymentReport(file,report){
 if(!path.isAbsolute(file))throw new Error('RESULT_PATH_INVALID');
 fs.mkdirSync(path.dirname(file),{recursive:true});const temp=file+'.tmp';fs.writeFileSync(temp,JSON.stringify(report)+'\n');
 try{fs.renameSync(temp,file);}catch(error){if(error.code!=='EXDEV')throw error;fs.copyFileSync(temp,file);fs.unlinkSync(temp);}
}
async function stopClient(client){
 const child=client.child;if(!child){client.stop();return;}
 const stopped=new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);resolve();};child.once('exit',done);timer=setTimeout(()=>{if(child.exitCode===null)child.kill();done();},1500);});
 client.stop();await stopped;
}
module.exports={deploymentReport,writeDeploymentReport,stopClient};

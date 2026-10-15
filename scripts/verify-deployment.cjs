'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawn}=require('node:child_process');
const asar=require('@electron/asar');

function run(executable,args,env){
  return new Promise((resolve,reject)=>{
    const child=spawn(executable,args,{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='',oversized=false,timedOut=false;
    const stop=()=>{try{child.kill();}catch{}};
    const timer=setTimeout(()=>{timedOut=true;stop();},100000);
    const collect=key=>chunk=>{
      if(key==='stdout')stdout+=chunk;else stderr+=chunk;
      if(stdout.length+stderr.length>1024*1024){oversized=true;stop();}
    };
    child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
    child.stdout.on('data',collect('stdout'));child.stderr.on('data',collect('stderr'));
    child.once('error',()=>{clearTimeout(timer);reject(new Error('DEPLOYMENT_PROCESS_START_FAILED'));});
    // Electron's detached helpers can retain inherited stdio after the app exits.
    // The app's exit code and atomic report establish completion; pipe closure does not.
    child.once('exit',(code)=>{
      clearTimeout(timer);
      if(timedOut)return reject(new Error('DEPLOYMENT_PROCESS_TIMEOUT'));
      if(oversized)return reject(new Error('DEPLOYMENT_OUTPUT_LIMIT'));
      setTimeout(()=>{child.stdout.destroy();child.stderr.destroy();resolve({code,stdout,stderr});},200);
    });
  });
}

function validate(report,version){
  assert.deepEqual(Object.keys(report).sort(),['version','status','quotaConnected','reasonCode'].sort(),'REPORT_FIELDS');
  assert.equal(report.version,version,'REPORT_VERSION');
  assert.equal(report.status,'login_required','EMPTY_HOME_LOGIN_STATUS');
  assert.equal(report.quotaConnected,false,'EMPTY_HOME_QUOTA_DISCONNECTED');
  assert.equal(report.reasonCode,'CHATGPT_LOGIN_REQUIRED','EMPTY_HOME_REASON');
}

async function main(){
  assert.equal(process.platform,'win32','WINDOWS_REQUIRED');
  assert.ok(process.env.DASHBOARD_TEST_EXE,'PACKAGED_EXECUTABLE_REQUIRED');
  const executable=path.resolve(process.env.DASHBOARD_TEST_EXE);
  assert.ok(fs.statSync(executable).isFile(),'PACKAGED_EXECUTABLE_MISSING');
  const archive=path.join(path.dirname(executable),'resources','app.asar');
  const packagedMain=asar.extractFile(archive,path.join('app','main.cjs')).toString('utf8');
  assert.ok(packagedMain.includes('--deployment-check')&&packagedMain.includes('--deployment-isolated-home='),'SAFE_DEPLOYMENT_MODE_MISSING');
  const version=require('../package.json').version;
  assert.equal(JSON.parse(asar.extractFile(archive,'package.json').toString('utf8')).version,version,'PACKAGED_VERSION');
  assert.ok(fs.statSync(path.join(path.dirname(executable),'resources','codex','codex.exe')).isFile(),'BUNDLED_CODEX_MISSING');
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'codex-deployment-verification-'));
  try{
    const codexHome=path.join(root,'codex-home'),managedHome=path.join(root,'managed-home');
    for(const dir of [codexHome,managedHome])fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(codexHome,'config.toml'),'cli_auth_credentials_store = "file"\n');
    const env={...process.env};
    for(const key of Object.keys(env)){
      if(/^(?:OPENAI_|AZURE_OPENAI_|CODEX_API_KEY$|CODEX_HOME$|NODE_OPTIONS$|NODE_PATH$|NPM_CONFIG_PREFIX$|PATH$|ELECTRON_RUN_AS_NODE$|ELECTRON_ENABLE_LOGGING$|ELECTRON_ENABLE_STACK_DUMPING$|DASHBOARD_DEPLOYMENT_ISOLATED_HOME$)/i.test(key))delete env[key];
    }
    const systemRoot=env.SystemRoot||env.SYSTEMROOT||'C:\\Windows';
    Object.assign(env,{
      CODEX_HOME:codexHome,DASHBOARD_DEPLOYMENT_ISOLATED_HOME:managedHome,
      PATH:[path.join(systemRoot,'System32'),systemRoot].join(path.delimiter)
    });
    for(let attempt=0;attempt<2;attempt++){
      console.error(JSON.stringify({phase:`direct_check_${attempt+1}`,status:'starting'}));
      const reportFile=path.join(root,`result-${attempt}.json`);
      const child=await run(executable,[
        '--deployment-check',`--deployment-result=${reportFile}`,`--deployment-isolated-home=${managedHome}`
      ],env);
      assert.equal(child.code,2,'EMPTY_HOME_EXIT_CODE');
      assert.ok(child.stdout.split(/\r?\n/).every(line=>!line.trim()||line.trim()==='[WARNING] Ignore caches that are heterogeneous'),'UNEXPECTED_DEPLOYMENT_STDOUT');
      validate(JSON.parse(fs.readFileSync(reportFile,'utf8')),version);
      console.error(JSON.stringify({phase:`direct_check_${attempt+1}`,status:'passed'}));
    }
    const powershell=path.join(systemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');
    console.error(JSON.stringify({phase:'installer_check_only',status:'starting'}));
    const checked=await run(powershell,[
      '-NoProfile','-NonInteractive','-File',path.join(__dirname,'install.ps1'),
      '-CheckOnly','-NoLaunch','-InstallDir',path.dirname(executable)
    ],env);
    assert.equal(checked.code,2,'SCRIPT_CHECK_ONLY_EXIT_CODE');
    validate(JSON.parse(checked.stdout.trim()),version);
    console.error(JSON.stringify({phase:'installer_check_only',status:'passed'}));
    assert.equal(fs.existsSync(path.join(codexHome,'auth.json')),false,'NO_AUTH_CREATED');
    assert.equal(fs.existsSync(path.join(managedHome,'codex-account')),false,'NO_MANAGED_LOGIN_STARTED');
    const userDataStates=[];
    function scan(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const file=path.join(dir,entry.name);
      if(entry.isDirectory())scan(file);else if(entry.name==='dashboard-state.json')userDataStates.push(file);
    }}
    scan(root);
    assert.equal(userDataStates.length,0,'NO_DASHBOARD_STATE_WRITTEN');
    console.log(JSON.stringify({ok:true,version,emptyHomeLoginRequired:true,noExternalCliRequired:true,repeatedChecks:2,installerCheckOnly:true,loginStarted:false,testNotifications:false}));
  }finally{try{fs.rmSync(root,{recursive:true,force:true,maxRetries:4,retryDelay:100});}catch{}}
}

main().catch(error=>{
  const detail=typeof error.message==='string'?error.message.split('\n')[0]:'';
  const reason=/^[A-Z_]+$/.test(detail)?detail:'DEPLOYMENT_VERIFICATION_FAILED';
  console.error(JSON.stringify({ok:false,reasonCode:reason}));process.exitCode=1;
});

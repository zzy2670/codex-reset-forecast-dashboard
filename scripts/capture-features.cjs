'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron,chromium}=require('playwright-core');
const {makeDemo,demoNow}=require('./demo-state.cjs');
const root=path.resolve(__dirname,'..');
const {artworkCopy}=require('./artwork-copy.cjs');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function main(language){
 const out=path.join(root,'docs/assets',language==='zh-CN'?'zh-CN':'');
 fs.mkdirSync(out,{recursive:true});
 const packaged=process.argv[2];
 const app=await _electron.launch({executablePath:packaged||require('electron'),args:[...(packaged?[]:[root]),'--verification-test',`--verification-profile=public-art-${Date.now()}`],cwd:root});
 let browser;const geometry=[];
 try{
  browser=await chromium.launch({headless:true,...(process.env.PUBLIC_ART_BROWSER?{executablePath:process.env.PUBLIC_ART_BROWSER}:{channel:'chrome'})});
  const page=await app.firstWindow();await page.waitForFunction(()=>typeof render==='function'&&!!window.dashboard);
  assert.ok(await app.evaluate(({app})=>app.getPath('userData').includes('CodexResetDashboard-verification')));
  const requests=[];page.on('request',r=>{if(/^https?:/i.test(r.url()))requests.push(r.url());});
  await page.evaluate(n=>{const D=Date;window.Date=class extends D{constructor(...a){super(...(a.length?a:[n]));}static now(){return n}}},demoNow);
  await page.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
  async function viewport(width,height=1200){const b=await app.evaluate(({BrowserWindow},b)=>{const w=BrowserWindow.getAllWindows()[0];w.setContentSize(b.width,b.height);return w.getContentBounds()},{width,height});await page.waitForFunction(b=>Math.abs(innerWidth-b.width)<=1&&Math.abs(innerHeight-b.height)<=1,b);}
  async function demo(options={}){const d=makeDemo(demoNow,{...options,language});d.settings.bodyFontSize=14;Object.assign(d.quotaDisplay,{source:'local-codex',state:'ok',bucketId:'codex',key:'secondary'});d.localReset={kind:'quota-reset',bucketId:'codex',windowKey:'secondary',resetsAt:d.quotaDisplay.resetsAt,observedAt:d.consensus.at};await page.evaluate(d=>{document.querySelectorAll('dialog[open]').forEach(e=>e.close());detailsExpanded=false;render(d);scrollTo(0,0)},d);await page.waitForTimeout(80);}
  // Measure annotations after the viewport and crop have reached their final layout.
  // Draw in the image composition, so dialog positioning cannot offset the marks.
  async function capture(selector,pad=18,marks=[]){
   const target=page.locator(selector).first();let b=await target.boundingBox();assert.ok(b?.width&&b.height,selector);
   const v=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
   if(b.y+b.height+pad>v.height)await viewport(v.width,Math.ceil(b.y+b.height+pad+40));
   await page.waitForTimeout(100);b=await target.boundingBox();const view=await page.evaluate(()=>({width:innerWidth,height:innerHeight}));
   const x=Math.max(0,Math.floor(b.x-pad)),y=Math.max(0,Math.floor(b.y-pad));
   const clip={x,y,width:Math.min(Math.ceil(b.x+b.width+pad)-x,view.width-x),height:Math.min(Math.ceil(b.y+b.height+pad)-y,view.height-y)};
   const rects=[];
   for(const m of marks){const boxes=await page.locator(m.selector).evaluateAll(nodes=>nodes.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,text:e.textContent.trim().slice(0,180)}}));assert.ok(boxes.length,m.selector);
    const left=Math.min(...boxes.map(b=>b.x)),top=Math.min(...boxes.map(b=>b.y)),right=Math.max(...boxes.map(b=>b.x+b.width)),bottom=Math.max(...boxes.map(b=>b.y+b.height));
    const rect={...m,x:left-x,y:top-y,width:right-left,height:bottom-top,text:boxes.map(b=>b.text).join(' / ')};
    assert.ok(rect.width>0&&rect.height>0&&rect.x>=0&&rect.y>=0&&rect.x+rect.width<=clip.width&&rect.y+rect.height<=clip.height,`Annotation outside capture: ${m.selector} ${JSON.stringify({rect,clip})}`);rects.push(rect);
   }
   const png=await app.evaluate(async({BrowserWindow},clip)=>{const w=BrowserWindow.getAllWindows()[0];await w.webContents.capturePage(clip,{stayHidden:false,stayAwake:true});await new Promise(r=>setTimeout(r,120));return(await w.webContents.capturePage(clip,{stayHidden:false,stayAwake:true})).toPNG().toString('base64')},clip);
   return{src:`data:image/png;base64,${png}`,width:clip.width,height:clip.height,marks:rects};
  }
  function annotations(image){return image.marks.map(m=>{
   const p=m.pad??5,left=m.x-p,top=m.y-p,width=m.width+2*p,height=m.height+2*p;
   if(m.pointer){const targetX=m.x+m.width/2,targetY=m.y+m.height/2,labelX=Math.max(25,targetX-55),labelY=Math.max(22,m.y-36);return `<svg class="pointer" viewBox="0 0 ${image.width} ${image.height}"><path d="M${labelX} ${labelY} L${targetX} ${targetY}"/><circle cx="${targetX}" cy="${targetY}" r="4"/><circle class="badge" cx="${labelX}" cy="${labelY}" r="14"/><text x="${labelX}" y="${labelY+5}">${m.number}</text></svg>`;}
   return `<div class="mark" style="left:${left/image.width*100}%;top:${top/image.height*100}%;width:${width/image.width*100}%;height:${height/image.height*100}%"><span>${m.number}</span></div>`;
  }).join('')}
  async function artwork(file,{title='',panels,notes=[],columns=1,plain=false}){
   title=artworkCopy(title,language);
   panels=panels.map(p=>({...p,label:artworkCopy(p.label,language)}));
   notes=notes.map(n=>({...n,title:artworkCopy(n.title,language),text:artworkCopy(n.text,language)}));
   const shots=panels.map(p=>`<section class="shot"${p.span?` style="grid-column:span ${p.span}"`:''}>${p.label?`<div class="shot-label">${escape(p.label)}</div>`:''}<div class="image"><img src="${p.image.src}">${annotations(p.image)}</div></section>`).join('');
   const html=`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:1600px;background:#101315;color:#eef1f4;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{padding:${plain?'14px':'36px'} 32px 28px}.heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:25px}h1{font-size:34px;font-weight:550;letter-spacing:-.7px;margin:0}.demo{font-size:10px;letter-spacing:1px;color:#aab4bc;border:1px solid #343b41;padding:6px 9px;border-radius:12px}.shots{display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:22px;align-items:start}.shot{border:1px solid #343b41;border-radius:15px;overflow:hidden;background:#15191c}.shot-label{font-size:14px;padding:12px 18px;border-bottom:1px solid #343b41;color:#b9c3ca}.image{position:relative;line-height:0}.image img{display:block;width:100%;height:auto}.mark{position:absolute;border:2px solid #8ce2cd;border-radius:7px}.mark span{position:absolute;top:-13px;right:-12px;display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;color:#101b18;background:#8ce2cd;font-size:12px;font-weight:700;line-height:1}.pointer{position:absolute;inset:0;width:100%;height:100%;overflow:visible;fill:#8ce2cd;stroke:#8ce2cd;stroke-width:2}.pointer .badge{stroke:#101315;stroke-width:3}.pointer text{fill:#101b18;stroke:none;text-anchor:middle;font-size:15px;font-weight:700}.notes{display:grid;grid-template-columns:repeat(${Math.min(3,notes.length)||1},minmax(0,1fr));gap:18px;margin-top:22px}.note{display:flex;gap:10px;font-size:14px;line-height:1.6;color:#b4c0c7}.note b{flex-shrink:0;display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:#8ce2cd;color:#101b18;font-size:12px;margin-top:2px}.note strong{color:#eef1f4;font-weight:550}.note p{margin:3px 0 0}</style></head><body><div class="heading">${title?`<h1>${escape(title)}</h1>`:'<span></span>'}<span class="demo">${language==='zh-CN'?'演示数据':'Demo data'}</span></div><div class="shots">${shots}</div>${notes.length?`<div class="notes">${notes.map(n=>`<div class="note"><b>${n.number}</b><div><strong>${escape(n.title)}</strong><p>${escape(n.text)}</p></div></div>`).join('')}</div>`:''}</body></html>`;
   const composition=await browser.newPage({viewport:{width:1600,height:1}});await composition.route(/^https?:\/\//,r=>r.abort());await composition.setContent(html);await composition.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
   const finalMarks=await composition.locator('.mark').evaluateAll(nodes=>nodes.map(e=>{const b=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return{x:b.x-p.x,y:b.y-p.y,width:b.width,height:b.height,parentWidth:p.width,parentHeight:p.height}}));
   await composition.screenshot({path:path.join(out,file),fullPage:true,animations:'disabled'});geometry.push({file,panels:panels.map(p=>({label:p.label,width:p.image.width,height:p.image.height,marks:p.image.marks})),finalMarks});await composition.close();
  }
  const mark=(selector,number,extra={})=>({selector,number,...extra});
  await viewport(1500);await demo({alert:true,range:true});
  await artwork('feature-overview.png',{plain:true,panels:[{image:await capture('body',0)}]});
  await viewport(1500);await demo();
  const normal=await capture('.quota-panel',18,[mark('.quota-top',1)]);
  await demo({alert:true});
  const accelerated=await capture('.quota-panel',18,[mark('#forecast-warning',2)]);
  await artwork('feature-modes.png',{title:'Routine mode / Accelerated mode',columns:2,panels:[{label:'Routine mode',image:normal},{label:'Accelerated mode',image:accelerated}],notes:[{number:1,title:'Remaining quota',text:'Your remaining quota and plan.'},{number:2,title:'Reset countdown',text:'A timed automatic reset for your plan switches the dashboard to coral orange.'}]});
  await viewport(1500);await demo();
  await artwork('feature-pace.png',{title:'Quota usage',panels:[{image:await capture('.quota-panel',18,[mark('.quota-bars',1),mark('[data-bar="actual"] .bar-drag-handle',2,{pad:3}),mark('#hypothetical-settings',3,{pad:3})])}],notes:[{number:1,title:'Usage bars',text:'Actual usage, an assumed X-day cycle, a calendar target and even usage across your personal cycle.'},{number:2,title:'Bar order',text:'Drag this handle to move a bar.'},{number:3,title:'Reset interval',text:'Click to change X. The default is 3 days.'}]});
  await viewport(1300);await demo({alert:true});
  const single=await capture('.quota-panel',18,[mark('.forecast-line',1,{pointer:true})]);
  await demo({alert:true,range:true});
  const range=await capture('.quota-panel',18,[mark('.forecast-band',2,{pointer:true})]);
  await artwork('feature-forecast.png',{title:'The red reset pacing line',columns:2,panels:[{label:'One reset time',image:single},{label:'A range of reset times',image:range}],notes:[{number:1,title:'One time, one line',text:'The line advances with time and reaches 100% at the announced reset.'},{number:2,title:'Different times',text:'Two lines bound the red band. The earlier reset is the faster right-hand line.'}]});
  await viewport(1500);await demo({alert:true});
  await page.evaluate(()=>{detailsExpanded=true;document.querySelectorAll('.source-more').forEach(e=>e.open=true)});
  await artwork('feature-sources.png',{title:'Reset sources',panels:[{image:await capture('.forecasts-section',20,[mark('[data-source="codex"] .forecast-value',1),mark('[data-source="codex"] .source-more',2),mark('[data-source="next"] .source-more>p:last-of-type',3),mark('[data-source="tibo"] .source-more>p:last-of-type',3)])}],notes:[{number:1,title:'Next reset',text:'Each site’s announced time appears at the top of its card.'},{number:2,title:'Announcement details',text:'Expand the source text, publication time and original link.'},{number:3,title:'Shared feed',text:'NextReset and TIBO use the same upstream feed.'}]});
  await demo();await page.evaluate(()=>document.querySelector('.history-row .history-proof').open=true);
  const latest=await capture('.reset-panel',18,[mark('#last-reset-value',1)]);
  const history=await capture('.history-section',20,[mark('.history-row:first-child .history-proof',2)]);
  const calendar=await capture('.calendar-section',20,[mark('.calendar-layout',3)]);
  await artwork('feature-history.png',{title:'Reset history',columns:2,panels:[{label:'Latest reset',image:latest},{label:'Expanded history record',image:history},{label:'Reset calendar',image:calendar,span:2}],notes:[{number:1,title:'Reset time',text:'The latest cross-checked reset and time elapsed since it.'},{number:2,title:'Source timestamps',text:'Compare each site’s recorded time and open its original post.'},{number:3,title:'Reset calendar',text:'View resets by month, then choose a future date and hour for the calendar pacing bar.'}]});
  await viewport(1500,1800);await demo();await page.evaluate(()=>{openSettings();const d=document.querySelector('#settings-dialog');d.style.maxHeight='none';d.style.height='auto';d.style.width='700px';d.style.position='absolute';d.style.top='36px';d.style.bottom='auto';d.style.marginTop='0'});
  await artwork('feature-settings.png',{title:'Dashboard settings',panels:[{image:await capture('#settings-dialog',25,[mark('#setting-language',1),mark('label:has(#setting-tray),label:has(#setting-autostart)',2),mark('label:has(#setting-body-font)',3),mark('label:has(#setting-notify)',4)])}],notes:[{number:1,title:'Language',text:'English or Chinese.'},{number:2,title:'Tray and startup',text:'Keep monitoring after closing the window; start with Windows.'},{number:3,title:'Text size',text:'Body text and smaller labels resize together.'},{number:4,title:'Notifications',text:'Timed automatic-reset alerts stay until acknowledged. Similar times are grouped.'}]});
  const {notificationArtwork}=require('./notification-artwork.cjs');const note=await browser.newPage({viewport:{width:1600,height:980}});await note.setContent(notificationArtwork({language}));assert.equal(await note.evaluate(()=>document.documentElement.scrollHeight>980),false,'Notification artwork overflow');await note.screenshot({path:path.join(out,'feature-notifications.png')});await note.close();
  assert.equal(requests.length,0);assert.equal((await page.evaluate(()=>window.dashboard.get())).events.length,0);
  const files=fs.readdirSync(out).filter(f=>/^feature-.*\.png$/.test(f));assert.equal(files.length,8);
  fs.mkdirSync(path.join(root,'.verification'),{recursive:true});fs.writeFileSync(path.join(root,`.verification/capture-geometry-${language}.json`),JSON.stringify(geometry,null,2));
  console.log(JSON.stringify({ok:true,language,files,networkRequests:requests.length,events:0}));
 }finally{if(browser)await browser.close();await app.close()}
}
(async()=>{await main('en');await main('zh-CN');})().catch(e=>{console.error(e.stack);process.exitCode=1});

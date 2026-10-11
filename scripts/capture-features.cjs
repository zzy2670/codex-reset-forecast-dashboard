'use strict';

// Public marketing artwork: real UI, isolated verification profile, synthetic data.
// No network request, OS input, notification or normal user profile is used.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { _electron, chromium } = require('playwright-core');
const { makeDemo, demoNow } = require('./demo-state.cjs');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs', 'assets');
const escape = text => String(text).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function main() {
  fs.mkdirSync(out, { recursive:true });
  const packaged = process.argv[2];
  const app = await _electron.launch({
    executablePath: packaged || require('electron'),
    args: [...(packaged ? [] : [root]), '--verification-test', `--verification-profile=public-art-${Date.now()}`],
    cwd: root
  });
  let artworkBrowser;
  try {
    // Fresh headless browser for image layout only; never attach to a user's browser.
    if(fs.existsSync(chromium.executablePath())) artworkBrowser=await chromium.launch({headless:true});
    else if(process.env.PUBLIC_ART_BROWSER) artworkBrowser=await chromium.launch({headless:true,executablePath:process.env.PUBLIC_ART_BROWSER});
    else {
      try {artworkBrowser=await chromium.launch({headless:true,channel:'chrome'});}
      catch {artworkBrowser=await chromium.launch({headless:true,channel:'msedge'});}
    }
    const page = await app.firstWindow();
    await page.waitForFunction(() => typeof render === 'function' && !!window.dashboard);
    // Fail closed if the isolation contract is missing from a changed launcher.
    const isolated = await app.evaluate(({ app }) => app.getPath('userData').includes('CodexResetDashboard-verification'));
    assert.equal(isolated, true, 'Marketing capture must use an isolated verification profile.');
    const externalRequests = [];
    page.on('request', request => { if (/^https?:/i.test(request.url())) externalRequests.push(request.url()); });
    const now = typeof demoNow === 'number' ? demoNow : Date.parse(demoNow);
    assert.ok(Number.isFinite(now), 'demoNow must be a fixed valid timestamp.');
    await page.evaluate(n => {
      const ActualDate = Date;
      window.Date = class extends ActualDate {
        constructor(...args) { super(...(args.length ? args : [n])); }
        static now() { return n; }
      };
    }, now);
    async function viewport(width,height=1120) {
      const content=await app.evaluate(({BrowserWindow},{width,height}) => {
        const win=BrowserWindow.getAllWindows()[0];win.setContentSize(width,height);
        return win.getContentBounds();
      },{width,height});
      await page.waitForFunction(bounds => Math.abs(innerWidth-bounds.width)<=1&&Math.abs(innerHeight-bounds.height)<=1,content);
    }
    await viewport(1600);
    // Turn off animations only in this isolated renderer; screenshots stay sharp.
    await page.addStyleTag({ content: `
      *,*::before,*::after{animation:none!important;transition:none!important}
      body{padding-bottom:80px!important}
      .public-art-mark{position:absolute;pointer-events:none;z-index:9999;border:2px solid var(--mark-color);border-radius:10px;box-shadow:0 0 0 4px color-mix(in srgb,var(--mark-color) 8%,transparent)}
      .public-art-number{position:absolute;left:var(--number-left,8px);top:var(--number-top,-13px);width:26px;height:26px;border-radius:50%;display:grid;place-items:center;color:#101313;background:var(--mark-color);font:700 13px system-ui;box-shadow:0 2px 10px #0007}
    ` });

    async function demo(options = {}) {
      const data = makeDemo(now, options);
      data.settings = {...data.settings, language:'en', theme:'dark', bodyFontSize:14};
      await page.evaluate(state => {
        for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
        document.querySelectorAll('.public-art-mark').forEach(e => e.remove());
        render(state);
        scrollTo(0, 0);
      }, data);
      await page.waitForTimeout(90);
      return data;
    }

    async function mark(selector, number, { color='#7de1bf', padding=6, badge='left' } = {}) {
      const count = await page.locator(selector).count();
      assert.ok(count, `Missing UI feature target: ${selector}`);
      await page.evaluate(({selector, number, color, padding, badge}) => {
        for (const target of document.querySelectorAll(selector)) {
          const b = target.getBoundingClientRect();
          if (!b.width || !b.height) continue;
          const box = document.createElement('div');
          box.className = 'public-art-mark';
          box.style.cssText = `left:${b.x+scrollX-padding}px;top:${b.y+scrollY-padding}px;width:${b.width+2*padding}px;height:${b.height+2*padding}px;--mark-color:${color}`;
          const dialog=target.closest('dialog[open]');
          if(dialog){box.style.position='fixed';box.style.left=`${b.x-padding}px`;box.style.top=`${b.y-padding}px`;}
          if (number !== null) {
            const label = document.createElement('span');
            label.className='public-art-number'; label.textContent=String(number);
            if (badge==='right') label.style.setProperty('--number-left', `${b.width-16}px`);
            box.appendChild(label);
          }
          (dialog || document.body).appendChild(box);
        }
      }, { selector, number, color, padding, badge });
    }

    async function crop(selector, pad=20) {
      const target=page.locator(selector).first();
      const original=await target.boundingBox();
      const view=await page.evaluate(() => ({width:innerWidth,height:innerHeight}));
      // Enlarge the hidden client area instead of scrolling a non-visible window.
      // This avoids stale compositor frames and keeps all crop coordinates stable.
      if(original?.y+original?.height+pad>view.height) await viewport(view.width,Math.ceil(original.y+original.height+pad+100));
      const box = await target.boundingBox();
      assert.ok(box && box.width && box.height, `Capture target is hidden: ${selector}`);
      const x=Math.max(0,box.x-pad), y=Math.max(0,box.y-pad);
      const dimensions=await page.evaluate(() => ({width:innerWidth,height:innerHeight}));
      const clip={x:Math.round(x),y:Math.round(y),width:Math.floor(Math.min(box.width+2*pad,dimensions.width-x)),height:Math.floor(Math.min(box.height+2*pad,dimensions.height-y))};
      await page.waitForTimeout(150);
      const png=await app.evaluate(async({BrowserWindow},clip)=>{
        const win=BrowserWindow.getAllWindows()[0];
        // capturePage increments a renderer capture count. It never shows or focuses
        // the native window, but allows a fresh hidden renderer frame to be painted.
        await win.webContents.capturePage(clip,{stayHidden:false,stayAwake:true});
        await new Promise(resolve=>setTimeout(resolve,100));
        const image=await win.webContents.capturePage(clip,{stayHidden:false,stayAwake:true});
        return image.toPNG().toString('base64');
      },clip);
      const buffer=Buffer.from(png,'base64');
      return {src:`data:image/png;base64,${buffer.toString('base64')}`,width:box.width+2*pad,height:box.height+2*pad};
    }

    async function artwork(file, {eyebrow, title, description, panels, notes, columns=1, accent='#7de1bf'}) {
      const items=panels.map(p=>`<section class="shot"><div class="shot-label">${escape(p.label)}</div><img src="${p.image.src}"${p.maxWidth?` style="max-width:${p.maxWidth}px;margin:0 auto"`:''} alt="${escape(p.label)}"></section>`).join('');
      const html=`<!doctype html><html><head><meta charset="utf-8"><style>
        *{box-sizing:border-box}html,body{margin:0;width:1440px;background:#0e1112;color:#eff5f2;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}body{padding:52px 54px 36px;background:radial-gradient(ellipse at 85% 0,${accent}12,transparent 58%),#0e1112}
        .meta{display:flex;align-items:center;justify-content:space-between;margin-bottom:19px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${accent};font-weight:650}.demo{font-size:10px;letter-spacing:1.3px;color:#9dada6;padding:7px 10px;border:1px solid #2b3730;border-radius:20px}
        h1{font-size:41px;letter-spacing:-1.5px;font-weight:550;line-height:1.16;margin:0 0 14px}.description{font-size:17px;line-height:1.65;max-width:1040px;color:#a7b9b0;margin:0 0 32px}.shots{display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));gap:22px;align-items:start}.shot{margin:0;border:1px solid #29352f;overflow:hidden;border-radius:17px;background:#131919;box-shadow:0 12px 40px #0003}.shot-label{padding:14px 19px;color:#cbd9d1;font-size:12px;font-weight:600;letter-spacing:.7px;border-bottom:1px solid #29352f}.shot img{display:block;width:100%;height:auto}.notes{display:flex;gap:28px;flex-wrap:wrap;padding-top:24px}.note{display:flex;align-items:flex-start;gap:10px;flex:1;min-width:250px;color:#9fb2a7;font-size:13px;line-height:1.65}.note b{display:grid;place-items:center;flex-shrink:0;width:23px;height:23px;border-radius:50%;color:#10221a;background:${accent};font-size:12px;font-weight:700;margin-top:1px}.note strong{color:#e3eee7;font-weight:550}.footer{margin-top:28px;padding-top:20px;border-top:1px solid #27332c;display:flex;justify-content:space-between;color:#637c6e;font-size:11px;letter-spacing:.6px}
      </style></head><body><div class="meta"><span>${escape(eyebrow)}</span><span class="demo">Synthetic demonstration · no personal data</span></div><h1>${escape(title)}</h1><p class="description">${escape(description)}</p><div class="shots">${items}</div><div class="notes">${notes.map(n=>`<div class="note"><b>${n.number}</b><div><strong>${escape(n.title)}</strong><br>${escape(n.text)}</div></div>`).join('')}</div><div class="footer"><span>CODEX RESET FORECAST DASHBOARD</span><span>Real application captures · Illustrative data</span></div></body></html>`;
      const composition=await artworkBrowser.newPage({viewport:{width:1440,height:600}});
      await composition.route(/^https?:\/\//,route=>route.abort());
      await composition.setContent(html,{waitUntil:'load'});
      await composition.evaluate(() => Promise.all([...document.images].map(i=>i.decode())));
      await composition.screenshot({path:path.join(out,file),fullPage:true,animations:'disabled'});
      await composition.close();
    }

    await viewport(1260);
    await demo();
    await mark('.quota-bars',1,{padding:7});
    const normal=await crop('.quota-panel',12);
    await demo({alert:true});
    assert.equal(await page.locator('body.reset-alert').count(),1,'Accelerated demonstration needs a valid timed forecast.');
    await mark('#forecast-warning',2,{color:'#ffc18a',padding:6});
    const alert=await crop('.quota-panel',12);
    await artwork('feature-modes.png',{
      eyebrow:'01 / Two visual modes',title:'A calm rhythm. A clear signal to accelerate.',
      description:'Stay in the dark green overview for routine monitoring. A valid, timed reset announcement turns the dashboard amber and adds a target pace.',
      columns:2,panels:[{label:'ROUTINE MONITORING',image:normal},{label:'ANNOUNCEMENT / ACCELERATED MODE',image:alert}],
      notes:[{number:1,title:'Routine mode',text:'Compare actual consumption with personal-cycle and custom-cycle pacing.'},{number:2,title:'Timed forecast detected',text:'Amber styling and a deadline reminder make the change immediately visible. A forecast is not completion.'}]
    });

    await viewport(1600);
    await demo();
    await mark('.quota-bars',1,{padding:8,badge:'right'});
    await mark('[data-bar="actual"] .bar-drag-handle',2,{padding:3,badge:'right'});
    await mark('#hypothetical-settings',3,{padding:4,badge:'right'});
    await artwork('feature-pace.png',{
      eyebrow:'02 / Quota consumption pacing',title:'Three rhythms. One clear comparison.',
      description:'Actual usage, an adjustable reset-cycle assumption, and a steady personal-cycle pace share the same scale. Reorder the rows to suit the way you think.',
      panels:[{label:'LOCAL QUOTA + THREE COMPARABLE PACE TRACKS',image:await crop('.quota-panel',12)}],
      notes:[{number:1,title:'Consumption pacing tracks',text:'Read actual, custom-cycle and steady-cycle percentages side by side.'},{number:2,title:'Drag to reorder',text:'Use a handle to arrange the tracks. Your preferred order is saved locally.'},{number:3,title:'Your own cycle assumption',text:'Set X days; the default is three. It remains an assumption, not a forecast.'}]
    });

    await viewport(1260);
    await demo({alert:true});
    await mark('.forecast-line',1,{color:'#ff7c81',padding:9});
    const single=await crop('.quota-panel',12);
    await demo({alert:true,range:true});
    assert.equal(await page.locator('.forecast-line').count(),2,'Range capture must contain two target lines.');
    await mark('.forecast-band',2,{color:'#ff7c81',padding:9});
    const range=await crop('.quota-panel',12);
    await artwork('feature-forecast.png',{
      eyebrow:'03 / The red target pace',title:'A moving target line. A visible deadline range.',
      description:'The red line advances with time and reaches 100% at the announced deadline. Different future times form two pace boundaries with a luminous red band.',
      columns:2,accent:'#ff9c79',panels:[{label:'ONE ANNOUNCED DEADLINE',image:single},{label:'MULTIPLE FUTURE TIMES',image:range}],
      notes:[{number:1,title:'One shared target line',text:'Matching announcements collapse into one line across all consumption tracks.'},{number:2,title:'Slow and fast pace boundaries',text:'Different deadlines show a target range. Expired times leave the next-forecast display automatically.'}]
    });

    await viewport(1600);
    await demo({alert:true});
    await page.evaluate(() => {detailsExpanded=true;document.querySelectorAll('.source-more').forEach(e=>e.open=true);});
    await mark('#sources-grid',1,{padding:8});
    await mark('[data-source="next"] .source-title,[data-source="tibo"] .source-title',2,{padding:4,badge:'right'});
    await artwork('feature-sources.png',{
      eyebrow:'04 / Multi-source monitoring',title:'Five sources. Evidence you can inspect.',
      description:'Compare the next estimate, the underlying announcement and collection timestamps. Shared upstream feeds are identified so repeated records cannot masquerade as independent confirmation.',
      panels:[{label:'FIVE SOURCE CARDS / EXPANDED EVIDENCE',image:await crop('.forecasts-section',24)}],
      notes:[{number:1,title:'Public evidence in one row',text:'Each source keeps its forecast, original announcement, freshness and supporting explanation.'},{number:2,title:'Shared upstream identified',text:'NextReset and TIBO share an upstream collection chain; they are not counted as two independent checks.'}]
    });

    await demo();
    await page.evaluate(() => {const evidence=document.querySelector('.history-row .history-proof');if(evidence)evidence.open=true;});
    await mark('#consensus-status',1,{padding:4,badge:'right'});
    await mark('#source-proof',2,{padding:6});
    const confirmed=await crop('.reset-panel',12);
    await mark('.history-row:first-child .history-evidence',3,{padding:5,badge:'right'});
    if(await page.locator('.history-row:first-child .history-proof').count())await mark('.history-row:first-child .history-proof',4,{padding:5,badge:'right'});
    await artwork('feature-history.png',{
      eyebrow:'05 / Reset history and source comparison',title:'Trace the record. Check the collection chains.',
      description:'The latest calibrated reset and a newest-first history retain source evidence. Public completion announcements stay distinct from personal quota resets.',
      panels:[{label:'LATEST CROSS-CHECKED PUBLIC RECORD',image:confirmed,maxWidth:950},{label:'HISTORY / SOURCE-CHAIN COUNTS',image:await crop('.history-section',24)}],
      notes:[{number:1,title:'Calibrated status',text:'Agreement across independent collection chains is shown explicitly.'},{number:2,title:'Source proof',text:'Open the source records and original public announcement.'},{number:3,title:'History with provenance',text:'Review completion times, reset type, contributing sites and independent-chain counts.'},{number:4,title:'Compare source records',text:'Expand a record to inspect the time and collection chain reported by each contributing site.'}]
    });

    await demo();
    await page.evaluate(() => openSettings());
    await page.evaluate(() => {
      const dialog=document.getElementById('settings-dialog');
      dialog.style.maxHeight='none';dialog.style.height='auto';dialog.style.width='650px';
      dialog.style.position='absolute';dialog.style.top='42px';dialog.style.bottom='auto';dialog.style.marginTop='0';
    });
    const languageTarget=(await page.locator('#setting-language').count())?'#setting-language':'.settings-dialog .settings-section:first-of-type';
    await mark(languageTarget,1,{padding:4,badge:'right'});
    await mark('label:has(#setting-tray),label:has(#setting-autostart)',2,{padding:3,badge:'right'});
    await mark('label:has(#setting-body-font)',3,{padding:5,badge:'right'});
    const settings=await crop('#settings-dialog',26);
    await artwork('feature-settings.png',{
      eyebrow:'06 / Bilingual and local-first',title:'Make it yours. Keep personal data local.',
      description:'Switch the application between English and Chinese. Fine-tune text size and cycle assumptions, then let the tray keep monitoring after you close the window.',
      panels:[{label:'LANGUAGE, BACKGROUND MONITORING AND READING COMFORT',image:settings,maxWidth:790}],
      notes:[{number:1,title:'English + Chinese',text:'Application controls support both languages; the website offers additional translations.'},{number:2,title:'Quiet background operation',text:'Choose tray monitoring and start at sign-in. Enable persistent alerts for meaningful, timed reset notices.'},{number:3,title:'Comfortable reading',text:'Body text and smaller labels scale together while the large figures keep their visual hierarchy.'}]
    });
    assert.equal(externalRequests.length,0,'Public feature captures must not access the network.');
    const persisted=await page.evaluate(() => window.dashboard.get());
    assert.equal((persisted.events||[]).length,0,'Synthetic render states must not create real events.');
    const files=fs.readdirSync(out).filter(f=>/^feature-.*\.png$/.test(f));
    assert.equal(files.length,6);
    console.log(JSON.stringify({ok:true,files,synthetic:true,networkRequests:externalRequests.length},null,2));
  } finally { if(artworkBrowser)await artworkBrowser.close();await app.close(); }
}

main().catch(error => {console.error(error.stack);process.exitCode=1;});

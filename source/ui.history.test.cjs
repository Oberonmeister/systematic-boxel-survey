/* Isolated browser regression: no real network, game input or clipboard writes. */
const assert=require('node:assert/strict'),path=require('node:path'),C=require('./model.js'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});try{
 const s=C.newSurvey({source:{type:'single'},...C.deriveAnchors(['Pyurks OE-E d13-0'],'d'),selected:0,levels:['d'],extraParents:[]},'2026-10-11T10:00:00Z');C.setBound(s,0,5);s.policy.providers=[];
 const workspace={schema:1,surveys:[s],activeId:s.id,options:{autoCopy:true,overlay:true},ui:{step:3},journalCursors:{'Journal.2.log':0}};
 const page=await browser.newPage({viewport:{width:1280,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(workspace=>{
  const common={StarSystem:'Pyurks OE-E d13-0',timestamp:'2025-01-01T00:00:00Z'};
  window.__history={'Journal.1.log':[{...common,event:'Location'},{...common,event:'Scan',BodyID:0,BodyName:common.StarSystem,StarType:'G'},{...common,event:'FSSAllBodiesFound',Count:1},{event:'Location',StarSystem:'Pyurks OE-E d13-1',timestamp:common.timestamp}], 'Journal.2.log':[{event:'Location',StarSystem:'Pyurks OE-E d13-2',timestamp:'2026-10-12T10:00:00Z'},{event:'FSSDiscoveryScan',SystemName:'Pyurks OE-E d13-2',BodyCount:4,timestamp:'2026-10-12T10:00:01Z'}]};
  window.__store={'survey.manifest':{schema:1,chunks:1,encoding:'json',revision:0},'survey.chunk.0':JSON.stringify(workspace),'survey.clipboardHelper':{format:'survey-clipboard-helper',transport:'jacob-store-v1',token:'a'.repeat(64)}};
  window.__reads=[];window.__copies=[];window.__subs=[];window.__copyFail=false;window.__scene=null;
  // No browser activation exists for live journal events. The host helper still works.
  document.execCommand=()=>{throw Error('Browser copy must not be used');};
  window.fetch=async()=>{throw Error('Direct connections are blocked by the real JACoB tab CSP');};
  window.Elite={store:{get:async(k,f)=>__store[k]??f,batch:async ops=>{for(const o of ops){o.op==='set'?__store[o.key]=o.value:delete __store[o.key];if(o.key==='survey.clipboardRequest'&&o.value.action==='clipboard'&&!__copyFail)__copies.push({body:o.value});}}},net:{fetchQueued:async()=>{throw Error('No catalogue calls expected');}},data:{get:async name=>name==='SurveyClipboardStatus.json'?{found:true,data:{requestId:__store['survey.clipboardRequest']?.id,ok:!__copyFail,error:__copyFail?'Windows clipboard is busy; retry copying.':undefined}}:{found:false},subscribe:()=>()=>{}},journal:{files:async()=>({files:Object.keys(__history).map(file=>({file}))}),read:async({file,offset})=>{__reads.push([file,offset]);return{events:__history[file].slice(offset),info:{truncated:false}};},subscribe:(name,fn)=>__subs.push(fn)},overlay:{info:async()=>({width:2560,hudVersion:2}),clear:async()=>{},set:async scene=>{__scene=scene;}}};
 },workspace);
 await page.goto('file:///'+path.resolve(__dirname,'..','Systematic-Boxel-Survey.html').replaceAll('\\','/'));
 await page.waitForFunction(()=>window.SurveyUI&&!SurveyUI.getBusy());
 let state=await page.evaluate(()=>SurveyUI.getState());assert.equal(state.surveys[0].historyVersion,2);assert.equal(state.surveys[0].boxes[0].cursor,1);assert.deepEqual(await page.evaluate(()=>__reads.map(r=>r[0])),['Journal.1.log','Journal.2.log']);
 assert.match(await page.locator('.sequenceRows').innerText(),/Previously visited/);assert.equal(await page.locator('[data-action="confirmFullScan"]').isEnabled(),true);
 await page.getByText('Clipboard helper connection',{exact:true}).click();await page.getByLabel('Clipboard helper connection details').fill(JSON.stringify({format:'survey-clipboard-helper',transport:'jacob-store-v1',token:'a'.repeat(64)}));await page.getByRole('button',{name:'Connect clipboard helper',exact:true}).click();await page.getByText('Clipboard helper connected. Automatic copying now works while Elite has focus.',{exact:true}).waitFor();await page.waitForFunction(()=>!SurveyUI.getBusy());
 await page.locator('[data-action="confirmFullScan"]').click();await page.getByText('Full scan including belts confirmed for Pyurks OE-E d13-2',{exact:true}).waitFor();
 state=await page.evaluate(()=>SurveyUI.getState());assert.equal(C.localStatus(C.recordAt(state.surveys[0],0,2)).manual,true);assert.equal(C.localStatus(C.recordAt(state.surveys[0],0,1)).manual,false);
 await page.locator('[data-action="undoFullScan"]').click();assert.equal(await page.evaluate(()=>SurveyCore.localStatus(SurveyCore.recordAt(SurveyUI.getState().surveys[0],0,2)).complete),false);
 await page.locator('#ignoreVisited').check();await page.waitForFunction(()=>!SurveyUI.getBusy()&&SurveyUI.getState().surveys[0].boxes[0].cursor===3);
 assert.match(await page.locator('.sequenceRows').innerText(),/Ignored by policy/);
 await page.evaluate(()=>__subs.forEach(cb=>cb({event:'FSDJump',StarSystem:'Pyurks OE-E d13-3',timestamp:'2026-10-12T11:00:00Z'})));
 await page.waitForFunction(()=>!SurveyUI.getBusy()&&__copies.at(-1)?.body.text==='Pyurks OE-E d13-4');assert.match(await page.locator('#clipboardStatus').innerText(),/Copied: Pyurks OE-E d13-4/);
 const scene=await page.evaluate(()=>__scene);assert.equal(scene.items[0].x,.5);assert.equal(scene.items[0].align,'center');assert.equal(scene.items.length,1);assert.equal(scene.items[0].color,'#65FF9A');assert.equal(scene.items[0].outlineWidth,1.5);assert.equal(scene.items[0].fontWeight,600);assert.equal(scene.opacity,1);
 await page.evaluate(()=>{__copyFail=true;});await page.locator('[data-action="next"]').click();await page.waitForFunction(()=>!SurveyUI.getBusy());assert.match(await page.locator('#clipboardStatus').innerText(),/Copy failed/);
 await page.locator('[data-action="save"]').click();const stored=await page.evaluate(()=>structuredClone(__store));await page.addInitScript(store=>{window.__store=store;},stored);await page.reload();await page.waitForFunction(()=>window.SurveyUI&&!SurveyUI.getBusy());
 assert.deepEqual(await page.evaluate(()=>__reads),[['Journal.2.log',2]]);assert.equal(await page.evaluate(()=>SurveyUI.getState().surveys[0].policy.ignoreVisited),true);
 assert.deepEqual(errors,[]);console.log('PASS: automatic history backfill/checkpoints, personal states, honked full-scan confirmation/undo for current system, ignore-visited advancement, helper copies after journal arrival without activation, visible copy failures, centered overlay, reload persistence.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

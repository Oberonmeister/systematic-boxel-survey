/* Isolated browser: mock catalogues, helper and journals; no game input. */
const assert=require('node:assert/strict'),path=require('node:path'),C=require('./model.js'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});try{
 const s=C.newSurvey({source:{type:'single'},...C.deriveAnchors(['Pyurks OE-E d13-0'],'d'),selected:0,levels:['d','c'],extraParents:[]});C.setBound(s,0,1);C.setBound(s,2,0);s.excluded=[1];
 const workspace={schema:1,surveys:[s],activeId:s.id,options:{autoCopy:true,overlay:true},ui:{step:3}},page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(workspace=>{
  window.__store={'survey.manifest':{schema:1,chunks:1,encoding:'json',revision:0},'survey.chunk.0':JSON.stringify(workspace),'survey.clipboardHelper':{format:'survey-clipboard-helper',transport:'jacob-store-v1',token:'a'.repeat(64)}};
  window.__calls=[];window.__subs=[];window.__copies=[];window.__history=[];
  window.Elite={store:{get:async(k,f)=>__store[k]??f,batch:async ops=>{for(const o of ops){o.op==='set'?__store[o.key]=o.value:delete __store[o.key];if(o.key==='survey.clipboardRequest')__copies.push(o.value.text);}}},net:{fetchQueued:async(url,options)=>{__calls.push({url,options});return{status:200,json:url.includes('spansh')?{results:[]}:[]};}},data:{get:async name=>name==='SurveyClipboardStatus.json'?{found:true,data:{requestId:__store['survey.clipboardRequest']?.id,ok:true}}:{found:false},subscribe:()=>()=>{}},journal:{files:async()=>({files:[{file:'Journal.test.log'}]}),read:async({offset})=>({events:__history.slice(offset),info:{truncated:false}}),subscribe:(name,cb)=>__subs.push(cb)},overlay:{clear:async()=>{},set:async()=>{}}};
 },workspace);
 await page.goto('file:///'+path.resolve(__dirname,'..','Systematic-Boxel-Survey.html').replaceAll('\\','/'));await page.waitForFunction(()=>window.SurveyUI&&!SurveyUI.getBusy());
 assert.equal(await page.locator('#autoIterate').isChecked(),false);assert.equal(await page.locator('[data-action="checkBox"]').isEnabled(),true);
 await page.evaluate(()=>{__calls=[];});await page.locator('[data-action="checkBox"]').click();await page.waitForFunction(()=>!SurveyUI.getBusy());
 const calls=await page.evaluate(()=>__calls);assert.equal(calls.length,2);assert.equal(calls[1].options.body.size,12);assert.ok(calls[0].url.includes('systemName=Pyurks%20OE-E%20d13-'));assert.ok(await page.getByText('Not found in boxel search',{exact:true}).count());
 await page.locator('[data-provider="edsm"]').uncheck();await page.locator('[data-provider="spansh"]').uncheck();await page.locator('#autoIterate').check();
 await page.locator('[data-target="1"]').click();await page.waitForFunction(()=>!SurveyUI.getBusy());
 await page.evaluate(()=>{__history=[{event:'FSDJump',StarSystem:'Pyurks OE-E d13-1',timestamp:'2026-01-01T00:00:00Z'}];});await page.locator('[data-action="history"]').click();await page.waitForFunction(()=>!SurveyUI.getBusy());assert.equal(await page.evaluate(()=>SurveyUI.getState().surveys[0].activeBox),0,'history cannot iterate');
 await page.evaluate(()=>__subs.forEach(cb=>cb({event:'FSDJump',StarSystem:'Pyurks OE-E d13-1',timestamp:'2026-10-14T20:00:00Z'})));
 const nextName=C.systemName(C.boxAt(s,2),0);await page.waitForFunction(name=>!SurveyUI.getBusy()&&__copies.at(-1)===name,nextName);
 let state=await page.evaluate(()=>SurveyUI.getState());assert.equal(state.surveys[0].activeBox,2);assert.equal(state.surveys[0].boxes[0].records[1].journal.fss,false);
 await page.evaluate(()=>__subs.forEach(cb=>{cb({event:'Scan',StarSystem:'Pyurks OE-E d13-1',BodyID:0,BodyName:'Pyurks OE-E d13-1',StarType:'G'});cb({event:'FSSAllBodiesFound',SystemName:'Pyurks OE-E d13-1',Count:1});}));
 state=await page.evaluate(()=>SurveyUI.getState());assert.equal(C.localStatus(state.surveys[0].boxes[0].records[1]).complete,true);assert.equal(C.localStatus(state.surveys[0].boxes[2].records[0]).complete,false);
 await page.locator('[data-action="save"]').click();const stored=await page.evaluate(()=>structuredClone(__store));await page.addInitScript(store=>{window.__store=store;},stored);await page.reload();await page.waitForFunction(()=>window.SurveyUI&&!SurveyUI.getBusy());assert.equal(await page.locator('#autoIterate').isChecked(),true);
 await page.evaluate(name=>__subs.forEach(cb=>cb({event:'FSDJump',StarSystem:name,timestamp:'2026-10-14T20:01:00Z'})),nextName);await page.waitForFunction(()=>!SurveyUI.getBusy()&&SurveyUI.getState().surveys[0].activeBox===3);
 assert.equal(await page.locator('#autoIterate').isDisabled(),true);assert.equal(await page.locator('[data-action="checkBox"]').isDisabled(),true);
 const unboundedName=C.systemName(C.boxAt(s,3),0);await page.evaluate(name=>__subs.forEach(cb=>cb({event:'FSDJump',StarSystem:name,timestamp:'2026-10-14T20:02:00Z'})),unboundedName);await page.waitForFunction(()=>!SurveyUI.getBusy()&&SurveyUI.getState().surveys[0].boxes[3].cursor===1);assert.equal(await page.evaluate(()=>SurveyUI.getState().surveys[0].activeBox),3);
 assert.deepEqual(errors,[]);console.log('PASS: whole-boxel button uses bulk requests; opt-in bounded arrival iteration, excluded boxels, helper copying, late FSS attribution, history isolation, persistence and open-ended controls.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

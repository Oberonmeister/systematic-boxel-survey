/* Isolated browser: storage, routes and journals are fake; no game or real clipboard access. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});try{
 const page=await browser.newPage({viewport:{width:1420,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.__store={};window.__export=null;window.__route=[];window.__routeSub=null;
  window.Elite={store:{get:async(k,f)=>__store[k]??f,batch:async ops=>{for(const o of ops)o.op==='set'?__store[o.key]=o.value:delete __store[o.key];}},
   files:{json:(name,value)=>{window.__export=structuredClone(value);}},
   net:{fetchQueued:async()=>({status:200,json:[]})},
   data:{get:async()=>({found:!!__route.length,data:{Route:__route}}),subscribe:(name,cb)=>{__routeSub=cb;}},
   journal:{files:async()=>({files:[{file:'Journal.test.log'}]}),read:async()=>({events:[],info:{truncated:false}}),subscribe:()=>()=>{}},
   overlay:{clear:async()=>{},set:async()=>{}}};
 });
 const url='file:///'+path.resolve(__dirname,'..','Systematic-Boxel-Survey.html').replaceAll('\\','/');await page.goto(url);
 await page.waitForFunction(()=>window.SurveyUI);
 await page.getByLabel('System list / string',{exact:true}).check();
 await page.locator('#sourceText').fill('Pyurks OE-E d13-0\nPyurks LY-F d12-0\nPyurks OE-E d13-4');
 await page.getByRole('button',{name:'Identify anchor boxels',exact:true}).click();
 await page.getByRole('heading',{name:'Saved anchor lists',exact:true}).waitFor();
 await page.locator('#anchorListName').fill('Highway test');await page.getByRole('button',{name:'Save name',exact:true}).click();
 await page.getByText('Anchor list saved.',{exact:true}).waitFor();
 assert.equal(await page.locator('#export').isEnabled(),true);
 await page.locator('#export').click();assert.equal((await page.evaluate(()=>__export)).anchorLists[0].name,'Highway test');
 // The list is persisted even before a first survey exists.
 const persisted=await page.evaluate(()=>structuredClone(__store));
 await page.addInitScript(data=>{window.__store=data;},persisted);await page.reload();await page.waitForFunction(()=>window.SurveyUI);
 assert.equal((await page.evaluate(()=>SurveyUI.getState())).anchorLists[0].name,'Highway test');
 await page.getByRole('button',{name:'Open list',exact:true}).click();
 await page.getByRole('button',{name:'Choose nesting levels →',exact:true}).click();
 await page.locator('[data-level="c"]').uncheck();await page.getByRole('button',{name:'Optional final bounds →',exact:true}).click();
 await page.locator('[data-bound="0"]').fill('0');await page.locator('[data-bound="0"]').press('Tab');
 await page.getByRole('button',{name:/Start survey/}).click();await page.waitForFunction(()=>!SurveyUI.getBusy()&&SurveyUI.getState().surveys.length===1);
 const first=await page.evaluate(()=>SurveyUI.getState().surveys[0]);
 await page.getByRole('button',{name:'Return to anchor list',exact:true}).click();
 assert.match(await page.locator('#app').innerText(),/1 created/);
 await page.getByLabel('Select Pyurks LY-F d12',{exact:true}).check();await page.getByRole('button',{name:'Choose nesting levels →',exact:true}).click();
 await page.locator('[data-level="c"]').uncheck();await page.getByRole('button',{name:'Optional final bounds →',exact:true}).click();
 await page.locator('[data-bound="0"]').fill('0');await page.locator('[data-bound="0"]').press('Tab');
 await page.getByRole('button',{name:/Start survey/}).click();await page.waitForFunction(()=>!SurveyUI.getBusy()&&SurveyUI.getState().surveys.length===2);
 let state=await page.evaluate(()=>SurveyUI.getState());assert.equal(state.surveys[1].anchor.prefix,'Pyurks LY-F d12');assert.deepEqual(state.surveys[0].boxes,first.boxes);assert.equal(state.anchorLists.length,1);
 await page.getByRole('button',{name:'Return to anchor list',exact:true}).click();
 await page.locator(`[data-open-survey="${first.id}"]`).click();assert.equal((await page.evaluate(()=>SurveyUI.getState())).activeId,first.id);
 // A captured route remains available after the live route disappears.
 await page.getByRole('button',{name:'New survey',exact:true}).click();
 await page.evaluate(()=>{__route=[{StarSystem:'Phroea Phio KF-L d9-0'},{StarSystem:'Pyurks OE-E d13-0'}];__routeSub({data:{Route:__route}});});
 await page.getByLabel('Current GalMap route',{exact:true}).check();await page.getByRole('button',{name:'Identify anchor boxels',exact:true}).click();
 state=await page.evaluate(()=>SurveyUI.getState());const routeList=state.anchorLists.at(-1);
 await page.evaluate(()=>{__route=[];__routeSub({data:{Route:[]}});});
 await page.locator(`[data-open-anchor-list="${routeList.id}"]`).click();
 assert.match(await page.locator('#app').innerText(),/Saved route snapshot · 2 systems/);
 assert.equal(await page.getByRole('button',{name:'Recalculate from current route',exact:true}).isDisabled(),true);
 assert.equal(await page.getByRole('button',{name:'Choose nesting levels →',exact:true}).isEnabled(),true);
 assert.equal((await page.evaluate(()=>SurveyUI.getState())).draft.anchors[0].prefix,'Phroea Phio KF-L d9');
 const shots=process.env.SURVEY_SCREENSHOT_DIR;if(shots){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,'saved-anchor-lists.png'),fullPage:true});}
 // Removing a list never removes surveys and is not undone by reload migration.
 page.on('dialog',d=>d.accept());await page.locator(`[data-remove-anchor-list="${state.anchorLists[0].id}"]`).click();
 await page.waitForFunction(()=>SurveyUI.getState().anchorLists.length===1);
 assert.equal((await page.evaluate(()=>SurveyUI.getState())).surveys.length,2);
 const finalStore=await page.evaluate(()=>structuredClone(__store));await page.addInitScript(data=>{window.__store=data;},finalStore);await page.reload();await page.waitForFunction(()=>window.SurveyUI&&!SurveyUI.getBusy());
 state=await page.evaluate(()=>SurveyUI.getState());assert.equal(state.anchorLists.length,1);assert.equal(state.surveys.length,2);
 assert.deepEqual(errors,[]);
 console.log('PASS: automatic named list saving, list-only export/reload, creating two surveys, reopening existing surveys, route disappearance, safe removal and persistence.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

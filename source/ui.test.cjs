/* Set NODE_PATH to a directory containing playwright. Uses isolated headless Chrome. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  window.__store={};window.__calls=[];window.__subs=[];window.__input=[];
  window.Elite={
   store:{get:async(k,f)=>window.__store[k]??f,batch:async ops=>{const n=structuredClone(window.__store);for(const o of ops)o.op==='set'?n[o.key]=o.value:delete n[o.key];window.__store=n;}},
   net:{fetchQueued:async url=>{window.__calls.push(url);if(url.includes('field_values'))return{status:200,json:{min_max:[]}};if(url.includes('spansh'))return{status:200,json:{results:[]}};return{status:200,json:[]};}},
   data:{get:async()=>({found:false}),subscribe:()=>()=>{}},journal:{files:async()=>({files:[{file:'Journal.test.log'}]}),read:async({offset=0})=>({events:offset?[]:[{event:'Location',StarSystem:'Sol'}],info:{truncated:false}}),subscribe:(n,cb)=>window.__subs.push(cb)},
   overlay:{clear:async()=>{},set:async()=>{}},bindings:{press:async x=>window.__input.push(x)},input:{text:async x=>window.__input.push(x)},system:{health:async()=>({status:'ok'})}
  };
 });
 const url='file:///'+path.resolve(__dirname,'..','Systematic-Boxel-Survey.html').replaceAll('\\','/');await page.goto(url);
 await page.locator('#sourceText').fill('Pyurks OE-E d13-0');await page.getByRole('button',{name:'Identify anchor boxels'}).click();await page.getByRole('button',{name:'Choose nesting levels'}).click();
 await page.getByText('9 boxels selected.',{exact:false}).waitFor();assert.equal(await page.locator('[data-level]:checked').count(),2);
 await page.getByRole('button',{name:'Optional final bounds'}).click();assert.equal(await page.locator('[data-bound]').count(),9);
 await page.locator('[data-bound="0"]').fill('3');await page.locator('[data-bound="0"]').press('Tab');await page.getByRole('button',{name:'Start survey'}).click();
 await page.getByText('Final bounds partly or wholly unknown').waitFor();
 await page.getByText('Outside selected survey scope',{exact:true}).waitFor();
 await page.waitForFunction(()=>!SurveyUI.getBusy()&&SurveyUI.getState().surveys[0].boxes[0]?.records[0]?.catalogues.edsm);
 assert.equal((await page.evaluate(()=>SurveyUI.getState())).surveys[0].boxes[0].end,3);
 assert.ok(await page.getByText('No exact match in top 10',{exact:true}).count(),'uncertain Spansh search is visibly distinguished from absence/error');
 assert.equal(await page.locator('[data-action="checkTarget"]').isEnabled(),true);
 await page.locator('[data-action="next"]').click();await page.waitForFunction(()=>SurveyUI.getState().surveys[0].boxes[0].cursor===1);assert.equal(await page.evaluate(()=>__input.length),0);
 await page.locator('[data-action="iterate"]').click();await page.waitForFunction(()=>SurveyUI.getState().surveys[0].activeBox===1);
 assert.equal(await page.evaluate(()=>SurveyCore.surveyStats(SurveyUI.getState().surveys[0]).handled),0);
 await page.locator('[data-action="checkTarget"]').click();await page.waitForFunction(()=>!SurveyUI.getBusy());assert.equal(await page.evaluate(()=>SurveyUI.getState().surveys[0].boxes[1].end),null);
 assert.ok(await page.evaluate(()=>__calls.some(u=>u.includes('edsm'))));assert.ok(await page.evaluate(()=>__calls.some(u=>u.includes('spansh'))));
 // Arrival advances target without completing the visited system.
 await page.evaluate(()=>__subs.forEach(cb=>cb({event:'FSDJump',StarSystem:'Pyurks CJ-I c26-0',SystemAddress:'42'})));
 await page.waitForFunction(()=>SurveyUI.getState().surveys[0].boxes[1].cursor===1);
 await page.waitForFunction(()=>document.querySelector('.target')?.textContent.trim()==='Pyurks CJ-I c26-1');
 assert.equal(await page.evaluate(()=>SurveyCore.surveyStats(SurveyUI.getState().surveys[0]).handled),0);
 await page.evaluate(()=>__subs.forEach(cb=>cb({event:'FSDJump',StarSystem:'Sol'})));
 await page.getByText('Outside selected survey scope',{exact:true}).waitFor();
 assert.equal(await page.locator('[data-action="confirmBelts"]').count(),0);
 const out=process.env.SURVEY_SCREENSHOT_DIR;if(out){fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'dashboard.png'),fullPage:true});}
 // Persisted JSON faithfully restores. Replace the test host's storage after reload,
 // then re-run boot through navigation without issuing actual game or network I/O.
 await page.waitForFunction(()=>!SurveyUI.getBusy());await page.locator('[data-action="save"]').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Survey saved.');const stored=await page.evaluate(()=>structuredClone(__store));
 await page.addInitScript(data=>{window.__store=data;},stored);await page.reload();await page.waitForFunction(()=>window.SurveyUI&&SurveyUI.getState().surveys.length===1);
 assert.equal(await page.evaluate(()=>SurveyUI.getState().surveys[0].boxes[1].cursor),1);
 await page.setViewportSize({width:650,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(out)await page.screenshot({path:path.join(out,'dashboard-narrow.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS: wizard, nine rows, inclusive bounds, arrows, next boxel, both catalogues, unknown end, arrival/FSS separation, outside-scope recovery/live events/reload, persistence, no game input, responsive layout.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

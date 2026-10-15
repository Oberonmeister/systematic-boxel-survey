const assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('playwright');
const {createStoreHost}=require('./store.test-helper.cjs');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript({content:`window.createStoreHost=${createStoreHost.toString()};`});
 await page.addInitScript(()=>{
  window.__host=createStoreHost();window.Elite={store:__host.store,net:{fetchQueued:async()=>({status:200,json:[]})},
   data:{get:async()=>({found:false}),subscribe:()=>()=>{}},journal:{files:async()=>({files:[]}),subscribe:()=>()=>{}},overlay:{clear:async()=>{},set:async()=>{}}};
 });
 await page.goto('file:///'+path.resolve(__dirname,'..','Systematic-Boxel-Survey.html').replaceAll('\\','/'));
 await page.waitForFunction(()=>!!window.SurveyUI);
 for(const type of ['list','single','list']){
  const before=await page.evaluate(()=>__host.data()['survey.manifest']?.revision||0);
  await page.locator(`input[name="sourceType"][value="${type}"]`).check();
  await page.waitForFunction(n=>(__host.data()['survey.manifest']?.revision||0)>n,before);
  assert.equal(await page.locator('#toast').textContent(),'');assert.match(await page.locator('#connection').textContent(),/^Saved/);
 }
 // A failed save remains visible; a successful retry clears only that save error.
 await page.evaluate(()=>__host.failNext('batch',Error('Test storage failure')));
 await page.locator('#anchorMass').selectOption('c');await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Test storage failure');
 await page.locator('#anchorMass').selectOption('d');await page.waitForFunction(()=>document.querySelector('#connection').textContent.startsWith('Saved'));
 assert.equal(await page.locator('#toast').textContent(),'');
 await page.locator('#sourceText').fill('Pyurks OE-E d13-0');await page.getByRole('button',{name:'Identify anchor boxels'}).click();await page.getByRole('button',{name:'Choose nesting levels'}).click();
 await page.locator('[data-level="c"]').uncheck();await page.locator('[data-level="c"]').check();
 // Read back through a fresh bridge, just as reopening the tab would do.
 let saved;for(let attempt=0;attempt<50;attempt++){
  saved=await page.evaluate(async()=>({app:await SurveyBridge.createBridge(Elite).load(),limited:__host.limited,lease:__host.data()['survey.writeLease']}));
  if(saved.app.ui?.step===1&&saved.app.draft?.source.text==='Pyurks OE-E d13-0'&&saved.app.draft.levels.join(',')==='d,c'&&saved.lease===null)break;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
 assert.equal(saved.app.draft.source.text,'Pyurks OE-E d13-0');assert.deepEqual(saved.app.draft.levels,['d','c']);assert.equal(saved.limited.length,0);assert.equal(saved.lease,null);assert.deepEqual(errors,[]);
 console.log('PASS: repeated source and layer changes save under the JACoB rate limit; failed-save recovery clears the warning and persists choices.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

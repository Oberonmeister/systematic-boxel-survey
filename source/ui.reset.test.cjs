/* Isolated headless test; no real catalogues, journals, game input or user data. */
const assert=require('node:assert/strict'),path=require('node:path'),{chromium}=require('playwright');
const C=require('./model.js'),{createBridge}=require('./bridge.js'),{createStoreHost}=require('./store.test-helper.cjs');
(async()=>{
 const h=createStoreHost(),s=C.newSurvey({source:{type:'single'},...C.deriveAnchors(['Pyurks OE-E d13-0'],'d'),selected:0,levels:['d'],extraParents:[]});
 C.setBound(s,0,9);C.metadata(s,0).cursor=2;C.recordAt(s,0,1).journal.visited=true;
 await createBridge({store:h.store}).save({schema:1,surveys:[s],activeId:s.id,ui:{step:3},options:{autoCopy:false,autoPlot:false,overlay:false}});
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript({content:`window.createStoreHost=${createStoreHost.toString()};`});
  await page.addInitScript(seed=>{
   window.__host=createStoreHost(seed);window.__downloads=[];window.__failExport=false;
   window.Elite={store:__host.store,net:{fetchQueued:async url=>({status:200,json:url.includes('field_values')?{min_max:[]}:url.includes('spansh')?{results:[]}:[]})},
    data:{get:async()=>({found:false}),subscribe:()=>()=>{}},journal:{files:async()=>({files:[]}),subscribe:()=>()=>{}},overlay:{clear:async()=>{},set:async()=>{}},
    files:{json:(name,data)=>{if(__failExport)throw Error('Export unavailable');__downloads.push({name,data:structuredClone(data)});}}};
  },h.data());
  await page.goto('file:///'+path.resolve(__dirname,'..','Systematic-Boxel-Survey.html').replaceAll('\\','/'));
  await page.waitForFunction(()=>window.SurveyUI&&!SurveyUI.getBusy()&&SurveyUI.getState().surveys[0].boxes[0].records[2]?.catalogues.edsm);
  const reset=page.getByRole('button',{name:'Reset tab to defaults'});
  page.once('dialog',d=>d.dismiss());await reset.click();assert.equal(await page.evaluate(()=>SurveyUI.getState().surveys.length),1);assert.equal(await page.evaluate(()=>__downloads.length),0);
  await page.evaluate(()=>__failExport=true);page.once('dialog',d=>d.accept());await reset.click();await page.getByText('Reset failed; the previous survey was kept. Export unavailable',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>SurveyUI.getState().surveys.length),1);
  await page.evaluate(()=>__failExport=false);page.once('dialog',d=>d.accept());await reset.click();await page.getByText('Tab reset to defaults. A recovery backup was downloaded.',{exact:true}).waitFor();
  assert.equal(await page.locator('#anchorMass').inputValue(),'d');assert.equal(await page.locator('#sourceText').inputValue(),'');
  const state=await page.evaluate(()=>SurveyUI.getState());assert.deepEqual(state.surveys,[]);assert.deepEqual(state.options,{autoCopy:true,autoPlot:false,autoIterate:false,overlay:false,clipboardMode:'auto'});
  const saved=await page.evaluate(async()=>await SurveyBridge.createBridge(Elite).load());assert.deepEqual(saved.surveys,[]);
  const download=await page.evaluate(()=>__downloads[0]);assert.match(download.name,/before-reset/);assert.equal(download.data.workspace.surveys[0].boxes[0].end,9);
  page.once('dialog',d=>d.accept());await page.locator('#importFile').setInputFiles({name:'reset-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(download.data))});
  await page.getByText('Backup restored. Automatic plotting is off.',{exact:true}).waitFor();
  const restored=await page.evaluate(()=>SurveyUI.getState());assert.equal(restored.surveys[0].boxes[0].end,9);assert.equal(restored.surveys[0].boxes[0].cursor,2);assert.equal(restored.surveys[0].boxes[0].records[1].journal.visited,true);
  assert.equal(restored.options.autoPlot,false);assert.deepEqual(errors,[]);
  console.log('PASS: reset cancellation, failed-backup protection, atomic defaults, preserved recovery download, and restore of bounds/cursor/progress.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

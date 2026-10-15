const assert=require('node:assert/strict'),path=require('node:path'),C=require('./model.js'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});try{
 const s=C.newSurvey({source:{type:'single'},...C.deriveAnchors(['Pyurks OE-E d13-0'],'d'),selected:0,levels:['d'],extraParents:[]});C.setBound(s,0,1);
 const workspace={schema:1,surveys:[s],activeId:s.id,options:{autoCopy:false,autoPlot:false,overlay:false},ui:{step:3}};
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(workspace=>{
  let store={'survey.manifest':{schema:1,chunks:1,encoding:'json',revision:0},'survey.chunk.0':JSON.stringify(workspace)};
  const full={name:'Pyurks OE-E d13-0',id64:'123',bodyCount:1,bodies:[{bodyId:0,name:'Pyurks OE-E d13-0',type:'Star',subType:'G',rings:[],updateTime:new Date().toISOString()}]};
  window.__calls=[];window.Elite={store:{get:async(k,f)=>store[k]??f,batch:async ops=>{for(const o of ops)o.op==='set'?store[o.key]=o.value:delete store[o.key];},update:async(k,fn)=>store[k]=fn(store[k])},
   net:{fetchQueued:async(url,options)=>{__calls.push(url);const parsed=new URL(url);let json;
    if(url.includes('field_values'))json={min_max:parsed.searchParams.get('q').endsWith('-0')?[{name:full.name,id64:'123'}]:[]};
    else if(url.includes('/api/system/'))json={record:{...full,body_count:1}};
    else if(url.includes('/api/dump/'))json={system:full};
    else if(url.includes('spansh'))json={results:[]};
    else if(url.includes('/api-v1/systems?'))json=parsed.searchParams.getAll('systemName[]').includes(full.name)?[{name:full.name,id64:'123'}]:[];
    else json=full;return{status:200,json};}},data:{get:async()=>({found:false}),subscribe:()=>()=>{}},journal:{files:async()=>({files:[]}),subscribe:()=>()=>{}},overlay:{clear:async()=>{},set:async()=>{}}};
 },workspace);
 await page.goto('file:///'+path.resolve(__dirname,'..','Systematic-Boxel-Survey.html').replaceAll('\\','/'));
 await page.waitForFunction(()=>window.SurveyUI&&!SurveyUI.getBusy());const state=await page.evaluate(()=>SurveyUI.getState());assert.equal(state.surveys[0].boxes[0].cursor,1);assert.equal(C.surveyStats(state.surveys[0]).handled,1);assert.equal(C.surveyStats(state.surveys[0]).total,2);
 await page.locator('[data-action="editBounds"]').click();await page.locator('[data-bound="0"]').fill('Wrong Name');await page.locator('[data-bound="0"]').press('Tab');await page.getByRole('button',{name:'Save bounds & return'}).click();assert.equal(await page.evaluate(()=>SurveyUI.getState().ui.step),2);
 await page.locator('[data-bound="0"]').fill('0');await page.locator('[data-bound="0"]').press('Tab');await page.getByRole('button',{name:'Save bounds & return'}).click();await page.waitForFunction(()=>SurveyUI.getState().ui.step===3);assert.equal(await page.evaluate(()=>SurveyCore.surveyStats(SurveyUI.getState().surveys[0]).percent),100);
 assert.deepEqual(errors,[]);console.log('PASS: automatic checks skip complete entries, stop on absence, and invalid bounds cannot be committed; final user bounds supersede speculative probes.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

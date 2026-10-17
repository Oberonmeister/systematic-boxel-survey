/* Isolated browser: no live catalogues, clipboard or journals. */
const assert=require('node:assert/strict'),path=require('node:path'),C=require('./model.js'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});try{
 const s=C.newSurvey({source:{type:'single'},...C.deriveAnchors(['Pyurks OE-E d13-1'],'d'),selected:0,levels:['d'],extraParents:[]});C.setBound(s,0,1);s.boxes[0].cursor=1;s.historyVersion=2;
 const r=C.recordAt(s,0,1);r.id64='45340411891';r.catalogues.edsm=C.catalogueStatus({bodyCount:2,bodies:[{name:'A',type:'Star',subType:'G',updateTime:'2020-10-16 20:00:00'}]});s.policy.providers=['edsm'];
 const workspace={schema:1,surveys:[s],activeId:s.id,options:{autoCopy:true,overlay:true},ui:{step:3}},page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(workspace=>{
  window.__store={'survey.manifest':{schema:1,chunks:1,encoding:'json',revision:0},'survey.chunk.0':JSON.stringify(workspace),'survey.clipboardHelper':{format:'survey-clipboard-helper',transport:'jacob-store-v1',token:'a'.repeat(64)}};
  window.__copies=[];window.__calls=[];window.__scene=null;window.__traffic=null;
  window.Elite={store:{get:async(k,f)=>__store[k]??f,batch:async ops=>{for(const o of ops){o.op==='set'?__store[o.key]=o.value:delete __store[o.key];if(o.key==='survey.clipboardRequest')__copies.push(o.value.text);}}},
   net:{fetchQueued:async url=>{__calls.push(url);return new Promise(resolve=>{__traffic=()=>resolve({status:200,json:{name:'Pyurks OE-E d13-1',id64:'45340411891',discovery:{commander:'<Cmdr & One>',date:'2020-02-03 17:11:41'}}});});}},
   data:{get:async name=>name==='SurveyClipboardStatus.json'?{found:true,data:{requestId:__store['survey.clipboardRequest']?.id,ok:true}}:{found:false},subscribe:()=>()=>{}},
   journal:{files:async()=>({files:[]}),read:async()=>({events:[],info:{truncated:false}}),subscribe:()=>()=>{}},
   overlay:{clear:async()=>{},info:async()=>({hudVersion:2,width:2560}),set:async scene=>{__scene=scene;}}};
 },workspace);
 await page.goto('file:///'+path.resolve(__dirname,'..','Systematic-Boxel-Survey.html').replaceAll('\\','/'));
 await page.waitForFunction(()=>window.SurveyUI&&!SurveyUI.getBusy()&&__traffic);
 assert.deepEqual(await page.evaluate(()=>__copies),['Pyurks OE-E d13-1'],'clipboard finishes before attribution response');
 assert.equal(await page.locator('[data-action="checkTarget"]').isEnabled(),true);
 await page.evaluate(()=>__traffic());await page.waitForFunction(()=>__scene?.items[0].text.includes('[<Cmdr & One>]'));
 await page.getByText('EDSM [<Cmdr & One>]',{exact:true}).waitFor();
 assert.match(await page.locator('.sequenceRows').innerText(),/\[<Cmdr & One>\]/);assert.match(await page.locator('.sequenceRows').innerText(),/Body update: 2020-10-16 \(pre-Odyssey\)/);
 assert.match(await page.locator('.catalogue').innerText(),/Latest reported body update: 2020-10-16 20:00:00 UTC \(pre-Odyssey\)/);
 assert.match(await page.evaluate(()=>__scene.items[0].text),/body update 2020-10-16 \(pre-Odyssey\)/);
 assert.equal(await page.locator('cmdr').count(),0,'commander names are rendered as text, never HTML');
 const state=await page.evaluate(()=>SurveyUI.getState());assert.equal(state.surveys[0].boxes[0].records[1].journal.visited,false);assert.equal((await page.evaluate(()=>__calls)).length,1);
 assert.deepEqual(errors,[]);console.log('PASS: nonblocking EDSM attribution, clipboard timing, escaped commander names, target/list/HUD dates and unchanged visit evidence.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

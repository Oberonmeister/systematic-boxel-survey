/* Isolated browser: no live catalogue, clipboard or game input. */
const assert=require('node:assert/strict'),path=require('node:path'),C=require('./model.js'),{chromium}=require('playwright');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});try{
 const s=C.newSurvey({source:{type:'single'},...C.deriveAnchors(['Pyurks FH-J d10-0'],'d'),selected:0,levels:['d'],extraParents:[]});C.setBound(s,0,1);s.boxes[0].referenceId='560753248219';s.policy.visitAll=true;s.historyVersion=2;
 const workspace={schema:1,surveys:[s],activeId:s.id,options:{autoCopy:true,overlay:true},ui:{step:3}},page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(workspace=>{
  window.__store={'survey.manifest':{schema:1,chunks:1,encoding:'json',revision:0},'survey.chunk.0':JSON.stringify(workspace),'survey.clipboardHelper':{format:'survey-clipboard-helper',transport:'jacob-store-v1',token:'a'.repeat(64)}};
  window.__copies=[];window.__subs=[];window.__scene=null;
  const ids=['10997434331','45357172699'],names=['NGC 2244 Sector GW-M d7-0','Pyurks FH-J d10-1'];
  const detail=i=>({name:names[i],id64:ids[i],bodyCount:1,bodies:[{name:names[i],type:'Star',subType:'G'}]});
  window.Elite={store:{get:async(k,f)=>__store[k]??f,batch:async ops=>{for(const o of ops){o.op==='set'?__store[o.key]=o.value:delete __store[o.key];if(o.key==='survey.clipboardRequest')__copies.push(o.value.text);}}},
   net:{fetchQueued:async url=>{
    const u=new URL(url),name=u.searchParams.get('systemName[]')||u.searchParams.get('systemName');let json;
    if(u.pathname==='/api-v1/systems')json=names.includes(name)?[{name,id64:ids[names.indexOf(name)]}]:[];
    else if(u.pathname.includes('/bodies'))json=detail(names.indexOf(name));
    else if(u.pathname.includes('/traffic'))json={name,id64:ids[names.indexOf(name)]};
    else{const i=ids.indexOf(u.pathname.split('/').at(-1));if(i<0)throw Error('Unexpected request: '+url);json=u.pathname.includes('/dump/')?{system:detail(i)}:{record:detail(i)};}
    return{status:200,json};
   }},data:{get:async name=>name==='SurveyClipboardStatus.json'?{found:true,data:{requestId:__store['survey.clipboardRequest']?.id,ok:true}}:{found:false},subscribe:()=>()=>{}},
   journal:{files:async()=>({files:[]}),read:async()=>({events:[],info:{truncated:false}}),subscribe:(name,cb)=>__subs.push(cb)},
   overlay:{clear:async()=>{},info:async()=>({hudVersion:2,width:2560}),set:async scene=>{__scene=scene;}}};
 },workspace);
 await page.goto('file:///'+path.resolve(__dirname,'..','Systematic-Boxel-Survey.html').replaceAll('\\','/'));
 await page.waitForFunction(()=>window.SurveyUI&&!SurveyUI.getBusy()&&__scene);
 assert.equal(await page.locator('.target').innerText(),'NGC 2244 Sector GW-M d7-0');assert.match(await page.locator('.targetCard').innerText(),/Survey sequence: Pyurks FH-J d10-0.*matched by system address/);
 assert.equal(await page.evaluate(()=>__copies.at(-1)),'NGC 2244 Sector GW-M d7-0');assert.match(await page.evaluate(()=>__scene.items[0].text),/Next: NGC 2244 Sector GW-M d7-0/);
 await page.evaluate(()=>__subs.forEach(cb=>cb({event:'FSDJump',StarSystem:'NGC 2244 Sector GW-M d7-0',SystemAddress:'10997434331'})));
 await page.waitForFunction(()=>!SurveyUI.getBusy()&&__copies.at(-1)==='Pyurks FH-J d10-1');
 await page.evaluate(()=>__subs.forEach(cb=>{cb({event:'Scan',StarSystem:'NGC 2244 Sector GW-M d7-0',SystemAddress:'10997434331',BodyID:0,BodyName:'NGC 2244 Sector GW-M d7-0',StarType:'G'});cb({event:'FSSAllBodiesFound',SystemName:'NGC 2244 Sector GW-M d7-0',SystemAddress:'10997434331',Count:1});}));
 const state=await page.evaluate(()=>SurveyUI.getState());assert.equal(state.surveys[0].boxes[0].cursor,1);assert.equal(C.localStatus(state.surveys[0].boxes[0].records[0]).complete,true);assert.equal(state.surveys[0].boxes[0].records[1].journal.visited,false);
 await page.locator('[data-action="save"]').click();const stored=await page.evaluate(()=>structuredClone(__store));await page.addInitScript(store=>{window.__store=store;},stored);await page.reload();await page.waitForFunction(()=>window.SurveyUI&&!SurveyUI.getBusy());
 assert.equal((await page.evaluate(()=>SurveyUI.getState())).surveys[0].boxes[0].records[0].alias,'NGC 2244 Sector GW-M d7-0');assert.deepEqual(errors,[]);
 console.log('PASS: verified alternate target, original survey label, copying, HUD, arrival advance, late FSS attribution and reload.');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});

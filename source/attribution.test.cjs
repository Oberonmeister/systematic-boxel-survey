const test=require('node:test'),assert=require('node:assert/strict'),C=require('./model.js'),{createBridge}=require('./bridge.js');
const fixture={id:48401680,id64:45340411891,name:'Pyurks OE-E d13-1',discovery:{commander:'Armourer',date:'2020-02-03 17:11:41'},traffic:{total:2,week:1,day:1}};
function setup(response=fixture){
 const s=C.newSurvey({source:{type:'single'},...C.deriveAnchors([fixture.name],'d'),selected:0,levels:['d'],extraParents:[]}),r=C.recordAt(s,0,1),calls=[];
 r.id64=String(fixture.id64);r.catalogues.edsm={state:'present',complete:false};
 const bridge=createBridge({net:{fetchQueued:async(url)=>{calls.push(url);if(response instanceof Error)throw response;return{status:200,json:response};}}});
 return{s,r,calls,bridge};
}
test('EDSM system attribution uses the traffic response, persists and survives catalogue refreshes',async()=>{
 const {s,r,calls,bridge}=setup();const before=C.outcome(r,s.policy);
 await bridge.edsmDiscovery(s,0,1);assert.equal(r.edsmDiscovery.commander,'Armourer');assert.equal(r.edsmDiscovery.date,'2020-02-03T17:11:41.000Z');
 assert.match(calls[0],/api-system-v1\/traffic\?systemName=Pyurks%20OE-E%20d13-1/);assert.deepEqual(C.outcome(r,s.policy),before);assert.equal(r.journal.visited,false);
 r.catalogues.edsm=C.catalogueStatus({name:fixture.name});await bridge.edsmDiscovery(s,0,1);assert.equal(calls.length,1);
 const restored=C.validateApp(JSON.parse(JSON.stringify({schema:1,surveys:[s]})));assert.equal(restored.surveys[0].boxes[0].records[1].edsmDiscovery.commander,'Armourer');
});
test('attribution failures and missing discovery never affect presence or completion; retries are paced',async()=>{
 for(const response of [Error('Network down'),{...fixture,name:'Different system'},{...fixture,id64:1},{...fixture,discovery:undefined}]){
  const {s,r,calls,bridge}=setup(response),before=C.clone(r.catalogues);await bridge.edsmDiscovery(s,0,1);await bridge.edsmDiscovery(s,0,1);
  assert.deepEqual(r.catalogues,before);assert.equal(r.edsmDiscovery.commander,'');assert.equal(calls.length,1);
  if(response.discovery===undefined&&response.name===fixture.name)assert.equal(r.edsmDiscovery.error,undefined);
 }
});
test('disabled, absent and cancelled attribution checks issue no requests',async()=>{
 const {s,r,calls,bridge}=setup();await bridge.edsmDiscovery(s,0,1,{stopped:()=>true});r.catalogues.edsm.state='absent';await bridge.edsmDiscovery(s,0,1);
 r.catalogues.edsm.state='present';s.policy.providers=['spansh'];await bridge.edsmDiscovery(s,0,1);assert.equal(calls.length,0);
});
test('concurrent attribution requests are shared and late responses for abandoned targets are discarded',async()=>{
 const {s,r}=setup();let release,calls=0,stop=false;
 const bridge=createBridge({net:{fetchQueued:async()=>{calls++;return new Promise(resolve=>{release=()=>resolve({status:200,json:fixture});});}}});
 const one=bridge.edsmDiscovery(s,0,1,{stopped:()=>stop}),two=bridge.edsmDiscovery(s,0,1);
 await new Promise(resolve=>setTimeout(resolve,25));assert.equal(calls,1);stop=true;release();await Promise.all([one,two]);assert.equal(r.edsmDiscovery,undefined);
});
test('latest body date is separate from oldest scan, query time and system discovery date',()=>{
 const status=C.catalogueStatus({discovery:fixture.discovery,bodyCount:2,bodies:[
  {name:'A',type:'Star',subType:'G',updateTime:'2026-01-01 12:00:00'},
  {name:'B',type:'Star',subType:'G',updateTime:'2026-10-16 20:00:00'},
 ]},'2026-10-17T10:00:00Z');
 assert.equal(status.latestBodyUpdate,'2026-10-16T20:00:00.000Z');assert.equal(status.updated,'2026-01-01T12:00:00.000Z');assert.equal(status.checked,'2026-10-17T10:00:00Z');
 assert.equal(C.catalogueStatus({discovery:fixture.discovery}).latestBodyUpdate,'');
 assert.equal(C.catalogueStatus({bodies:[{name:'A',type:'Star',timestamp:'invalid'}]}).latestBodyUpdate,'');
 assert.equal(C.catalogueTime('2026-10-16T23:00:00+03:00'),'2026-10-16T20:00:00.000Z');
 assert.equal(C.catalogueTime(null),'');
 assert.equal(C.outcome({catalogues:{edsm:status},journal:{bodies:{},expectedBelts:[],resolvedBelts:[]}}, {providers:['edsm'],staleDays:10},Date.parse('2026-10-17T10:00:00Z')).reason,'Old or undated catalogue data');
});
test('overlay shows bracketed EDSM attribution and body-update dates without discovery or lookup dates',async()=>{
 const {s,r,bridge}=setup();await bridge.edsmDiscovery(s,0,1);s.boxes[0].cursor=1;r.catalogues.edsm.latestBodyUpdate='2026-10-16T20:00:00Z';let scene;
 await createBridge({overlay:{info:async()=>({hudVersion:2,width:2560}),set:async value=>scene=value}}).overlay(s,true);
 assert.match(scene.items[0].text,/EDSM: present \[Armourer\] · body update 2026-10-16/);assert.doesNotMatch(scene.items[0].text,/2020-02-03/);
 assert.equal(scene.items[0].color,'#65FF9A');assert.equal(scene.items[0].align,'center');
});
test('pre-Odyssey label applies only to valid body dates before the 19 May 2021 release date',()=>{
 assert.equal(C.catalogueDateLabel('2021-05-18 23:59:59'),'2021-05-18 (pre-Odyssey)');
 assert.equal(C.catalogueDateLabel('2021-05-19 00:00:00'),'2021-05-19');
 assert.equal(C.catalogueDateLabel('2021-05-19T01:00:00+03:00'),'2021-05-18 (pre-Odyssey)');
 assert.equal(C.catalogueDateLabel('2026-10-17 12:00:00',true),'2026-10-17 12:00:00 UTC');
 assert.equal(C.catalogueDateLabel('not a date'),'');assert.equal(C.catalogueDateLabel(undefined),'');
});

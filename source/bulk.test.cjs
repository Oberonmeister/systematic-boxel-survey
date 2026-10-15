const test=require('node:test'),assert=require('node:assert/strict'),C=require('./model.js'),{createBridge}=require('./bridge.js'),fixtures=require('./bulk.catalogue-fixture.json');
function setup(index=0){
 const f=fixtures[index],mass=C.parseName(f.name+'-0').mass,s=C.newSurvey({source:{type:'single'},...C.deriveAnchors([f.name+'-0'],mass),selected:0,levels:[mass],extraParents:[]});C.setBound(s,0,f.end);
 const calls=[],sdk={net:{fetchQueued:async(url,o)=>{calls.push({url,...o});const json=url.includes('/systems/search')?f.spansh:url.includes('/api-v1/systems?')?f.edsm:url.includes('/dump/')?f.spanshDetail:f.edsmDetail;return{status:200,json};}}};
 return{f,s,calls,sdk,bridge:createBridge(sdk)};
}
test('live 18-system fixture: two bulk requests and two details reproduce previous presence and completion',async()=>{
 const {s,calls,bridge}=setup();await bridge.checkBoxel(s,0);
 assert.equal(calls.length,4);assert.match(calls[0].url,/systemName=Phroea%20Phio%20UK-W%20c18-/);assert.equal(calls[1].body.size,28);assert.deepEqual(calls[1].body.sort,[]);
 for(const [p,expected]of [['edsm',[13]],['spansh',[3,13,14]]])assert.deepEqual(Object.values(s.boxes[0].records).filter(r=>r.catalogues[p].state==='present').map(r=>r.seq),expected);
 assert.equal(C.outcome(C.recordAt(s,0,13),s.policy).handled,true);assert.equal(C.surveyStats(s).handled,1);assert.equal(C.surveyStats(s).attention,17);
 assert.equal(C.recordAt(s,0,0).catalogues.spansh.state,'unknown');assert.equal(C.recordAt(s,0,3).catalogues.spansh.needsDetails,true);assert.equal(s.boxes[0].end,17);
});
test('live 133-system fixture: 143 results filtered by exact boxel; visit-all skips details',async()=>{
 const {s,calls,bridge}=setup(1);s.policy.visitAll=true;await bridge.checkBoxel(s,0);
 assert.equal(calls.length,2);assert.equal(calls[1].body.size,143);assert.equal(Object.keys(s.boxes[0].records).length,133);
 assert.equal(Object.values(s.boxes[0].records).filter(r=>r.catalogues.spansh.state==='present').length,22);
 assert.equal(Object.values(s.boxes[0].records).filter(r=>r.catalogues.edsm.state==='present').length,21);
 assert.equal(C.recordAt(s,0,58).catalogues.edsm.state,'absent');assert.equal(C.surveyStats(s).handled,0);
});
test('unknown boundary refuses bulk requests; suffix zero is a valid bounded boxel',async()=>{
 const {s,calls,bridge}=setup();C.setBound(s,0,'');await assert.rejects(bridge.checkBoxel(s,0),/final suffix/);assert.equal(calls.length,0);
 C.setBound(s,0,0);await bridge.checkBoxel(s,0);assert.equal(calls[1].body.size,11);assert.deepEqual(Object.keys(s.boxes[0].records),['0']);
});
test('personal completion and ignore-visited avoid unnecessary details without erasing personal evidence',async()=>{
 for(const mode of ['manual','visited']){
  const {s,calls,bridge}=setup(),r=C.recordAt(s,0,13);if(mode==='manual')C.confirmFullScan(r);else{r.journal.visited=true;s.policy.ignoreVisited=true;}
  await bridge.checkBoxel(s,0);assert.equal(calls.length,2);assert.equal(C.outcome(r,s.policy).handled,true);
 }
});
test('one enabled provider requests details for its matches',async()=>{
 const {s,calls,bridge}=setup();s.policy.providers=['edsm'];await bridge.checkBoxel(s,0);assert.equal(calls.length,2);assert.ok(calls.every(c=>c.url.includes('edsm.net')));assert.equal(C.outcome(C.recordAt(s,0,13),s.policy).handled,true);
});
test('bulk failure never becomes absence and successful provider results are retained',async()=>{
 const {s,sdk,bridge}=setup();const fetch=sdk.net.fetchQueued;sdk.net.fetchQueued=(url,o)=>url.includes('spansh')?{status:503,json:{}}:fetch(url,o);
 await assert.rejects(bridge.checkBoxel(s,0),/Bulk checks incomplete/);assert.equal(C.recordAt(s,0,13).catalogues.edsm.state,'present');assert.equal(C.recordAt(s,0,0).catalogues.spansh.state,'error');assert.equal(C.recordAt(s,0,13).catalogues.edsm.needsDetails,true);
});
test('malformed bulk response cannot mark all systems absent',async()=>{
 const {s,sdk,bridge}=setup();const fetch=sdk.net.fetchQueued;sdk.net.fetchQueued=(url,o)=>url.includes('edsm')?{status:200,json:{error:'unavailable'}}:fetch(url,o);
 await assert.rejects(bridge.checkBoxel(s,0),/not recognised/);assert.equal(C.recordAt(s,0,0).catalogues.edsm.state,'error');assert.equal(C.recordAt(s,0,13).catalogues.spansh.state,'present');
});
test('stop after a request retains that response and starts no next request',async()=>{
 const {s,calls,sdk,bridge}=setup();let stop=false;const fetch=sdk.net.fetchQueued;sdk.net.fetchQueued=async(...args)=>{const response=await fetch(...args);stop=true;return response;};
 await bridge.checkBoxel(s,0,{stopped:()=>stop});assert.equal(calls.length,1);assert.equal(C.recordAt(s,0,13).catalogues.edsm.state,'present');assert.equal(C.recordAt(s,0,13).catalogues.spansh,undefined);
});
test('detail failure preserves positive presence and pauses on server errors',async()=>{
 const {s,sdk,bridge}=setup();const fetch=sdk.net.fetchQueued;sdk.net.fetchQueued=(url,o)=>url.includes('/bodies?')?{status:502,json:{}}:fetch(url,o);
 await assert.rejects(bridge.checkBoxel(s,0),/detail checks paused/);const r=C.recordAt(s,0,13);assert.equal(r.catalogues.edsm.state,'present');assert.equal(r.catalogues.edsm.needsDetails,true);assert.equal(C.outcome(r,s.policy).handled,false);
});
test('changing provider policy during discovery starts no obsolete follow-up requests',async()=>{
 const {s,calls,sdk,bridge}=setup();const fetch=sdk.net.fetchQueued;sdk.net.fetchQueued=async(...args)=>{const response=await fetch(...args);s.policy.providers=['edsm'];return response;};
 await bridge.checkBoxel(s,0);assert.equal(calls.length,1);assert.equal(C.recordAt(s,0,13).catalogues.edsm.state,'present');assert.equal(C.recordAt(s,0,13).catalogues.spansh,undefined);
});
test('automatic target preparation reuses fresh bulk results; changed policy fetches previously deferred details',async()=>{
 const {s,calls,bridge}=setup();s.policy.visitAll=true;await bridge.checkBoxel(s,0);await bridge.check(s,0,[0,13]);assert.equal(calls.length,2);
 s.policy.visitAll=false;s.policy.providers=['edsm'];await bridge.check(s,0,[13]);assert.equal(calls.length,4);assert.equal(C.outcome(C.recordAt(s,0,13),s.policy).handled,true);
});
test('address conflicts are unresolved rather than silently overwriting journal identity',async()=>{
 const {s,calls,bridge}=setup();const r=C.recordAt(s,0,13);r.id64='999';await bridge.checkBoxel(s,0);assert.equal(calls.length,2);assert.equal(r.id64,'999');assert.equal(r.catalogues.edsm.state,'error');assert.equal(r.catalogues.spansh.state,'error');
});

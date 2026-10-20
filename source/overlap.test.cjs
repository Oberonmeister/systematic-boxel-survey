const test=require('node:test'),assert=require('node:assert/strict'),C=require('./model.js'),{createBridge}=require('./bridge.js');
// The user confirmed this address response and the same resolved name in GalMap
// on 2026-10-21. The reference comes from the existing survey's catalogue records.
const original='Pyurks FH-J d10-0',alias='NGC 2244 Sector GW-M d7-0',id='10997434331',reference='560753248219';
function setup(){const s=C.newSurvey({source:{type:'single'},...C.deriveAnchors([original],'d'),selected:0,levels:['d'],extraParents:[]});C.setBound(s,0,46);s.boxes[0].referenceId=reference;return s;}
const detail=(name,address=id)=>({name,id64:address,bodyCount:1,bodies:[{name,type:'Star',subType:'G',updateTime:'2026-10-21 00:00:00'}]});
function host(handler){const calls=[];return{calls,sdk:{net:{fetchQueued:async(url,o)=>{calls.push({url,...o});return{status:200,json:await handler(url,o)};}}}};}

test('confirmed D overlap resolves by address and rechecks EDSM under the actual name',async()=>{
 const s=setup(),h=host(url=>{
  if(url.includes('/api-v1/systems?'))return decodeURIComponent(url).includes(alias)?[{name:alias,id64:id}]:[];
  if(url.includes('/bodies?')){assert.ok(decodeURIComponent(url).includes(alias));return detail(alias);}
  assert.ok(url.endsWith('/'+id));return url.includes('/dump/')?{system:detail(alias)}:{record:{name:alias,id64:id}};
 });
 await createBridge(h.sdk).check(s,0,[0]);const r=C.recordAt(s,0,0);
 assert.equal(r.alias,alias);assert.equal(r.id64,id);assert.equal(r.catalogues.edsm.state,'present');assert.equal(r.catalogues.spansh.complete,true);assert.equal(C.outcome(r,s.policy).handled,true);
 assert.equal(r.journal.visited,false,'catalogue identity is not personal visit evidence');assert.equal(h.calls.length,5);
 assert.equal(s.boxes[0].end,46);assert.equal(C.recordAt(s,0,1,false),null,'no inferred renaming of other suffixes');
});

test('native catalogue helper accepts the verified alternate procedural name too',async()=>{
 const s=setup(),h=host(()=>({system:detail(alias)}));h.sdk.catalog={system:{get:async q=>{assert.equal(q.id64,id);return{found:true,record:{name:alias,id64:id}};}}};
 const r=await createBridge(h.sdk).spansh(s,0,0);assert.equal(r.complete,true);assert.equal(h.calls.length,1);
});

test('mismatched or unverified alternate identities are rejected before saving an alias',async()=>{
 for(const record of [{name:alias},{name:alias,id64:'10997434339'},{name:'NGC 2244 Sector GW-M d7-1',id64:id},{name:'NGC 2244 Sector PY-X c15-0',id64:id}]){
  const s=setup(),h=host(()=>({record}));await assert.rejects(createBridge(h.sdk).spansh(s,0,0),/address/);assert.equal(C.recordAt(s,0,0).alias,undefined);assert.equal(h.calls.length,1);
 }
});

test('mismatched dump identity cannot mark the target fully scanned',async()=>{
 const s=setup(),h=host(url=>url.includes('/dump/')?{system:detail(alias,'10997434339')}:{record:{name:alias,id64:id}});
 s.policy.providers=['spansh'];await createBridge(h.sdk).check(s,0,[0]);const r=C.recordAt(s,0,0);assert.equal(r.catalogues.spansh.state,'error');assert.equal(C.outcome(r,s.policy).handled,false);
 assert.equal(r.alias,alias,'verified system name survives a failed body request');
});

test('alias arrivals and scans match known physical cells before any per-system catalogue lookup',()=>{
 const s=setup(),event={event:'FSDJump',StarSystem:alias,SystemAddress:id};
 assert.deepEqual(C.applyJournal(s,event),{i:0,seq:0});assert.equal(s.liveSystem.outside,undefined);
 assert.equal(C.advanceOnArrival(s,{i:0,seq:0}),true);assert.equal(s.boxes[0].cursor,1);
 C.applyJournal(s,{...event,event:'FSSAllBodiesFound',Count:1});assert.equal(C.recordAt(s,0,0).journal.fss,true);assert.equal(C.recordAt(s,0,1,false),null);
 const next=C.addressAt(s,0,1);assert.deepEqual(C.applyJournal(s,{...event,StarSystem:alias.replace(/0$/,'1'),SystemAddress:next}),{i:0,seq:1});
 assert.equal(C.applyJournal(s,{...event,SystemAddress:'10997434339'}),null,'a different physical cell is outside the survey');
 const beyond=C.addressAt(s,0,47);assert.equal(C.applyJournal(s,{...event,StarSystem:alias.replace(/0$/,'47'),SystemAddress:beyond}),null);
 assert.equal(C.applyJournal(s,{...event,StarSystem:original,SystemAddress:'10997434339'}),null,'a matching name cannot overwrite a conflicting physical address');
});

test('unknown and excluded cells never acquire visits by similar names',()=>{
 const s=setup();delete s.boxes[0].referenceId;assert.equal(C.applyJournal(s,{event:'FSDJump',StarSystem:alias,SystemAddress:id}),null);
 s.boxes[0].referenceId=reference;s.excluded=[0];assert.equal(C.applyJournal(s,{event:'FSDJump',StarSystem:alias,SystemAddress:id}),null);
});

test('physical address decoding keeps suffix, mass and cell separate and rejects body IDs',()=>{
 const s=setup();assert.equal(C.addressAt(s,0,0),id);assert.equal(C.addressParts(reference).seq,16);assert.equal(C.addressParts(id).mass,'d');
 assert.equal(C.addressParts('0'),null);assert.equal(C.addressParts((1n<<55n).toString()),null);assert.equal(C.addressParts(9007199254740993),null);
 assert.equal(C.addressAt(s,0,-1),'');assert.equal(C.addressAt(s,0,C.maxSuffix('d')+1),'');
 const bad=C.recordAt(s,0,1);bad.id64='45357172707';assert.equal(C.referenceAddress(s,0),null,'conflicting cells cannot seed address generation');
});

test('whole-boxel checks retain aliases with one bulk search per known prefix and provider',async()=>{
 const s=setup();C.setBound(s,0,2);s.policy.visitAll=true;Object.assign(C.recordAt(s,0,0),{id64:id,alias});
 const normal='Pyurks FH-J d10-1',one=C.addressAt(s,0,1),foreign='NGC 2244 Sector GW-M d7-2',wrong=C.addressAt(s,0,2); // different cell, same suffix
 const h=host((url,o)=>{
  const prefix=url.includes('/systems/search')?o.body.filters.name.value:new URL(url).searchParams.get('systemName');
  const rows=prefix.startsWith('Pyurks')?[{name:normal,id64:one}]:[{name:alias,id64:id},{name:foreign,id64:(BigInt(wrong)+8n).toString()}];
  return url.includes('/systems/search')?{results:rows}:rows;
 });
 await createBridge(h.sdk).checkBoxel(s,0);assert.equal(h.calls.length,4);
 const r=C.recordAt(s,0,0);assert.equal(r.alias,alias);assert.equal(r.catalogues.edsm.state,'present');assert.equal(r.catalogues.spansh.state,'present');
 assert.equal(C.recordAt(s,0,1).catalogues.spansh.state,'present');assert.equal(C.recordAt(s,0,2).id64,undefined);assert.equal(C.recordAt(s,0,2).catalogues.spansh.state,'unknown');
});

test('stopping after alias resolution leaves EDSM unresolved rather than keeping stale absence',async()=>{
 const s=setup();let stop=false;const h=host(url=>{
  if(url.includes('edsm.net'))return[];
  if(url.includes('/dump/')){stop=true;return{system:detail(alias)};}
  return{record:{name:alias,id64:id}};
 });const bridge=createBridge(h.sdk);await bridge.check(s,0,[0],{stopped:()=>stop});
 assert.equal(C.recordAt(s,0,0).catalogues.edsm.state,'unknown');assert.equal(h.calls.length,3);
});

test('overlay and persisted backups retain the verified target without losing its survey label',async()=>{
 const s=setup();Object.assign(C.recordAt(s,0,0),{id64:id,alias});const app=C.validateApp(JSON.parse(JSON.stringify({schema:1,surveys:[s],activeId:s.id})));let scene;
 await createBridge({overlay:{set:async x=>{scene=x;}}}).overlay(app.surveys[0],true);
 assert.ok(scene.items[0].text.includes('Next: '+alias));assert.ok(scene.items[0].text.includes('Current boxel survey: Pyurks FH-J d10'));
});

test('EDSM may retain its own verified name when Spansh uses another region label',async()=>{
 const s=setup(),h=host(url=>{
  if(url.includes('/api-v1/systems?')){assert.ok(decodeURIComponent(url).includes(original));return[{name:original,id64:id}];}
  if(url.includes('/bodies?'))return detail(original);
  if(url.includes('/traffic?')){assert.ok(decodeURIComponent(url).includes(original));return{name:original,id64:id,discovery:{commander:'Test commander'}};}
  return url.includes('/dump/')?{system:detail(alias)}:{record:{name:alias,id64:id}};
 });const bridge=createBridge(h.sdk);await bridge.check(s,0,[0]);assert.equal(h.calls.length,4,'no redundant EDSM request after verified presence');
 await bridge.check(s,0,[0],{force:true});await bridge.edsmDiscovery(s,0,0);
 const r=C.recordAt(s,0,0);assert.equal(r.alias,alias);assert.equal(r.catalogues.edsm.name,original);assert.equal(r.edsmDiscovery.commander,'Test commander');
});

test('a failed alias dump leaves EDSM pending so the next check can retry the actual name',async()=>{
 const s=setup(),h=host(url=>{if(url.includes('edsm'))return[];if(url.includes('/dump/'))throw Object.assign(Error('timed out'),{code:'TIMEOUT'});return{record:{name:alias,id64:id}};});
 await assert.rejects(createBridge(h.sdk).check(s,0,[0,1]),/Batch paused/);assert.equal(C.recordAt(s,0,0).catalogues.edsm.state,'unknown');assert.equal(C.recordAt(s,0,0).alias,alias);
});

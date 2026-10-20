const test=require('node:test'),assert=require('node:assert/strict'),C=require('./model.js'),{createBridge}=require('./bridge.js');
const {createStoreHost}=require('./store.test-helper.cjs');
const make=()=>C.newSurvey({source:{type:'single'},...C.deriveAnchors(['Pyurks OE-E d13-0'],'d'),selected:0,levels:['d'],extraParents:[]});
function host(handler=()=>({status:200,json:[]})){
 let db={},fail=false;const calls=[];
 const sdk={store:{get:async(k,f)=>db[k]??f,batch:async ops=>{if(fail)throw Error('Disk full');const next=JSON.parse(JSON.stringify(db));for(const o of ops)o.op==='set'?next[o.key]=o.value:delete next[o.key];db=next;}},net:{fetchQueued:async(u,o)=>{calls.push({url:u,options:o});return handler(u,o);}},data:{get:async()=>({found:true,data:{Route:[{StarSystem:'A',SystemAddress:'9007199254740993',StarPos:[1,2,3]}]}})},journal:{files:async()=>({files:[{file:'Journal.1.log'}]}),read:async()=>({events:[],info:{truncated:false}})}};
 return{sdk,calls,data:()=>db,corrupt:(k,v)=>db[k]=v,fail:()=>fail=true};
}
test('atomic segmented persistence restores exact state and failed write preserves previous snapshot',async()=>{
 const h=host(),bridge=createBridge(h.sdk),s=make(),app={schema:1,surveys:[s],activeId:s.id};s.source.text=require('node:crypto').randomBytes(120000).toString('hex');await bridge.save(app);assert.ok(h.data()['survey.manifest'].chunks>1);assert.deepEqual(await createBridge(h.sdk).load(),app);
 h.fail();app.surveys[0].source.text='changed';await assert.rejects(bridge.save(app),/Disk full/);assert.equal((await createBridge(h.sdk).load()).surveys[0].source.text.length,240000);
});
test('corrupt or missing storage chunk is a visible failure, not an empty survey',async()=>{
 const h=host(),b=createBridge(h.sdk);await b.save({schema:1,surveys:[]});h.corrupt('survey.chunk.0',null);await assert.rejects(createBridge(h.sdk).load(),/missing/);
});
test('route is consumed as a copied snapshot without numeric ID corruption',async()=>{
 const h=host(),r=await createBridge(h.sdk).route();assert.equal(r[0].id64,'9007199254740993');assert.equal(r[0].name,'A');
});
test('EDSM gets a true array query for several names; HTTP 500 never becomes absence',async()=>{
 const h=host(u=>u.includes('/systems?')?{status:200,json:[]}:{status:500,json:{}}),b=createBridge(h.sdk),s=make();s.policy.providers=['edsm'];await b.check(s,0,[0,1,2]);assert.equal(h.calls.length,1);assert.equal((h.calls[0].url.match(/systemName\[\]/g)||[]).length,3);assert.equal(C.recordAt(s,0,1).catalogues.edsm.state,'absent');
 const err=createBridge(host(()=>({status:500,json:{}})).sdk);await err.check(s,0,[0],{force:true});assert.equal(C.recordAt(s,0,0).catalogues.edsm.state,'error');assert.equal(C.metadata(s,0).end,null);
});
test('EDSM malformed successful response stays unresolved',async()=>{
 const h=host(()=>({status:200,json:{}})),s=make();s.policy.providers=['edsm'];await createBridge(h.sdk).check(s,0,[0]);assert.equal(C.recordAt(s,0,0).catalogues.edsm.state,'error');
});
test('Spansh search misses use one top-ten request and remain visit candidates, not confirmed absence',async()=>{
 const h=host(()=>({status:200,json:{results:[]}})),s=make();s.policy.providers=['spansh'];await createBridge(h.sdk).check(s,0,[0]);assert.equal(h.calls.length,1);assert.ok(h.calls[0].url.endsWith('/systems/search'));
 assert.deepEqual(h.calls[0].options.body,{filters:{name:{value:'Pyurks OE-E d13-0'}},size:10,page:0});
 const r=C.recordAt(s,0,0);assert.equal(r.catalogues.spansh.state,'unknown');assert.equal(r.catalogues.spansh.quality,'No exact match in top 10');assert.equal(r.id64,undefined);assert.equal(C.metadata(s,0).end,null);
 assert.equal(C.outcome(r,s.policy).kind,'attention');assert.equal(C.outcome(r,s.policy).handled,false);assert.equal(C.boxStats(s,0).attention,1);
});
test('Spansh search error is never treated as a gap',async()=>{
 const h=host(u=>u.includes('field_values')?{status:200,json:{min_max:[]}}:{status:503,json:{}}),s=make();s.policy.providers=['spansh'];await createBridge(h.sdk).check(s,0,[0]);assert.equal(C.recordAt(s,0,0).catalogues.spansh.state,'error');
});
test('Spansh accepts the tenth exact result but does not inspect an eleventh result',async()=>{
 for(const place of [9,10]){
  const s=make(),name=C.systemName(s.anchor,0),id='11014227923';s.policy.providers=['spansh'];
  const rows=Array.from({length:place},()=>({name:'Another Sector OE-E d13-0',id64:id}));rows.push({name,id64:id});
  const h=host(url=>({status:200,json:url.endsWith('/systems/search')?{results:rows}:url.includes('/system/')?{record:{name,id64:id}}:{system:{name,id64:id}}}));
  await createBridge(h.sdk).check(s,0,[0]);assert.equal(C.recordAt(s,0,0).catalogues.spansh.state,place===9?'present':'unknown');assert.equal(h.calls.length,place===9?3:1);
 }
});
test('real same-boxel Spansh results supply an exact reference without claiming the requested system exists',async()=>{
 const s=C.newSurvey({source:{type:'single'},...C.deriveAnchors(['Phroea Phio UK-W c18-0'],'c'),selected:0,levels:['c'],extraParents:[]});s.policy.providers=['spansh'];
 const h=host(url=>{
  if(url.endsWith('/systems/search'))return{status:200,json:{results:[{name:'Phroea Phio UK-W c18-14',id64:'3936371019682'},{name:'Phroea Phio UK-W c18-3',id64:'912714043298'}]}};
  if(url.endsWith('/system/88080322466'))return{status:404};
  assert.ok(url.endsWith('/912714043298'),'subsequent suffix uses the observed exact reference address');
  const data={name:'Phroea Phio UK-W c18-3',id64:'912714043298'};return{status:200,json:url.includes('/dump/')?{system:data}:{record:data}};
 });
 const bridge=createBridge(h.sdk);await bridge.check(s,0,[0]);
 assert.equal(C.recordAt(s,0,0).catalogues.spansh.state,'absent');assert.equal(C.recordAt(s,0,0).id64,undefined);assert.equal(C.recordAt(s,0,0).journal.visited,false);assert.equal(C.metadata(s,0).records[14],undefined);
 await bridge.check(s,0,[3]);assert.equal(C.recordAt(s,0,3).catalogues.spansh.state,'present');assert.equal(h.calls.filter(c=>c.url.endsWith('/systems/search')).length,1);
});
test('fuzzy reference candidates require the same sector, matching mass/sequence and a system address',async()=>{
 const s=C.newSurvey({source:{type:'single'},...C.deriveAnchors(['Phroea Phio UK-W c18-0'],'c'),selected:0,levels:['c'],extraParents:[]});s.policy.providers=['spansh'];
 const h=host(()=>({status:200,json:{results:[
  {name:'Another Sector UK-W c18-14',id64:'3936371019682'},
  {name:'Phroea Phio UK-W c18-13',id64:'3936371019682'},
  {name:'Phroea Phio UK-W c18-14',id64:'3936371019683'},
  {name:'Phroea Phio UK-W c18-14',id64:'9007199254740993000'},
  {name:'Phroea Phio UK-W c18-14',id64:90071992547409930}
 ]}}));
 await createBridge(h.sdk).check(s,0,[0]);assert.equal(h.calls.length,1);assert.equal(C.recordAt(s,0,0).catalogues.spansh.state,'unknown');assert.equal(C.metadata(s,0).referenceId,undefined);
});
test('a search miss can be resolved after the first journal address arrives',async()=>{
 const s=make();s.policy.providers=['spansh'];const h=host(url=>url.endsWith('/systems/search')?{status:200,json:{results:[]}}:{status:404}),b=createBridge(h.sdk);
 await b.check(s,0,[0]);assert.equal(C.recordAt(s,0,0).catalogues.spansh.state,'unknown');
 C.applyJournal(s,{event:'FSDJump',StarSystem:'Pyurks OE-E d13-0',SystemAddress:'11014227923'});
 await b.check(s,0,[1]);assert.ok(h.calls.at(-1).url.endsWith('/system/45373966291'));assert.equal(C.recordAt(s,0,1).catalogues.spansh.state,'absent');assert.equal(C.metadata(s,0).end,null);
});
test('malformed successful Spansh search remains an error',async()=>{
 const s=make();s.policy.providers=['spansh'];await createBridge(host(()=>({status:200,json:{count:0}})).sdk).check(s,0,[0]);assert.equal(C.recordAt(s,0,0).catalogues.spansh.state,'error');
});
test('raw API ID64 is preserved past Number.MAX_SAFE_INTEGER',async()=>{
 const h=host(()=>({status:200,body:'{"id64":9007199254740993,"name":"Test"}'}));assert.equal((await createBridge(h.sdk).fetchJSON('https://spansh.co.uk/test','spansh')).id64,'9007199254740993');
});
test('history pagination replays all entries in order',async()=>{
 const h=host();h.sdk.journal.read=async o=>o.offset===0?{events:[{n:1}],info:{truncated:true,nextOffset:1}}:{events:[{n:2}],info:{truncated:false}};const seen=[];await createBridge(h.sdk).history(e=>seen.push(e.n));assert.deepEqual(seen,[1,2]);
});
test('catalogue rename by verified address is retained as an alias',async()=>{
 const h=host(()=>({status:200,json:{system:{name:'Authored Name',id64:'11014227923',bodyCount:1,bodies:[{name:'Authored Name',type:'Star',subType:'G'}]}}}));h.sdk.catalog={system:{get:async()=>({found:true,record:{name:'Authored Name',id64:'11014227923',body_count:1}})}};const s=make(),r=C.recordAt(s,0,0);r.id64='11014227923';const status=await createBridge(h.sdk).spansh(s,0,0);assert.equal(r.alias,'Authored Name');assert.equal(status.complete,true);
});

// Matches the injected SDK observed in JACoB on 2026-10-12: the outer
// template literal consumes the backslash in its digit regex, leaving /^d+$/.
function brokenSDKID64(value){
 if(typeof value==='number'){if(!Number.isSafeInteger(value)||value<0)throw Object.assign(Error('id64 Number is unsafe; pass the decimal ID64 as a string'),{code:'BAD_PARAMS'});return String(value);}
 const s=String(value??'').trim();if(!/^d+$/.test(s))throw Object.assign(Error('id64 must be an unsigned decimal integer string'),{code:'BAD_PARAMS'});return s;
}
function spanshFixture(){
 const s=make(),ids=['11014227923','45373966291'],names=ids.map((_,seq)=>C.systemName(s.anchor,seq));
 const h=host((url,options)=>{
  if(url.endsWith('/systems/search')){const name=options.body.filters.name.value;return{status:200,json:{results:[{name,id64:ids[names.indexOf(name)]}]}};}
  const id=url.split('/').at(-1),index=ids.indexOf(id);assert.notEqual(index,-1,'ID must remain an exact decimal string');
  const record={name:names[index],id64:id,body_count:1},system={name:names[index],bodyCount:1,bodies:[{name:names[index],type:'Star',subType:'G'}]};
  return{status:200,json:url.includes('/dump/')?{system}:{record}};
 });
 s.policy.providers=['spansh'];return{s,h,ids,names};
}

test('broken injected ID validator falls back to queued HTTP without rounding addresses',async()=>{
 const {s,h,ids}=spanshFixture(),helperCalls=[];
 h.sdk.catalog={system:{get:async spec=>{helperCalls.push(spec.id64);brokenSDKID64(spec.id64);throw Error('Validator unexpectedly accepted the ID');}}};
 h.sdk.galaxy={addressForSequence:async()=>{throw Error('Known-broken shared validator should not be retried');}};
 const b=createBridge(h.sdk);await b.check(s,0,[0,1]);
 assert.deepEqual(helperCalls,[ids[0]]);
 for(const seq of [0,1]){assert.equal(C.recordAt(s,0,seq).catalogues.spansh.state,'present');assert.equal(C.recordAt(s,0,seq).catalogues.spansh.complete,true);assert.equal(C.recordAt(s,0,seq).id64,ids[seq]);}
 assert.equal(h.calls.filter(x=>x.url.endsWith('/systems/search')).length,1,'later sequence uses the known address without another name search');
});

test('a saved reference ID rejected by the galaxy helper recovers through exact local address bits',async()=>{
 const {s,h,ids}=spanshFixture();C.metadata(s,0).referenceId=ids[0];let called=0;
 h.sdk.galaxy={addressForSequence:async id=>{called++;return brokenSDKID64(id);}};
 h.sdk.catalog={system:{get:async()=>{throw Error('Shared validator is known broken');}}};
 await createBridge(h.sdk).check(s,0,[1]);assert.equal(called,1);
 assert.equal(C.recordAt(s,0,1).catalogues.spansh.state,'present');assert.equal(C.recordAt(s,0,1).id64,ids[1]);
});

test('working galaxy/catalog helpers retain decimal strings and use their normal path',async()=>{
 const {s,h,ids,names}=spanshFixture();C.metadata(s,0).referenceId=ids[0];const calls=[];
 h.sdk.galaxy={addressForSequence:async(id,seq)=>{calls.push([id,seq]);return ids[seq];}};
 h.sdk.catalog={system:{get:async spec=>{assert.equal(spec.id64,ids[1]);return{found:true,record:{name:names[1],body_count:1}};}}};
 await createBridge(h.sdk).check(s,0,[1]);assert.equal(C.recordAt(s,0,1).catalogues.spansh.complete,true);
 assert.deepEqual(calls,[[ids[0],1]]);assert.equal(h.calls.length,1);assert.match(h.calls[0].url,/\/dump\//);
});

test('permission errors never invoke a fallback or become catalogue absence',async()=>{
 const {s,h,ids}=spanshFixture();C.recordAt(s,0,0).id64=ids[0];
 h.sdk.catalog={system:{get:async()=>{throw Object.assign(Error('Network permission denied'),{code:'PERMISSION_DENIED'});}}};
 await createBridge(h.sdk).check(s,0,[0]);assert.equal(C.recordAt(s,0,0).catalogues.spansh.state,'error');assert.equal(h.calls.length,0);
});

test('HTTP failure after validator fallback remains an error and can be retried',async()=>{
 const {s,h,ids}=spanshFixture();C.recordAt(s,0,0).id64=ids[0];
 h.sdk.catalog={system:{get:async spec=>brokenSDKID64(spec.id64)}};
 const fetch=h.sdk.net.fetchQueued;let fail=true;h.sdk.net.fetchQueued=async(...args)=>fail?{status:503,json:{}}:fetch(...args);
 const b=createBridge(h.sdk);await b.check(s,0,[0]);assert.equal(C.recordAt(s,0,0).catalogues.spansh.state,'error');assert.match(C.recordAt(s,0,0).catalogues.spansh.error,/503/);
 fail=false;await b.check(s,0,[0]);assert.equal(C.recordAt(s,0,0).catalogues.spansh.state,'present');
});

test('overlay handles a journal location outside the survey without indexing it',async()=>{
 const s=make(),h=host();C.applyJournal(s,{event:'Location',StarSystem:'Sol'});let scene;
 h.sdk.overlay={set:async value=>{scene=value;}};await createBridge(h.sdk).overlay(s,true);
 assert.equal(scene.items.length,1);assert.equal(scene.items[0].type,'text');assert.match(scene.items[0].text,/Total survey: 0 handled; end unknown \| Current boxel survey:/);assert.match(scene.items[0].text,/\| Here: Sol \(outside survey\)$/);assert.equal(Object.keys(C.metadata(s,0).records).length,0);
});
test('stale browser window cannot overwrite a newer persisted workspace',async()=>{
 const h=host(),one=createBridge(h.sdk),two=createBridge(h.sdk);await one.load();await two.load();await one.save({schema:1,surveys:[],activeId:null});await assert.rejects(two.save({schema:1,surveys:[],activeId:null}),/another window/);
});
test('journal checkpoints include sessions created while the extension was closed',async()=>{
 const h=host();h.sdk.journal.files=async()=>({files:[{file:'Journal.1.log'},{file:'Journal.2.log'},{file:'Journal.3.log'}]});const calls=[];h.sdk.journal.read=async o=>{calls.push(o);return{events:[{file:o.file}],info:{truncated:false}};};const cursors={'Journal.1.log':10};await createBridge(h.sdk).history(()=>{},false,cursors);assert.deepEqual(calls.map(x=>[x.file,x.offset]),[['Journal.1.log',10],['Journal.2.log',0],['Journal.3.log',0]]);assert.equal(cursors['Journal.3.log'],1);
});
test('helper copies use saved-tab storage and require the matching acknowledgment',async()=>{
 const h=host(),config={format:'survey-clipboard-helper',transport:'jacob-store-v1',token:'a'.repeat(64)};h.corrupt('survey.clipboardHelper',config);const b=createBridge(h.sdk);await b.load();let reads=0;
 h.sdk.data.get=async name=>{assert.equal(name,'SurveyClipboardStatus.json');reads++;return{found:true,data:{requestId:reads===1?'old-request':h.data()['survey.clipboardRequest'].id,ok:true}};};
 assert.equal(await b.copy('Pyurks LY-F d12-7'),'helper');assert.equal(reads,2);assert.equal(h.data()['survey.clipboardRequest'].text,'Pyurks LY-F d12-7');assert.equal(h.calls.length,0);
});
test('helper pairing failure is visible and does not persist a false connection',async()=>{
 const h=host(),b=createBridge(h.sdk);h.sdk.data.get=async()=>({found:true,data:{requestId:h.data()['survey.clipboardRequest'].id,ok:false,error:'Clipboard unavailable'}});
 await assert.rejects(b.configureClipboard({format:'survey-clipboard-helper',transport:'jacob-store-v1',token:'a'.repeat(64)}),/Clipboard unavailable/);assert.equal(b.hasClipboardHelper(),false);assert.equal(h.data()['survey.clipboardHelper'],undefined);
});

test('rapid saves respect the real host mutation gap and release the save lock',async()=>{
 const h=createStoreHost(),b=createBridge({store:h.store});await b.load();
 const apps=[1,2,3].map(n=>({schema:1,surveys:[],activeId:null,options:{n}}));
 await Promise.all(apps.map(app=>b.save(app)));
 assert.equal(h.limited.length,0);assert.equal(h.data()['survey.writeLease'],null);
 assert.equal(h.data()['survey.manifest'].revision,3);assert.deepEqual(await createBridge({store:h.store}).load(),apps[2]);
 assert.equal(h.calls.filter(x=>x.method==='cas').length,3,'successful saves unlock in the same batch');
});

test('a failed commit releases its lease and preserves the last saved snapshot',async()=>{
 const h=createStoreHost(),b=createBridge({store:h.store}),app={schema:1,surveys:[],activeId:null};
 await b.load();await b.save(app);h.failNext('batch',Error('Disk full'));
 await assert.rejects(b.save({...app,options:{changed:true}}),/Disk full/);
 assert.equal(h.data()['survey.writeLease'],null);assert.deepEqual(await createBridge({store:h.store}).load(),app);
 await b.save({...app,options:{changed:true}});assert.equal(h.limited.length,0);
});

test('host rate rejection is retried without a misleading other-window error',async()=>{
 const h=createStoreHost(),b=createBridge({store:h.store});h.failNext('cas',Object.assign(Error('custom-tab request rate exceeded'),{code:'RATE_LIMITED'}));
 await b.save({schema:1,surveys:[],activeId:null});assert.equal(h.data()['survey.writeLease'],null);assert.equal(h.data()['survey.manifest'].revision,1);
});

test('real concurrent ownership is preserved and stale views still cannot overwrite',async()=>{
 const h=createStoreHost(),one=createBridge({store:h.store}),two=createBridge({store:h.store});await one.load();await two.load();
 await one.save({schema:1,surveys:[],activeId:null});await assert.rejects(two.save({schema:1,surveys:[],activeId:null}),/changed in another window/);assert.equal(h.data()['survey.writeLease'],null);
 const lease={owner:'another-view',until:Date.now()+30000},locked=createStoreHost({'survey.writeLease':lease});
 await assert.rejects(createBridge({store:locked.store}).save({schema:1,surveys:[]}),/Another window/);assert.deepEqual(locked.data()['survey.writeLease'],lease);assert.equal(locked.data()['survey.manifest'],undefined);
});

test('expired locks from the old extension do not prevent saving',async()=>{
 const h=createStoreHost({'survey.writeLease':{owner:'old-view',until:Date.now()-1}});
 await createBridge({store:h.store}).save({schema:1,surveys:[]});assert.equal(h.data()['survey.writeLease'],null);
});

test('reset backs up saved data, atomically defaults only survey keys, and rejects stale writers',async()=>{
 const {importBackup}=require('./bridge.js'),h=createStoreHost({unrelated:'keep'}),b=createBridge({store:h.store}),s=make(),app={schema:1,surveys:[s],activeId:s.id};
 C.setBound(s,0,9);await b.save(app);const stale=createBridge({store:h.store});await stale.load();const before=h.data();let backup;
 const empty={schema:1,surveys:[],activeId:null,options:{autoCopy:true,autoPlot:false,overlay:false}};
 await b.reset(empty,async storage=>{assert.deepEqual(h.data()['survey.chunk.0'],before['survey.chunk.0'],'backup occurs before replacement');backup={format:'systematic-survey-reset-backup',workspace:null,storage};});
 assert.deepEqual(await importBackup(backup),app);assert.deepEqual(await createBridge({store:h.store}).load(),empty);
 assert.equal(h.data().unrelated,'keep');assert.equal(h.data()['survey.writeLease'],null);assert.ok(h.data()['survey.manifest'].revision>before['survey.manifest'].revision);
 await assert.rejects(stale.save(app),/changed in another window/);assert.equal(h.limited.length,0);
});

test('failed backup or reset commit keeps the last saved survey intact',async()=>{
 const h=createStoreHost(),b=createBridge({store:h.store}),s=make(),app={schema:1,surveys:[s],activeId:s.id},empty={schema:1,surveys:[],activeId:null};await b.save(app);
 await assert.rejects(b.reset(empty,async()=>{throw Error('Backup failed');}),/Backup failed/);
 assert.deepEqual(await createBridge({store:h.store}).load(),app);assert.equal(h.data()['survey.writeLease'],null);
 h.failNext('batch',Error('Disk full'));await assert.rejects(b.reset(empty,async()=>{}),/Disk full/);
 assert.deepEqual(await createBridge({store:h.store}).load(),app);assert.equal(h.data()['survey.writeLease'],null);
});

test('reset can recover from corrupted storage while backing up the original raw chunks',async()=>{
 const h=createStoreHost({'survey.manifest':{schema:1,chunks:1,encoding:'gzip-base64',revision:5},'survey.chunk.0':'damaged','survey.chunk.9':'orphaned',unrelated:'keep'}),b=createBridge({store:h.store});
 await assert.rejects(b.load());let backup;await b.reset({schema:1,surveys:[],activeId:null},async raw=>{backup=raw;});
 assert.equal(backup.chunks[0],'damaged');assert.equal(backup.chunks[9],'orphaned');assert.equal(h.data()['survey.chunk.9'],undefined);
 assert.deepEqual(await b.load(),{schema:1,surveys:[],activeId:null});assert.equal(h.data().unrelated,'keep');
});

test('EDSM finishes before a Spansh outage; batch pauses after its first timeout',async()=>{
 const h=host(url=>{if(url.includes('edsm.net'))return {status:200,json:[]};throw Object.assign(Error('request timed out'),{code:'TIMEOUT'});}),s=make();
 s.policy.providers=['edsm','spansh'];C.metadata(s,0).referenceId='354611611603';
 await assert.rejects(createBridge(h.sdk).check(s,0,[0,1,2]),/Batch paused/);
 assert.ok(h.calls[0].url.includes('edsm.net'));
 assert.equal(h.calls.length,2);assert.equal(h.calls[1].options.retry,0);
 for(const seq of [0,1,2])assert.equal(C.recordAt(s,0,seq).catalogues.edsm.state,'absent');
 assert.equal(C.recordAt(s,0,0).catalogues.spansh.state,'error');
 assert.equal(C.recordAt(s,0,1).catalogues.spansh,undefined);
});

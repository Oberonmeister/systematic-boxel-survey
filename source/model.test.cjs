const test=require('node:test'),assert=require('node:assert/strict'),C=require('./model.js');
test('automatic boxel iteration requires an enabled option, a defined end and arrival in the active boxel',()=>{
 const make=()=>C.newSurvey({source:{},...C.deriveAnchors(['Pyurks OE-E d13-0'],'d'),selected:0,levels:['d','c'],extraParents:[]});
 const s=make();C.setBound(s,0,0);assert.equal(C.advanceOnArrival(s,{i:0,seq:0}),false);assert.equal(s.activeBox,0);
 assert.equal(C.advanceOnArrival(s,{i:1,seq:0},true),false);s.excluded=[1];assert.equal(C.advanceOnArrival(s,{i:0,seq:0},true),true);assert.equal(s.activeBox,2);assert.equal(C.surveyStats(s).handled,0);
 assert.equal(C.advanceOnArrival(s,{i:0,seq:0},true),false,'duplicate old arrival cannot advance again');
 assert.equal(C.advanceOnArrival(s,{i:2,seq:0},true),true);assert.equal(s.activeBox,2,'unknown end advances only the sequence');assert.equal(C.metadata(s,2).cursor,1);
 s.activeBox=8;C.setBound(s,8,0);assert.equal(C.advanceOnArrival(s,{i:8,seq:0},true),false);assert.equal(s.activeBox,8,'last boxel never wraps');
});
test('post-iteration scan evidence belongs to the visited system, with unfinished earlier systems outstanding',()=>{
 const s=C.newSurvey({source:{},...C.deriveAnchors(['Pyurks OE-E d13-0'],'d'),selected:0,levels:['d','c'],extraParents:[]});C.setBound(s,0,1);
 const event={StarSystem:'Pyurks OE-E d13-1',event:'FSDJump'},at=C.applyJournal(s,event);assert.equal(C.advanceOnArrival(s,at,true),true);assert.equal(s.activeBox,1);
 assert.equal(C.recordAt(s,0,1).journal.fss,false);assert.equal(C.outcome(C.recordAt(s,0,0),s.policy).handled,false);
 C.applyJournal(s,{...event,event:'Scan',BodyID:0,BodyName:event.StarSystem,StarType:'G'});C.applyJournal(s,{...event,event:'FSSAllBodiesFound',Count:1});
 assert.equal(C.localStatus(C.recordAt(s,0,1)).complete,true);assert.equal(C.localStatus(C.recordAt(s,1,0)).complete,false);assert.equal(s.liveSystem.i,0);
});
const make=(levels=['d','c'])=>C.newSurvey({source:{type:'single',snapshot:['Pyurks OE-E d13-0']},...C.deriveAnchors(['Pyurks OE-E d13-0'],'d'),selected:0,levels,extraParents:[]});
const full={name:'Test',bodyCount:2,bodies:[{name:'Test',type:'Star',subType:'G (White-Yellow) Star',rings:[]},{name:'Test 1',type:'Planet',subType:'Rocky body'}]};
test('ordinary procedural labels follow the expected eight octant code offsets (no naming overrides)',()=>{
 const s=make();assert.equal(C.scopeCount(s),9);assert.deepEqual(Array.from({length:8},(_,i)=>C.boxAt(s,i+1).prefix),['Pyurks CJ-I c26','Pyurks DJ-I c26','Pyurks AO-I c26','Pyurks BO-I c26','Pyurks GP-G c27','Pyurks HP-G c27','Pyurks EU-G c27','Pyurks FU-G c27']);
});
test('sequential formatting handles zero N1 without a fictitious hyphen',()=>{
 const p=C.parseName('Synuefe AA-A h0');assert.equal(p.seq,0);assert.equal(C.systemName(p,17),'Synuefe AA-A h17');assert.equal(C.parseName('Pyurks OE-E d13-47').seq,47);
});
test('name parser rejects invalid coordinates, mass codes and unsafe suffixes',()=>{
 for(const name of ['Sol','Pyurks ZZ-Z h1','Pyurks OE-E x13-1','Pyurks OE-E d13-99999999999999999999'])assert.equal(C.parseName(name),null);
});
test('anchors preserve first occurrence and retain traversal metadata',()=>{
 const a=C.parseName('Pyurks OE-E d13-0'),b=C.boxFromXYZ('Pyurks','d',[a.xyz[0]-1,...a.xyz.slice(1)]),c=C.boxFromXYZ('Pyurks','d',[a.xyz[0]-2,...a.xyz.slice(1)]);
 const names=[C.systemName(a,0),C.systemName(a,1),C.systemName(b,0),C.systemName(c,0),C.systemName(b,1)];const d=C.deriveAnchors(names,'d');assert.deepEqual(d.anchors.map(x=>x.key),[a.key,b.key,c.key]);assert.equal(d.anchors[1].lastIndex,4);assert.equal(d.anchors[1].count,2);
});
test('higher-mass single input warns; list ignores it even if coordinates are supplied',()=>{
 assert.throws(()=>C.deriveAnchors(['Pyurks AA-A h0'],'d',true),/Choose a procedural/);
 const d=C.deriveAnchors([{name:'Pyurks AA-A h0',pos:[0,0,0]},'Sol','Pyurks OE-E d13-0'],'d');assert.equal(d.anchors.length,1);assert.equal(d.ignored.length,2);
});
test('highway separators and adjacent names normalize without sorting',()=>{
 assert.deepEqual(C.inputNames('Pyurks OE-E d13-1 → Pyurks OE-E d13-0; Sol'),['Pyurks OE-E d13-1','Pyurks OE-E d13-0','Sol']);
 assert.deepEqual(C.inputNames('Pyurks OE-E d13-1 Pyurks OE-E d13-0'),['Pyurks OE-E d13-1','Pyurks OE-E d13-0']);
});
test('every generated child round-trips to its anchor and scope index',()=>{
 const s=make(['d','c','b','a']);for(let i=0;i<C.scopeCount(s);i++){const b=C.boxAt(s,i),p=C.parseName(C.systemName(b,0));assert.equal(p.key,b.key);assert.equal(C.ancestor(p,'d').key,s.anchor.key);assert.equal(C.boxIndex(s,p),i);}
});
test('generic anchors and deep hierarchy remain lazy',()=>{
 const s=C.newSurvey({source:{},...C.deriveAnchors(['Pyurks AA-A h0'],'h'),selected:0,levels:C.MASSES.split(''),extraParents:[]});assert.equal(C.scopeCount(s),2396745);assert.equal(Object.keys(s.boxes).length,0);assert.equal(C.boxAt(s,2396744).mass,'a');
});
test('parent adds exactly its own sequence, never descendants',()=>{
 const s=make();s.extraParents=[C.ancestor(s.anchor,'e')];assert.equal(C.scopeCount(s),10);assert.equal(C.boxAt(s,9).mass,'e');assert.equal(C.boxIndex(s,C.boxAt(s,9)),9);
});
test('bounds accept zero, final name and optional empty, reject cross-boxel input',()=>{
 const s=make();C.setBound(s,0,'0');assert.equal(C.boxStats(s,0).total,1);C.setBound(s,0,'Pyurks OE-E d13-47');assert.equal(C.boxStats(s,0).total,48);C.setBound(s,0,'');assert.equal(C.boxStats(s,0).total,null);assert.throws(()=>C.setBound(s,0,'Pyurks CJ-I c26-10'));assert.throws(()=>C.setBound(s,0,'-1'));
});
test('cannot shrink a bound below positive existence evidence',()=>{const s=make();C.recordAt(s,0,17).journal.visited=true;assert.throws(()=>C.setBound(s,0,16),/evidence/);});
test('absence, timeouts and cursor movements cannot create a denominator',()=>{
 const s=make(),r=C.recordAt(s,0,0);r.catalogues={edsm:{state:'absent'},spansh:{state:'error'}};C.move(s,1);assert.equal(C.boxStats(s,0).total,null);assert.equal(C.surveyStats(s).percent,null);assert.equal(C.boxStats(s,0).handled,0);
});
test('mixed bounds never show overall completion percentage',()=>{const s=make();C.setBound(s,0,3);assert.equal(C.boxStats(s,0).total,4);assert.equal(C.surveyStats(s).total,null);});
test('catalogue-only sparse body arrays cannot manufacture completeness',()=>{
 assert.equal(C.catalogueStatus({...full,bodyCount:undefined}).complete,false);assert.equal(C.catalogueStatus({...full,bodyCount:3}).complete,false);assert.equal(C.catalogueStatus(full).complete,true);
});
test('absent from ANY enabled catalogue requires attention',()=>{
 const s=make(),r=C.recordAt(s,0,0),complete=C.catalogueStatus(full);r.catalogues={edsm:complete,spansh:{state:'absent'}};assert.equal(C.outcome(r,s.policy).handled,false);r.catalogues.spansh=complete;assert.equal(C.outcome(r,s.policy).handled,true);
});
test('conflicting expected totals and stale or undated data require attention',()=>{
 const s=make(),r=C.recordAt(s,0,0),complete=C.catalogueStatus(full);r.catalogues={edsm:complete,spansh:{...complete,expected:3}};assert.match(C.outcome(r,s.policy).reason,/disagree/);r.catalogues.spansh=complete;s.policy.staleDays=10;assert.equal(C.outcome(r,s.policy).handled,false);
});
test('manual arrows bypass targets without counting them',()=>{
 const s=make();C.setBound(s,0,3);C.recordAt(s,0,0);assert.equal(C.move(s,1),true);assert.equal(s.boxes[0].cursor,1);assert.equal(C.boxStats(s,0).handled,0);assert.equal(C.move(s,-1),true);assert.equal(s.boxes[0].cursor,0);
});
test('Iterate Boxel goes D to first C, respects exclusions, retains outstanding D',()=>{
 const s=make();C.recordAt(s,0,0);s.excluded=[1];assert.equal(C.iterateBoxel(s),true);assert.equal(s.activeBox,2);assert.equal(C.boxStats(s,0).complete,false);
});
test('scope rejects unselected classes and unrelated journal systems',()=>{
 const s=make(),a=C.descendant(s.anchor,'a',0);assert.equal(C.applyJournal(s,{event:'FSDJump',StarSystem:C.systemName(a,0)}),null);assert.equal(C.applyJournal(s,{event:'FSDJump',StarSystem:'Sol'}),null);assert.deepEqual(s.boxes,{});
});

test('outside-scope journal pointers are normal lookup misses, never boxel errors',()=>{
 const s=make();C.applyJournal(s,{event:'Location',StarSystem:'Sol'});
 assert.equal(s.liveSystem.outside,true);
 assert.equal(C.recordAt(s,s.liveSystem.i,s.liveSystem.seq,false),null);
 assert.equal(C.recordAt(s,s.liveSystem.i,s.liveSystem.seq),null);
 assert.deepEqual(s.boxes,{});
 C.applyJournal(s,{event:'FSDJump',StarSystem:'Pyurks OE-E d13-0'});
 assert.equal(C.recordAt(s,s.liveSystem.i,s.liveSystem.seq,false).journal.visited,true);
});
function journalFixture(s,{belt=true}={}){
 const common={StarSystem:'Pyurks OE-E d13-0',SystemAddress:'9007199254740993'};
 const events=[{event:'FSDJump'}, {event:'FSSDiscoveryScan',BodyCount:2},{event:'Scan',BodyID:0,BodyName:common.StarSystem,StarType:'G',ScanType:'AutoScan',Rings:belt?[{Name:common.StarSystem+' A Belt'}]:[]},{event:'Scan',BodyID:1,BodyName:common.StarSystem+' 1',PlanetClass:'Rocky body',ScanType:'Detailed'},{event:'FSSAllBodiesFound',Count:2}];
 for(const e of events)C.applyJournal(s,{...common,...e});return common;
}
test('FSS complete does not conceal unresolved belts; duplicate scans are idempotent',()=>{
 const s=make(),common=journalFixture(s),r=C.recordAt(s,0,0);assert.equal(C.localStatus(r).complete,false);assert.equal(C.localStatus(r).majorComplete,true);
 const belt={...common,event:'Scan',BodyID:3,BodyName:common.StarSystem+' A Belt Cluster 1',ScanType:'AutoScan'};C.applyJournal(s,belt);C.applyJournal(s,belt);assert.equal(C.localStatus(r).complete,true);assert.equal(Object.keys(r.journal.bodies).length,3);assert.equal(r.journal.resolvedBelts.length,1);
});
test('FSS marker without body inventory leaves belt completeness uncertain',()=>{
 const s=make();C.applyJournal(s,{event:'FSSAllBodiesFound',SystemName:'Pyurks OE-E d13-0',Count:2});const r=C.recordAt(s,0,0);assert.equal(C.localStatus(r).complete,false);assert.equal(C.localStatus(r).beltsKnown,false);r.journal.beltsConfirmed='manual';assert.equal(C.localStatus(r).complete,true);
});
test('fully scanned system with no belts completes; current-session upload lag cannot undo it',()=>{
 const s=make();journalFixture(s,{belt:false});const r=C.recordAt(s,0,0);r.catalogues={edsm:{state:'absent'},spansh:{state:'absent'}};assert.equal(C.outcome(r,s.policy).handled,true);
});
test('journal updates visited system after target has advanced',()=>{
 const s=make();journalFixture(s);C.move(s,1);C.applyJournal(s,{event:'Scan',StarSystem:'Pyurks OE-E d13-0',BodyID:3,BodyName:'Pyurks OE-E d13-0 A Belt Cluster 1'});assert.equal(C.localStatus(C.recordAt(s,0,0)).complete,true);assert.equal(s.boxes[0].cursor,1);
});
test('large IDs remain strings; unsafe numeric IDs are never guessed',()=>{assert.equal(C.safeId('9007199254740993'),'9007199254740993');assert.equal(C.safeId(9007199254740993),'');});
test('snapshot and full persistence round-trip preserve ranges, exclusions, cursor and evidence',()=>{
 const s=make();journalFixture(s);C.setBound(s,0,47);s.excluded=[8];C.move(s,1);const a={schema:1,surveys:[s],activeId:s.id};const restored=C.validateApp(JSON.parse(JSON.stringify(a)));assert.deepEqual(restored,a);a.surveys[0].source.snapshot.push('Sol');assert.notDeepEqual(restored,a);
});
test('bounded denominator counts inclusive suffix zero and excluded boxels correctly',()=>{
 const s=make();s.excluded=[1,2,3,4,5,6,7,8];C.setBound(s,0,0);journalFixture(s,{belt:false});assert.equal(C.surveyStats(s).percent,100);assert.equal(C.surveyStats(s).total,1);
});
test('malformed backups are rejected before restoration',()=>{assert.throws(()=>C.validateApp({schema:2,surveys:[]}));const s=make();s.boxes[0]={end:1,cursor:0,records:{2:{seq:2,catalogues:{},journal:{}}}};assert.throws(()=>C.validateApp({schema:1,surveys:[s]}));});
test('catalogue belts arrays are included and barycentres are never counted as stars',()=>{
 const status=C.catalogueStatus({bodyCount:1,bodies:[{name:'Sol',type:'Star',subType:'G',belts:[{name:'Asteroid Belt'}]},{name:'Sol Barycentre',type:'Star',subType:'Barycentre'}]});assert.equal(status.scanned,1);assert.equal(status.belts,1);assert.equal(status.complete,false);assert.match(status.quality,/belts unverified/);
});
test('duplicate catalogue bodies cannot fill missing scans',()=>{const star={name:'Test',type:'Star',subType:'G'};assert.equal(C.catalogueStatus({bodyCount:2,bodies:[star,star]}).complete,false);});
test('historical complete scans survive revisits and incomplete catalogue uploads',()=>{
 const s=make();s.created='2026-10-11T10:00:00Z';const common={StarSystem:'Pyurks OE-E d13-0',timestamp:'2025-01-01T00:00:00Z'};
 C.applyJournal(s,{...common,event:'Scan',BodyName:common.StarSystem,BodyID:0,StarType:'G'});C.applyJournal(s,{...common,event:'FSSAllBodiesFound',Count:1});const r=C.recordAt(s,0,0);assert.equal(C.localStatus(r).complete,true);r.catalogues={edsm:{state:'absent'},spansh:{state:'absent'}};assert.equal(C.outcome(r,s.policy).handled,true);
 C.applyJournal(s,{...common,timestamp:'2026-10-11T11:00:00Z',event:'FSDJump'});assert.equal(C.localStatus(r).complete,true);assert.equal(Object.keys(r.journal.bodies).length,1);assert.match(C.personalStatus(r),/Previously visited/);
});
test('older replay enriches a current honk without moving live location backwards',()=>{
 const s=make();s.created='2026-10-11T10:00:00Z';
 C.applyJournal(s,{event:'Location',StarSystem:'Sol',timestamp:'2026-10-12T10:00:00Z'});
 C.applyJournal(s,{event:'FSSDiscoveryScan',SystemName:'Pyurks OE-E d13-0',BodyCount:1,timestamp:'2026-10-11T12:00:00Z'});
 C.applyJournal(s,{event:'Location',StarSystem:'Pyurks OE-E d13-0',timestamp:'2025-10-01T10:00:00Z'});
 C.applyJournal(s,{event:'Scan',StarSystem:'Pyurks OE-E d13-0',BodyName:'Pyurks OE-E d13-0',BodyID:0,StarType:'G',timestamp:'2025-10-01T10:00:00Z'});
 const r=C.recordAt(s,0,0);assert.equal(C.localStatus(r).complete,true);assert.equal(s.liveSystem.name,'Sol');assert.equal(r.journal.lastVisit,'2026-10-11T12:00:00Z');assert.equal(r.journal.visitedBeforeSurvey,true);
});
test('ignore visited is explicit and reversible; it never invents full-scan evidence',()=>{
 const s=make(),r=C.recordAt(s,0,0);r.journal.visited=true;r.journal.honked=true;r.catalogues={edsm:{state:'absent'}};
 assert.equal(C.outcome(r,s.policy).handled,false);s.policy.ignoreVisited=true;
 assert.equal(C.outcome(r,s.policy).kind,'visited');assert.equal(C.boxStats(s,0).handled,1);assert.equal(C.localStatus(r).complete,false);
 s.policy.ignoreVisited=false;assert.equal(C.boxStats(s,0).handled,0);assert.match(C.personalStatus(r),/Visited.*Honked/);
});
test('manual full scan works on a honked system, persists and undoes without altering scans',()=>{
 const s=make(),r=C.recordAt(s,0,0);r.journal.visited=true;r.journal.honked=true;
 C.confirmFullScan(r,true,'2026-10-12T11:00:00Z');const app=C.validateApp(C.clone({schema:1,surveys:[s],activeId:s.id}));
 const restored=C.recordAt(app.surveys[0],0,0);assert.equal(C.outcome(restored,s.policy).handled,true);assert.equal(restored.journal.fss,false);assert.deepEqual(restored.journal.bodies,{});
 C.applyJournal(app.surveys[0],{event:'FSDJump',StarSystem:'Pyurks OE-E d13-0'});assert.equal(C.localStatus(restored).manual,true);
 C.confirmFullScan(restored,false);assert.equal(C.outcome(restored,s.policy).handled,false);assert.equal(C.localStatus(restored).label,'Honked');
});
test('a later user bound overrides speculative probes without losing their audit evidence',()=>{
 const s=make(),r=C.recordAt(s,0,25);r.catalogues={edsm:{state:'absent'},spansh:{state:'error'}};C.metadata(s,0).cursor=25;C.setBound(s,0,4);assert.equal(C.boxStats(s,0).total,5);assert.equal(C.boxStats(s,0).processed,0);assert.equal(s.boxes[0].cursor,4);assert.ok(s.boxes[0].probesBeyondBound[25]);C.setBound(s,0,'');assert.ok(s.boxes[0].records[25]);assert.equal(C.boxStats(s,0).total,null);
});

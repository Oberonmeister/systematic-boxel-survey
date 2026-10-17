const test=require('node:test'),assert=require('node:assert/strict'),C=require('./model.js'),{createBridge,importBackup}=require('./bridge.js');
const names=['Pyurks OE-E d13-0','Pyurks LY-F d12-0','Pyurks OE-E d13-4'];
const draft=(type='list')=>({source:{type,text:names.join('\n'),snapshot:[...names]},anchorMass:'d',...C.deriveAnchors(names,'d'),selected:0,levels:['d','c'],extraParents:[]});
const workspace=()=>({schema:1,surveys:[],activeId:null});

test('saved anchor lists preserve source, counts and first-crossing order without draft aliases',()=>{
 const app=workspace(),d=draft(),list=C.saveAnchorList(app,d,'Highway');
 assert.deepEqual(list.anchors.map(b=>b.prefix),['Pyurks OE-E d13','Pyurks LY-F d12']);
 assert.equal(list.anchors[0].count,2);d.source.snapshot.reverse();d.anchors.reverse();
 assert.deepEqual(list.source.snapshot,names);assert.equal(list.anchors[0].prefix,'Pyurks OE-E d13');
});
test('recalculating the same source reuses its named list, while changed order creates a separate list',()=>{
 const app=workspace(),first=C.saveAnchorList(app,draft(),'My route');
 assert.equal(C.saveAnchorList(app,draft()).id,first.id);assert.equal(app.anchorLists.length,1);assert.equal(first.name,'My route');
 const d=draft();d.source.snapshot.reverse();d.anchors.reverse();
 assert.notEqual(C.saveAnchorList(app,d).id,first.id);assert.equal(app.anchorLists.length,2);
});
test('route capture metadata does not create duplicates but distinct source sequences stay independent',()=>{
 const app=workspace(),d=draft('route');d.source.snapshot=names.map(name=>({name,pos:[1,2,3]}));
 const first=C.saveAnchorList(app,d);d.source.captured='later';d.source.snapshot[0].pos=[4,5,6];
 assert.equal(C.saveAnchorList(app,d).id,first.id);
 d.source.snapshot.pop();assert.notEqual(C.saveAnchorList(app,d).id,first.id);
});
test('reopening another anchor builds a fresh survey while retaining the list and existing progress',()=>{
 const app=workspace(),list=C.saveAnchorList(app,draft());const d=C.draftFromAnchorList(list);
 const first=C.newSurvey(d);C.setBound(first,0,4);C.recordAt(first,0,2).journal.visited=true;app.surveys.push(first);
 const next=C.draftFromAnchorList(list);next.selected=1;const second=C.newSurvey(next);app.surveys.push(second);
 assert.equal(second.anchor.prefix,'Pyurks LY-F d12');assert.equal(second.anchorListId,list.id);assert.deepEqual(second.boxes,{});
 assert.equal(first.boxes[0].end,4);assert.equal(first.boxes[0].records[2].journal.visited,true);
 next.source.snapshot.length=0;next.anchors.length=0;assert.equal(list.anchors.length,2);assert.equal(list.source.snapshot.length,3);
});
test('legacy survey snapshots migrate once, deduplicate and leave user progress untouched',()=>{
 const app=workspace(),d=draft();const a=C.newSurvey(d);d.selected=1;const b=C.newSurvey(d);C.recordAt(a,0,0).journal.visited=true;
 app.surveys=[a,b];const before=C.clone(a.boxes);
 assert.equal(C.restoreAnchorLists(app),true);assert.equal(app.anchorLists.length,1);assert.equal(a.anchorListId,b.anchorListId);assert.deepEqual(a.boxes,before);
 assert.equal(C.restoreAnchorLists(app),false);
 app.anchorLists=[];delete a.anchorListId;delete b.anchorListId;C.restoreAnchorLists(app);assert.equal(app.anchorLists.length,0,'removed lists stay removed');
});
test('old single-system surveys do not clutter the saved list library',()=>{
 const app=workspace();const d={...draft('single'),...C.deriveAnchors([names[0]],'d')};app.surveys=[C.newSurvey(d)];
 C.restoreAnchorLists(app);assert.equal(app.anchorLists.length,0);
 const one=C.saveAnchorList(app,d);assert.equal(one.anchors.length,1,'single anchors may still be saved explicitly');
});
test('list-only backups and host persistence retain anchors without any surveys',async()=>{
 const app=workspace();C.saveAnchorList(app,draft(),'Saved before starting');C.restoreAnchorLists(app);
 let storage={};const sdk={store:{get:async(k,f)=>storage[k]??f,batch:async ops=>{for(const o of ops)o.op==='set'?storage[o.key]=o.value:delete storage[o.key];}}};
 await createBridge(sdk).save(app);const reloaded=await createBridge(sdk).load();assert.deepEqual(reloaded,app);
 assert.deepEqual(await importBackup(JSON.parse(JSON.stringify(app))),app);
});
test('malformed anchor-list backups are rejected before use',()=>{
 const original=workspace();C.saveAnchorList(original,draft());
 for(const mutate of [
  a=>a.anchorLists={},a=>a.anchorLists.push(C.clone(a.anchorLists[0])),
  a=>a.anchorLists[0].anchors[0].xyz[0]++,a=>a.anchorLists[0].anchors.push(a.anchorLists[0].anchors[0]),
  a=>a.anchorLists[0].source.snapshot={},a=>a.anchorLists[0].anchorMass='z',a=>a.anchorLists[0].name='',
 ]){const app=C.clone(original);mutate(app);assert.throws(()=>C.validateApp(app),/anchor/i);}
 assert.equal(C.validateApp(workspace()).schema,1,'older backups remain supported');
});

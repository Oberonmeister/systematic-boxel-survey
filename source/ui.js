(async function(){
'use strict';
const C=SurveyCore,$=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hasHost=typeof Elite!=='undefined',supported=hasHost&&!!Elite.store?.batch&&!!Elite.net?.fetchQueued;
const defaults=()=>({schema:1,surveys:[],anchorLists:[],anchorListsVersion:1,activeId:null,ui:{step:0},options:{autoCopy:true,autoPlot:false,autoIterate:false,overlay:false}});
let app=defaults(),bridge=supported?SurveyBridge.createBridge(Elite,activity):null,resetting=false;
let routeRows=[],busy=false,stop=false,saveError=false,fatal=false,journalReady=false,replaying=false,plotting=false,renderTimer=null,saveTimer=null,boundsPage=0,boxPage=0,tablePage=null;
let targetGeneration=0,pendingTarget=null,saveNotice='',clipboardNotice='';
const logs=[],pendingEvents=[];
function active(){return app.surveys.find(s=>s.id===app.activeId);}
function draft(){return app.draft||(app.draft={source:{type:'single',text:''},anchorMass:'d',anchors:[],ignored:[],selected:0,levels:['d','c'],extraParents:[]});}
function activity(text){$('#activity').textContent=text;}
function message(text,kind=''){const el=$('#toast');el.className='notice '+kind;el.textContent=text;}
function log(text){logs.unshift(new Date().toLocaleTimeString()+' '+text);if(logs.length>50)logs.pop();}
function changed(){scheduleSave();scheduleRender();}
function scheduleRender(){if(resetting)return;clearTimeout(renderTimer);renderTimer=setTimeout(()=>{const el=document.activeElement;if(!el?.matches('textarea,input[type=text],input[type=number],input[type=password]'))render();},180);}
// Do not rebuild every control on focusout: that can detach a newly pressed
// button before its click event, and clear a helper connection being entered.
function scheduleSave(){if(resetting)return;clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(e=>message(e.message,'error')),300);}
async function save(){
 if(!bridge||fatal)return;try{const bytes=await bridge.save(app);if(saveError&&$('#toast').textContent===saveNotice)message('');saveError=false;saveNotice='';$('#connection').textContent=`Saved · ${Math.ceil(bytes/1024)} KB`;return true;}catch(e){saveError=true;saveNotice=e.message;stop=true;$('#connection').textContent='Not saved';throw e;}
}
function stepBar(step){return '<ol class="steps">'+['1 · Source & anchor','2 · Nesting levels','3 · Optional bounds','4 · Survey'].map((t,i)=>`<li class="${i===step?'active':''}">${t}</li>`).join('')+'</ol>';}
function progress(st){return st.total===null?'':`<div class="progress" aria-label="${st.percent.toFixed(1)} percent handled"><span style="width:${st.percent}%"></span></div>`;}
function copyBtn(name,label='Copy start'){return`<button class="small quiet" data-copy="${esc(name)}">${label}</button>`;}
function parentTree(b){return C.parents(b).map(p=>`<div class="row between"><span><b>${p.mass.toUpperCase()}</b> <span class="mono">${esc(p.prefix)}</span></span>${copyBtn(C.systemName(p,0))}</div>`).join('');}
function render(){
 $('#app').inert=resetting;$('#reset').disabled=resetting||busy||plotting||replaying;$('#import').disabled=resetting;$('#export').disabled=resetting||(!app.surveys.length&&!app.draftSurvey&&!app.anchorLists?.length);
 if(fatal){$('#app').innerHTML='<div class="card"><h2>Saved survey could not be loaded</h2><p>The saved data has not been overwritten. You can import a previously exported backup to recover.</p></div>';return;}
 const step=app.ui?.step??0;$('#app').innerHTML=stepBar(step)+(step===0?sourceUI():step===1?nestingUI():step===2?boundsUI():dashboardUI());
}
function anchorListsUI(){
 const lists=app.anchorLists||[];if(!lists.length)return '';
 return `<section class="card"><h2>Saved anchor lists</h2><p>Open a saved sequence to choose another anchor. Lists keep their original order and source, even after your route changes.</p><div class="tableWrap"><table><thead><tr><th>List</th><th>Anchors</th><th>With surveys</th><th></th></tr></thead><tbody>${lists.map(list=>{const started=list.anchors.filter(b=>app.surveys.some(s=>s.anchor.key===b.key)).length;return`<tr><td class="wrap">${esc(list.name)}</td><td>${list.anchors.length}</td><td>${started} / ${list.anchors.length}</td><td><button class="small" data-open-anchor-list="${esc(list.id)}" ${busy?'disabled':''}>Open list</button> <button class="small quiet" data-remove-anchor-list="${esc(list.id)}" ${busy?'disabled':''}>Remove list</button></td></tr>`;}).join('')}</tbody></table></div><small>Removing a list keeps all surveys and their progress. Saved lists are included in Export backup.</small></section>`;
}
function sourceUI(){
 const d=draft(),disabled=!routeRows.length,list=(app.anchorLists||[]).find(x=>x.id===d.anchorListId),savedRoute=!!list&&d.source.type==='route';
 const shownRoute=savedRoute?(d.source.snapshot||[]):routeRows;
 return `${anchorListsUI()}<div class="card"><div class="row between"><div><div class="eyebrow">Survey source</div><h2>A system, a list, or your current route</h2></div>${active()?'<button data-action="resume">Resume active survey</button>':''}</div>
 <p>Route order is preserved. Repeated anchor boxels appear once, at their first crossing. Calculated route and system lists are saved automatically.</p>
 <div class="row" style="margin:18px 0">${[['single','Single system'],['list','System list / string'],['route','Current GalMap route']].map(([v,l])=>`<label class="sourceRadio"><input type="radio" name="sourceType" value="${v}" ${d.source.type===v?'checked':''} ${v==='route'&&disabled?'disabled':''}>${l}</label>`).join('')}</div>
 ${savedRoute?`<small>Saved route snapshot · ${shownRoute.length} systems. You can choose another anchor without a live GalMap route.</small>`:disabled?'<small>No active GalMap route detected. The route option becomes available when JACoB reads one.</small>':`<small>${routeRows.length} systems in the current route. Its scope will be snapshotted when you continue.</small>`}
 <div class="field" style="margin-top:15px"><span>${d.source.type==='single'?'Procedural system name':'System names · one per line, or separated by arrows, commas or semicolons'}</span>${d.source.type==='route'?`<div class="mono wrap">${esc(shownRoute.slice(0,3).map(x=>typeof x==='string'?x:x.name).join(' → '))}${shownRoute.length>3?' → …':''}</div>`:`<textarea id="sourceText" placeholder="Pyurks OE-E d13-0" aria-label="Source system names">${esc(d.source.text)}</textarea>`}</div>
 <div class="row"><label class="inline">Anchor mass <select id="anchorMass">${C.MASSES.split('').map(m=>`<option value="${m}" ${d.anchorMass===m?'selected':''}>${m.toUpperCase()} · ${10*2**C.MASSES.indexOf(m)} ly</option>`).join('')}</select></label><button class="primary" data-action="derive" ${d.source.type==='route'&&disabled?'disabled':''}>${savedRoute?'Recalculate from current route':'Identify anchor boxels'}</button></div>
 ${C.MASSES.indexOf(d.anchorMass)>3?'<div class="notice">Higher-mass boxels cover much larger volumes and may require substantially more travel and time to enumerate and complete.</div>':''}</div>
 ${d.anchors.length?`<div class="grid"><section class="card"><h2>Choose your anchor</h2><p>${d.anchors.length} distinct boxels, in first-occurrence order.</p>
 <div class="row" style="margin-bottom:15px"><label class="field spacer">Anchor list name<input id="anchorListName" type="text" maxlength="120" value="${esc(list?.name||'')}" placeholder="Name this anchor list"></label><button data-action="saveAnchorList">${list?'Save name':'Save anchor list'}</button></div>
 <div class="tableWrap"><table><thead><tr><th>Use</th><th>Boxel</th><th>Source systems</th><th>Survey</th><th>Start</th></tr></thead><tbody>${d.anchors.map((b,i)=>{const surveys=app.surveys.filter(s=>s.anchor.key===b.key);return`<tr><td><input aria-label="Select ${esc(b.prefix)}" type="radio" name="selectedAnchor" value="${i}" ${d.selected===i?'checked':''}></td><td class="mono">${esc(b.prefix)}</td><td>${b.count??'—'}</td><td>${surveys.length?`${surveys.length} created <button class="small" data-open-survey="${esc(surveys.at(-1).id)}" ${busy?'disabled':''}>Open survey</button>`:'Not started'}</td><td>${copyBtn(C.systemName(b,0),'Copy')}</td></tr>`;}).join('')}</tbody></table></div><div class="footer"><span></span><button class="primary" data-action="nesting">Choose nesting levels →</button></div></section><aside class="card"><h3>Enclosing parents</h3><div class="tree">${parentTree(d.anchors[d.selected])}</div><p>Parents are context here. You can add a parent’s own sequence on the next screen.</p></aside></div>`:''}
 ${d.ignored.length?`<details class="card"><summary>${d.ignored.length} source entries ignored</summary><p>Higher-mass entries cannot identify a smaller anchor from their names. Authored or unsupported names are also omitted.</p>${d.ignored.map(x=>`<p><span class="mono">${esc(x.name)}</span> · ${esc(x.reason)}</p>`).join('')}</details>`:''}`;
}
function openAnchorList(id){
 if(busy||replaying)return;const list=(app.anchorLists||[]).find(x=>x.id===id);if(!list)throw Error('Saved anchor list not found.');
 app.draft=C.draftFromAnchorList(list);delete app.draftSurvey;app.ui={step:0};boundsPage=0;changed();render();
}
function nestingUI(){
 const d=draft(),b=d.anchors[d.selected];if(!b){app.ui.step=0;return sourceUI();}
 const ai=C.MASSES.indexOf(b.mass),total=d.levels.reduce((n,m)=>n+8**(ai-C.MASSES.indexOf(m)),0)+d.extraParents.length;
 return `<div class="card"><div class="eyebrow">Nesting levels</div><h2 class="mono">${esc(b.prefix)}</h2><p>Select only the populations you want to survey. Each selected class includes every boxel of that class inside this anchor.</p>
 ${C.MASSES.slice(0,ai+1).split('').reverse().map(m=>{const count=8**(ai-C.MASSES.indexOf(m)),first=C.descendant(b,m,0);return`<div class="layer"><div class="row"><label class="inline"><input type="checkbox" data-level="${m}" ${d.levels.includes(m)?'checked':''}><span class="mass">${m.toUpperCase()}</span></label><span class="spacer">${count.toLocaleString()} boxel${count===1?'':'s'}</span><span class="mono">${esc(C.systemName(first,0))}</span>${copyBtn(C.systemName(first,0),'Copy first start')}</div>${count>1?`<details><summary>Individual starts${count>64?' · first 64 shown; all rows are available in bounds':''}</summary><div class="miniList">${Array.from({length:Math.min(64,count)},(_,i)=>{const x=C.descendant(b,m,i);return`<div class="row between"><span class="mono">${esc(C.systemName(x,0))}</span>${copyBtn(C.systemName(x,0),'Copy')}</div>`;}).join('')}</div><button class="small" data-copy-level="${m}">Copy ${count<=4096?'all starts':'first 4,096 starts'}</button></details>`:''}</div>`;}).join('')}
 <details style="margin-top:20px"><summary>Add a parent’s own mass-code sequence</summary><p>Adding a parent adds one sequence. It does not expand that parent into descendants.</p>${C.parents(b).map(p=>`<div class="row between checkLine"><label class="inline"><input type="checkbox" data-parent="${p.mass}" ${d.extraParents.some(x=>x.key===p.key)?'checked':''}><span class="mono">${esc(p.prefix)}</span></label>${copyBtn(C.systemName(p,0))}</div>`).join('')}</details>
 <div class="notice ${total<100?'success':''}"><strong>${total.toLocaleString()} boxels selected.</strong> ${total>=100?'Deep nesting creates a large survey. Bounds and targets load in pages; catalogue checks remain under your control.':'D + C creates one D sequence and its eight nested C sequences.'}</div>
 <div class="footer"><button data-action="source">← Source</button><button class="primary" data-action="makeBounds" ${!total?'disabled':''}>Optional final bounds →</button></div></div>`;
}
function boundsSurvey(){return app.ui.editBounds?active():app.draftSurvey;}
function boundsUI(){
 const s=boundsSurvey();if(!s){app.ui.step=1;return nestingUI();}
 const count=C.scopeCount(s),start=boundsPage*25,end=Math.min(start+25,count);
 return `<div class="card"><div class="eyebrow">Optional final bounds</div><h2>Tell the survey where each sequence ends</h2><p>Copy a prefix into GalMap, inspect its autocomplete list, then enter the final suffix. Leave a field empty for open-ended surveying. You can add or change bounds later.</p>
 <div class="tableWrap"><table><thead><tr><th>Include</th><th>Boxel prefix</th><th>Mass</th><th>Clipboard</th><th>Last suffix</th></tr></thead><tbody>${Array.from({length:end-start},(_,n)=>{const i=start+n,b=C.boxAt(s,i),m=s.boxes[i];return`<tr><td><input type="checkbox" data-include="${i}" aria-label="Include ${esc(b.prefix)}" ${C.isIncluded(s,i)?'checked':''}></td><td class="mono boundName">${esc(b.prefix)}</td><td>${b.mass.toUpperCase()}</td><td>${copyBtn(b.prefix,'Copy prefix')} ${copyBtn(C.systemName(b,0),'Copy start')}</td><td><input type="text" inputmode="numeric" class="boundsInput" aria-label="Final suffix for ${esc(b.prefix)}" data-bound="${i}" value="${esc(app.ui.boundInputs?.[i]??m?.end??'')}" placeholder="Unknown" ${app.ui.boundErrors?.[i]?'aria-invalid="true"':''}>${app.ui.boundErrors?.[i]?`<small class="bad">${esc(app.ui.boundErrors[i])}</small>`:''}</td></tr>`;}).join('')}</tbody></table></div>
 <div class="row between" style="margin-top:15px"><button data-action="boundsPrev" ${!boundsPage?'disabled':''}>← Previous rows</button><small>Rows ${start+1}–${end} of ${count.toLocaleString()} boxels</small><button data-action="boundsNext" ${end>=count?'disabled':''}>More rows →</button></div>
 <p>Missing catalogue records never establish the end of a boxel. Mixed bounded and unbounded boxels are supported.</p><div class="footer"><button data-action="${app.ui.editBounds?'resume':'backNesting'}">← ${app.ui.editBounds?'Dashboard':'Nesting'}</button><button class="primary" data-action="start">${app.ui.editBounds?'Save bounds & return':'Start survey — empty bounds are fine'}</button></div></div>`;
}
function catalogueLabel(c){return c?.state==='unknown'&&c.searchLimited?c.quality:c?.state||'Unchecked';}
function catalogueCell(r,p){
 const c=r?.catalogues[p],who=p==='edsm'&&c?.state==='present'?r?.edsmDiscovery?.commander:'',date=C.catalogueTime(c?.latestBodyUpdate);
 return esc(catalogueLabel(c))+(who?` <span title="EDSM system discovery attribution">[${esc(who)}]</span>`:'')+(date?`<small>Body update: ${esc(C.catalogueDateLabel(date))}</small>`:'');
}
function catHTML(r,p){const c=r?.catalogues[p],who=p==='edsm'&&c?.state==='present'?r?.edsmDiscovery?.commander:'',date=C.catalogueTime(c?.latestBodyUpdate),title=p==='edsm'?'EDSM':'Spansh';return`<div class="catalogue"><small>${title}${who?` [${esc(who)}]`:""}</small><strong class="${c?.state==='absent'?'warn':c?.complete?'good':''}">${esc(c?.state==='present'?c.quality:catalogueLabel(c))}</strong>${c?.expected!==null&&c?.expected!==undefined?`<small>${c.scanned||0} scanned bodies; expected ${c.expected}</small>`:''}${c?.error?`<small class="bad">${esc(c.error)}</small>`:''}${c?.state==='present'?`<small>Latest reported body update: ${date?esc(C.catalogueDateLabel(date,true)):c.needsDetails?'details not requested':'unavailable'}</small>`:''}${p==='edsm'&&r?.edsmDiscovery?.error?'<small>EDSM attribution unavailable; catalogue result unchanged.</small>':''}${c?.checked?`<small>Checked ${esc(new Date(c.checked).toLocaleString())}</small>`:''}</div>`;}
function dashboardUI(){
 const s=active();if(!s){app.ui.step=0;return sourceUI();}const b=C.boxAt(s,s.activeBox),m=C.metadata(s,s.activeBox),r=C.recordAt(s,s.activeBox,m.cursor,false),bs=C.boxStats(s,s.activeBox),ss=C.surveyStats(s),name=C.systemName(b,m.cursor);
 const page=tablePage??Math.floor(m.cursor/25),start=page*25,end=m.end===null?start+25:Math.min(m.end+1,start+25),totalBoxes=C.scopeCount(s),bp=boxPage*25,be=Math.min(totalBoxes,bp+25),liveAny=s.liveSystem,live=liveAny&&!liveAny.outside&&Number.isSafeInteger(liveAny.i)&&Number.isSafeInteger(liveAny.seq)?liveAny:null,current=live?C.recordAt(s,live.i,live.seq,false):null;
 const liveHTML=live?`<p class="mono">${esc(live.name)}</p><strong class="${current&&C.localStatus(current).complete?'good':'warn'}">${current?esc(C.localStatus(current).label):'No survey evidence'}</strong>${current?`<p>${C.localStatus(current).majorScans} major-body scans${current.journal.bodyCount!=null?'; '+current.journal.bodyCount+' expected':''}. ${current.journal.resolvedBelts.length} belt groups resolved; ${current.journal.expectedBelts.length} known.</p><button class="small" data-action="${current.manualCompletion?'undoFullScan':'confirmFullScan'}">${current.manualCompletion?'Undo full-scan confirmation':'Confirm full scan (including belts)'}</button><small class="confirmationHint">Applies to ${esc(live.name)}, your current in-game system. Use after checking all bodies and any belts; no new FSS event is needed.</small>`:''}`:liveAny?.outside?`<p class="mono">${esc(liveAny.name||'Unknown system')}</p><strong class="muted">Outside selected survey scope</strong>`:'<p>Waiting for a journal location inside the selected scope.</p>';
 return `<div class="row between" style="margin-bottom:15px"><label class="inline">Survey <select id="surveySelect">${app.surveys.map(x=>`<option value="${esc(x.id)}" ${x.id===s.id?'selected':''}>${esc(x.anchor.prefix)} · ${new Date(x.created).toLocaleDateString()}</option>`).join('')}</select></label><div class="toolbar">${(app.anchorLists||[]).length?`<button data-action="anchorLists" ${busy?'disabled':''}>Saved anchor lists</button>`:''}${(app.anchorLists||[]).some(x=>x.id===s.anchorListId)?`<button data-open-anchor-list="${esc(s.anchorListId)}" ${busy?'disabled':''}>Return to anchor list</button>`:''}<button data-action="newSurvey">New survey</button><button data-action="editBounds">Edit final bounds</button></div></div>
 <section class="card"><div class="row between"><div><div class="eyebrow">Overall survey</div><h2>${s.levels.map(x=>x.toUpperCase()).join(' + ')}${s.extraParents.length?' + parents':''}</h2></div><span class="pill">${ss.total===null?'Final bounds partly or wholly unknown':'All final bounds supplied'}</span></div>
 <div class="stats"><div class="stat"><strong>${ss.count.toLocaleString()}</strong><small>selected boxels</small></div><div class="stat"><strong>${ss.complete}</strong><small>complete boxels</small></div><div class="stat"><strong>${ss.total===null?ss.handled:ss.handled+' / '+ss.total}</strong><small>systems handled${ss.total===null?' · denominator unknown':''}</small></div><div class="stat"><strong>${ss.attention}</strong><small>checked systems requiring visits</small></div></div>${progress(ss)}<p>${ss.processed} systems processed. ${ss.total===null?'No overall completion percentage until every included boxel has a final suffix.':ss.percent.toFixed(1)+'% handled under the current survey policy.'}</p></section>
 <div class="grid"><section class="card targetCard"><div class="row between"><div class="eyebrow">Current target · ${b.mass.toUpperCase()} mass</div><span class="pill">${bs.total===null?'End unknown':`Range 0–${m.end}`}</span></div><div class="target mono">${esc(name)}</div>${r?.alias&&C.norm(r.alias)!==C.norm(name)?`<p>Catalogue / in-game name: <b>${esc(r.alias)}</b></p>`:''}<p>${esc(C.outcome(r,s.policy).reason)}</p>
 <div class="toolbar" style="margin:17px 0"><button class="primary" data-action="copyTarget">Copy Target</button><button data-action="previous" ${m.cursor===0?'disabled':''}>← Previous</button><button data-action="next" ${m.end!==null&&m.cursor>=m.end?'disabled':''}>Next →</button><button data-action="iterate" ${s.activeBox>=totalBoxes-1?'disabled':''}>Iterate Boxel →</button></div>
 <p id="clipboardStatus" role="status" class="${clipboardNotice.startsWith('Copy failed')?'bad':'muted'}">${esc(clipboardNotice)}</p><small>Arrows leave unfinished systems outstanding. Iterate Boxel moves to the next included boxel.</small><div class="row" style="margin-top:16px">${s.policy.providers.map(p=>catHTML(r,p)).join('')||'<p>Catalogue checks disabled. Local surveying is required.</p>'}</div>
 <div class="toolbar" style="margin-top:15px"><button data-action="checkTarget" ${busy||!bridge||!s.policy.providers.length?'disabled':''}>Check target</button><button data-action="checkPage" ${busy||!bridge||!s.policy.providers.length?'disabled':''}>Check next 25</button><button data-action="checkBox" ${busy||!bridge||m.end===null||!s.policy.providers.length?'disabled':''}>Check entire boxel</button>${busy?'<button data-action="stop">Stop after request</button>':''}</div><small>Whole-boxel checks find catalogue matches in bulk, then request scan details only when they can affect the visit decision.</small></section>
 <aside class="card"><div class="eyebrow">Active boxel</div><h3 class="mono" style="margin-top:8px">${esc(b.prefix)}</h3><p>${bs.total===null?`${bs.handled} handled · final system unknown`:`${bs.handled} / ${bs.total} handled · ${bs.percent.toFixed(1)}%`}</p>${progress(bs)}<p>${bs.processed} processed · ${bs.attention} requiring visits</p><p>Highest recorded suffix: ${bs.highest>=0?bs.highest:'none'}</p>
 <hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><h3>Current in-game system</h3>${liveHTML}<p><small>${journalReady?'Journal connected. Arrival advances the target; FSS and belts update the visited system independently.':'Journal not available yet. Check JACoB’s journal directory setting.'}</small></p></aside></div>
 <section class="card" style="margin-top:18px"><div class="row between"><h3>Sequence · ${esc(b.prefix)}</h3><div class="toolbar"><button class="small" data-action="seqPrev" ${page===0?'disabled':''}>←</button><span class="muted">${start}–${end-1}</span><button class="small" data-action="seqNext" ${m.end!==null&&end>m.end?'disabled':''}>→</button></div></div><div class="tableWrap sequenceRows"><table><thead><tr><th>Suffix</th><th>State</th><th>Personal record</th><th>EDSM</th><th>Spansh</th><th>Target</th></tr></thead><tbody>${Array.from({length:Math.max(0,end-start)},(_,n)=>{const seq=start+n,rec=C.recordAt(s,s.activeBox,seq,false),o=C.outcome(rec,s.policy);return`<tr class="${seq===m.cursor?'active':''}"><td>${seq}</td><td class="${o.handled?'good':o.kind==='attention'?'warn':'muted'}">${esc(o.reason)}</td><td>${esc(C.personalStatus(rec))}</td><td class="wrap">${catalogueCell(rec,'edsm')}</td><td class="wrap">${catalogueCell(rec,'spansh')}</td><td><button class="small" data-target="${seq}">Select</button> ${copyBtn(rec?.alias||C.systemName(b,seq),'Copy')} ${rec?.journal.visited?`<button class="small quiet" data-confirm-scan="${seq}" title="${esc(C.systemName(b,seq))} · includes all bodies and any belts">${rec.manualCompletion?'Undo confirmation':'Confirm full scan'}</button>`:''}</td></tr>`;}).join('')}</tbody></table></div></section>
 <div class="grid"><section class="card"><h3>Survey boxels</h3><div class="tableWrap"><table><thead><tr><th>Boxel</th><th>Progress</th><th></th></tr></thead><tbody>${Array.from({length:be-bp},(_,n)=>{const i=bp+n,x=C.boxAt(s,i),st=C.boxStats(s,i);return`<tr class="${i===s.activeBox?'active':''}"><td class="mono">${esc(x.prefix)}</td><td>${!C.isIncluded(s,i)?'Excluded':st.complete?'Complete':st.total===null?st.handled+' handled · end unknown':st.handled+' / '+st.total}</td><td><button class="small" data-box="${i}" ${!C.isIncluded(s,i)?'disabled':''}>Open</button></td></tr>`;}).join('')}</tbody></table></div><div class="row between" style="margin-top:10px"><button class="small" data-action="boxPrev" ${!boxPage?'disabled':''}>←</button><small>${bp+1}–${be} of ${totalBoxes.toLocaleString()}</small><button class="small" data-action="boxNext" ${be>=totalBoxes?'disabled':''}>→</button></div><details style="margin-top:15px"><summary>Hierarchy & source snapshot</summary><p>${esc(s.source.type)} · ${s.anchors.length} anchor boxels found. Later GalMap changes do not alter this survey.</p><div class="tree">${parentTree(s.anchor)}<p><b>${esc(s.anchor.prefix)}</b> → ${s.levels.map(m=>`${m.toUpperCase()} (${8**(C.MASSES.indexOf(s.anchor.mass)-C.MASSES.indexOf(m))})`).join(', ')}</p></div>${s.anchors.map((x,i)=>`<p>${i+1}. <span class="mono">${esc(x.prefix)}</span> · ${x.count} source entries</p>`).join('')}</details></section>
 <aside class="card"><h3>Survey policy & controls</h3>${['edsm','spansh'].map(p=>`<label class="checkLine"><input type="checkbox" data-provider="${p}" ${s.policy.providers.includes(p)?'checked':''}>Check ${p==='edsm'?'EDSM':'Spansh'}</label>`).join('')}<label class="checkLine"><input id="visitAll" type="checkbox" ${s.policy.visitAll?'checked':''}>Visit even when every catalogue appears complete</label><label class="checkLine"><input id="ignoreVisited" type="checkbox" ${s.policy.ignoreVisited?'checked':''}>Ignore personally visited systems</label><small>Counts journal-recorded visits as handled by policy, even without a full scan. The personal record stays visible.</small><label class="field"><span>Revisit data older than this many days · 0 disables</span><input id="staleDays" type="number" min="0" max="36500" value="${s.policy.staleDays}"></label><small>Unless personal scan evidence or the ignore-visited policy handles a system, absence or uncertain catalogue data requires attention. Belts are included.</small><hr style="border:0;border-top:1px solid var(--line);margin:18px 0">
 <label class="checkLine"><input type="checkbox" id="autoIterate" ${app.options.autoIterate?'checked':''} ${m.end===null?'disabled':''}>Move to the next boxel on arrival at the final system</label><small>Requires a defined final suffix. Scan progress stays with the system you are visiting; unfinished systems remain outstanding.</small>
 <label class="checkLine"><input type="checkbox" id="autoCopy" ${app.options.autoCopy?'checked':''}>Copy target when it changes</label><p><small>${bridge?.hasClipboardHelper()?'Local clipboard helper connected. Copying works while Elite has focus.':'Browser copying may fail while Elite has focus. Connect the local helper for background copying.'}</small></p><details><summary>Clipboard helper connection</summary><p>Choose the connection.json file from the helper installer, or paste its contents below.</p><input id="clipboardPairing" type="password" autocomplete="off" aria-label="Clipboard helper connection details" placeholder="Optional: paste connection details"><button class="small" data-action="connectClipboard" ${!bridge?'disabled':''}>Connect clipboard helper</button>${bridge?.hasClipboardHelper()?'<button class="small quiet" data-action="disconnectClipboard">Disconnect clipboard helper</button>':''}</details><label class="checkLine"><input type="checkbox" id="overlay" ${app.options.overlay?'checked':''} ${!bridge?'disabled':''}>Top-of-screen survey overlay</label><p><small id="overlayDetails">${esc(bridge?.overlayDescription()||'Centered green text')}</small></p><details><summary>Optional GalMap plotting</summary><p>This sends game inputs and can replace your current route. It is off by default. Start from the normal cockpit view.</p><label class="checkLine"><input type="checkbox" id="autoPlot" ${app.options.autoPlot?'checked':''} ${!bridge?'disabled':''}>Plot next target automatically on arrival</label><button class="small" data-action="plot" ${!bridge||plotting?'disabled':''}>Plot this target once</button> <button class="small" data-action="cancelPlot">Cancel plotting</button></details>
 <div class="toolbar" style="margin-top:17px"><button class="small" data-action="history" ${busy||!bridge?'disabled':''}>Recover all journal history</button><button class="small" data-action="save">Save now</button></div><p><small>Save this HTML as a JACoB tab before relying on persistence. Keep the tab loaded to receive live events; journal recovery catches up after reopening.</small></p><details><summary>Activity log</summary><pre class="log">${esc(logs.join('\n'))}</pre></details><details><summary>Remove this survey</summary><p>Export a backup first. Other surveys remain saved.</p><button class="small" data-action="deleteSurvey">Remove active survey</button></details></aside></div>`;
}
async function targetChanged(fromArrival=false){
 const s=active();if(!s)return;tablePage=null;C.recordAt(s,s.activeBox,C.metadata(s,s.activeBox).cursor);changed();
 clipboardNotice='Preparing next target…';const task={s,i:s.activeBox,generation:++targetGeneration,fromArrival};
 if(busy||replaying){pendingTarget=task;if(busy&&!replaying)stop=true;return;}
 await resolveTarget(task);
}
async function resolveTarget(task){
 const {s,i,generation,fromArrival}=task,valid=()=>active()===s&&s.activeBox===i&&generation===targetGeneration;
 if(!valid())return;busy=true;stop=false;render();
 try{
  let checked=0;
  while(valid()&&!stop){const m=C.metadata(s,i),r=C.recordAt(s,i,m.cursor);
   if(bridge&&s.policy.providers.length&&!C.outcome(r,s.policy).handled)await bridge.check(s,i,[m.cursor],{stopped:()=>stop||!valid(),updated:scheduleRender});
   if(!valid()||stop)break;
   if(!C.outcome(r,s.policy).handled||!C.move(s,1))break;
   if(++checked%10===0)await save();
  }
  if(valid()&&!stop){const m=C.metadata(s,i),r=C.recordAt(s,i,m.cursor),name=r.alias||C.systemName(C.boxAt(s,i),m.cursor);
   if(app.options.autoCopy&&bridge&&!C.outcome(r,s.policy).handled)try{await bridge.copy(name);if(valid()){clipboardNotice='Copied: '+name;activity(clipboardNotice);}}catch(e){if(valid()){clipboardNotice='Copy failed: '+e.message;activity(clipboardNotice);}}
   else {clipboardNotice=C.outcome(r,s.policy).handled?'No outstanding target remains after this point.':('Automatic copying is off. Target: '+name);activity(clipboardNotice);}
   await save();updateOverlay();
   if(fromArrival&&app.options.autoPlot&&bridge&&!C.outcome(r,s.policy).handled){await new Promise(r=>setTimeout(r,1400));if(valid()&&app.options.autoPlot&&!stop)await plotTarget();}
  }
 }catch(e){message(e.message,'error');}finally{busy=false;render();if(pendingTarget){const next=pendingTarget;pendingTarget=null;resolveTarget(next).catch(e=>message(e.message,'error'));}}
}
async function plotTarget(){
 if(plotting||!bridge)return;const s=active(),b=C.boxAt(s,s.activeBox),m=C.metadata(s,s.activeBox),r=C.recordAt(s,s.activeBox,m.cursor);plotting=true;render();
 try{activity('Plotting in GalMap…');const actual=await bridge.plot(r.alias||C.systemName(b,m.cursor));message('Route destination verified: '+actual,'success');}catch(e){app.options.autoPlot=false;message(e.message+' Automatic plotting is now off.','error');}finally{plotting=false;changed();}
}
async function runChecks(mode){
 if(busy||!bridge)return;const s=active(),i=s.activeBox,m=C.metadata(s,i);busy=true;stop=false;render();
 let start=mode==='box'?0:m.cursor,last=mode==='target'?start:mode==='box'?m.end:Math.min(start+24,m.end??C.maxSuffix(C.boxAt(s,i).mass));
 if(last===null){busy=false;return;}
 try{if(mode==='box'){await bridge.checkBoxel(s,i,{stopped:()=>stop,updated:()=>{scheduleRender();scheduleSave();}});await save();updateOverlay();}
  else for(let from=start;from<=last&&!stop;from+=25){const seqs=Array.from({length:Math.min(25,last-from+1)},(_,n)=>from+n);
   await bridge.check(s,i,seqs,{stopped:()=>stop,force:true,updated:()=>scheduleRender()});await save();updateOverlay();
   // Open-ended scans do not turn absence into an endpoint. Stop this look-ahead
   // operation after an unresolved candidate; manual Next remains available.
   if(m.end===null&&seqs.some(n=>!s.policy.providers.some(p=>C.recordAt(s,i,n,false)?.catalogues[p]?.state==='present')))break;
  }activity(stop?'Catalogue checks stopped. Progress saved.':'Catalogue checks finished. Missing records do not define an endpoint.');
 }catch(e){activity('Catalogue checks paused.');try{await save();}catch{}message(e.message,'error');}finally{busy=false;render();if(pendingTarget){const next=pendingTarget;pendingTarget=null;resolveTarget(next).catch(e=>message(e.message,'error'));}}
}
function onJournal(e,history=false){
 if(resetting||fatal)return;
 if(replaying&&!history){pendingEvents.push(e);return;}
 if(!['FSDJump','Location','CarrierJump','FSSDiscoveryScan','FSSAllBodiesFound','Scan','SAAScanComplete'].includes(e.event))return;
 if(!history)journalReady=true;
 for(const s of app.surveys){const at=C.applyJournal(s,e);if(!at)continue;
  if(!history&&['FSDJump','CarrierJump'].includes(e.event)&&s===active()&&C.advanceOnArrival(s,at,app.options.autoIterate))targetChanged(true).catch(e=>message(e.message,'error'));
 }if(!history){changed();updateOverlay();}
}
async function recover(all=false,fresh=false){
 if(!bridge)return;replaying=true;all=all||app.surveys.some(s=>s.historyVersion!==2);
 try{
  activity(all?'Recovering all available personal visit and scan history…':'Recovering journals since the last checkpoint…');
  app.journalCursors=app.journalCursors||{};const cursors=fresh?{}:app.journalCursors;
  const count=await bridge.history(e=>onJournal(e,true),all,cursors,()=>stop);
  Object.assign(app.journalCursors,cursors);journalReady=true;
  if(all&&!stop)for(const s of app.surveys)s.historyVersion=2;
  log('Recovered '+count+' journal events.'+(stop?' Recovery paused; older history may still be missing.':''));
 }catch(e){log('Journal recovery: '+e.message);activity('Journal unavailable: '+e.message);}
 finally{replaying=false;while(pendingEvents.length)onJournal(pendingEvents.shift());changed();}
}
const attributionPending=new WeakSet();
function refreshAttribution(){
 const workspace=app,s=active();if(!bridge||!s||resetting||fatal||stop)return;
 const i=s.activeBox,seq=C.metadata(s,i).cursor,r=C.recordAt(s,i,seq,false);if(!r||attributionPending.has(r))return;
 const before=r.edsmDiscovery,valid=()=>app===workspace&&active()===s&&s.activeBox===i&&C.metadata(s,i).cursor===seq&&!resetting&&!fatal&&!stop;
 attributionPending.add(r);
 bridge.edsmDiscovery(s,i,seq,{stopped:()=>!valid()}).then(value=>{if(valid()&&value&&value!==before){changed();updateOverlay(false);}}).catch(e=>log('EDSM attribution: '+e.message)).finally(()=>attributionPending.delete(r));
}
let overlayTail=Promise.resolve();function updateOverlay(fetchAttribution=true){if(!bridge||!active())return;if(fetchAttribution)refreshAttribution();overlayTail=overlayTail.catch(()=>{}).then(async()=>{await bridge.overlay(active(),app.options.overlay);const details=$('#overlayDetails');if(details)details.textContent=bridge.overlayDescription();}).catch(e=>{app.options.overlay=false;message('Overlay unavailable: '+e.message,'error');});}
async function startSurvey(){
 if(Object.keys(app.ui.boundErrors||{}).length)throw Error('Correct or clear the invalid final suffix fields before continuing.');
 const s=boundsSurvey();if(C.scopeCount(s)===s.excluded.length)throw Error('Include at least one boxel.');
 if(!C.isIncluded(s,s.activeBox)){s.activeBox=0;while(!C.isIncluded(s,s.activeBox))s.activeBox++;}
 if(!app.ui.editBounds){app.surveys.push(s);app.activeId=s.id;delete app.draftSurvey;delete app.draft;}
 app.ui={step:3};boundsPage=0;busy=true;stop=false;render();try{await save();await recover(false,true);}finally{busy=false;}pendingTarget=null;await targetChanged();
}
async function derive(){
 const d=draft();if(d.source.type!=='route')d.source.text=$('#sourceText')?.value||'';
 const names=d.source.type==='route'?C.clone(routeRows):C.inputNames(d.source.text);if(d.source.type==='single'&&names.length!==1)throw Error('Enter exactly one procedural system name.');
 const result=C.deriveAnchors(names,d.anchorMass,d.source.type==='single');d.anchors=result.anchors;d.ignored=result.ignored;d.selected=0;d.source.snapshot=C.clone(names);d.source.captured=new Date().toISOString();delete d.anchorListId;if(d.source.type!=='single'||d.anchors.length>1)d.anchorListId=C.saveAnchorList(app,d).id;changed();render();
}
const actions={derive,
 anchorLists:()=>{if(busy)return;app.ui={step:0};render();},
 saveAnchorList:async()=>{const d=draft(),name=$('#anchorListName').value.trim();let list=(app.anchorLists||[]).find(x=>x.id===d.anchorListId);if(list){if(!name)throw Error('Enter a name for the anchor list.');list.name=name.slice(0,120);}else{list=C.saveAnchorList(app,d,name);if(name)list.name=name.slice(0,120);d.anchorListId=list.id;}await save();render();message(bridge?'Anchor list saved.':'Anchor list kept in this preview. Export a backup to retain it.','success');},
 source:()=>{app.ui.step=0;render();},nesting:()=>{app.ui.step=1;render();},backNesting:()=>{app.ui.step=1;render();},resume:async()=>{if(app.ui.editBounds)return startSurvey();app.ui={step:3};render();},
 makeBounds:()=>{app.draftSurvey=C.newSurvey(draft());app.ui={step:2};boundsPage=0;changed();render();},start:startSurvey,
 newSurvey:()=>{app.draft={source:{type:'single',text:''},anchorMass:'d',anchors:[],ignored:[],selected:0,levels:['d','c'],extraParents:[]};app.ui={step:0};render();},
 editBounds:()=>{app.ui={step:2,editBounds:true};boundsPage=0;render();},boundsPrev:()=>{boundsPage--;render();},boundsNext:()=>{boundsPage++;render();},
 copyTarget:async()=>{const s=active(),m=C.metadata(s,s.activeBox),r=C.recordAt(s,s.activeBox,m.cursor);await copy(r.alias||C.systemName(C.boxAt(s,s.activeBox),m.cursor));},
 previous:async()=>{if(C.move(active(),-1))await targetChanged();else message('No earlier outstanding target in this boxel.');},
 next:async()=>{if(C.move(active(),1))await targetChanged();else message('No later outstanding target inside the known range. Use Iterate Boxel to move on.');},
 iterate:async()=>{if(C.iterateBoxel(active())){boxPage=Math.floor(active().activeBox/25);await targetChanged();}else message('You are at the last included boxel. Outstanding systems remain in the list.');},
 checkTarget:()=>runChecks('target'),checkPage:()=>runChecks('page'),checkBox:()=>runChecks('box'),stop:()=>{stop=true;activity('Stopping after the current request…');},
 seqPrev:()=>{tablePage=(tablePage??Math.floor(C.metadata(active(),active().activeBox).cursor/25))-1;render();},seqNext:()=>{tablePage=(tablePage??Math.floor(C.metadata(active(),active().activeBox).cursor/25))+1;render();},boxPrev:()=>{boxPage--;render();},boxNext:()=>{boxPage++;render();},
 history:async()=>{if(busy||replaying)return;busy=true;stop=false;render();try{await recover(true);await save();}finally{busy=false;render();}pendingTarget=null;await targetChanged();},save:async()=>{await save();message(bridge?'Survey saved.':'Preview mode: export a backup to retain this work.','success');},plot:plotTarget,cancelPlot:()=>{bridge?.stopPlot();app.options.autoPlot=false;changed();},
 connectClipboard:async()=>{const text=$('#clipboardPairing').value.trim();if(text){await bridge.configureClipboard(JSON.parse(text));$('#clipboardPairing').value='';message('Clipboard helper connected. Automatic copying now works while Elite has focus.','success');render();if(app.options.autoCopy&&active())await targetChanged();}else $('#clipboardFile').click();},
 disconnectClipboard:async()=>{app.options.autoCopy=false;await bridge.disconnectClipboard();changed();render();message('Clipboard helper disconnected. Automatic copying is off; Copy Target uses the browser.');},
 confirmFullScan:()=>setManualCompletion(true),undoFullScan:()=>setManualCompletion(false),
 deleteSurvey:async()=>{if(!confirm('Remove this survey and its progress? Export a backup first if you need to retain it.'))return;const id=active().id;app.surveys=app.surveys.filter(s=>s.id!==id);app.activeId=app.surveys[0]?.id||null;app.ui={step:app.activeId?3:0};await save();render();}
};
function setManualCompletion(confirmed){
 const s=active(),at=s?.liveSystem;if(!at||at.outside)return;const r=C.recordAt(s,at.i,at.seq,false);if(!r)return;
 C.confirmFullScan(r,confirmed);changed();updateOverlay();render();
 message((confirmed?'Full scan including belts confirmed for ':'Manual confirmation removed for ')+at.name,confirmed?'success':'');
}
async function copy(text){
 try{if(bridge)await bridge.copy(text);else await navigator.clipboard.writeText(text);clipboardNotice='Copied: '+text;activity(clipboardNotice);}
 catch(e){clipboardNotice='Copy failed: '+e.message;throw e;}finally{scheduleRender();}
}
document.addEventListener('click',async e=>{
 const button=e.target.closest('button');if(!button||button.disabled)return;
 try{if(button.dataset.copy!==undefined){await copy(button.dataset.copy);return;}if(button.dataset.copyLevel){const d=draft(),b=d.anchors[d.selected],m=button.dataset.copyLevel,count=Math.min(4096,8**(C.MASSES.indexOf(b.mass)-C.MASSES.indexOf(m)));await copy(Array.from({length:count},(_,i)=>C.systemName(C.descendant(b,m,i),0)).join('\n'));return;}
  if(button.dataset.openAnchorList!==undefined){openAnchorList(button.dataset.openAnchorList);return;}
  if(button.dataset.removeAnchorList!==undefined){if(busy||replaying)return;const id=button.dataset.removeAnchorList,list=(app.anchorLists||[]).find(x=>x.id===id);if(!list||!confirm(`Remove saved anchor list "${list.name}"? All surveys and their progress will remain.`))return;app.anchorLists=app.anchorLists.filter(x=>x.id!==id);for(const s of app.surveys)if(s.anchorListId===id)delete s.anchorListId;if(app.draft?.anchorListId===id)delete app.draft.anchorListId;if(app.draftSurvey?.anchorListId===id)delete app.draftSurvey.anchorListId;changed();await save();render();return;}
  if(button.dataset.openSurvey!==undefined){if(busy||replaying)return;const s=app.surveys.find(x=>x.id===button.dataset.openSurvey);if(!s)throw Error('Survey not found.');bridge?.stopPlot();app.activeId=s.id;app.ui={step:3};boxPage=0;tablePage=null;changed();render();updateOverlay();return;}
  if(button.dataset.confirmScan!==undefined){const s=active(),seq=Number(button.dataset.confirmScan),r=C.recordAt(s,s.activeBox,seq,false);if(!r?.journal.visited)return;const confirmed=!r.manualCompletion;C.confirmFullScan(r,confirmed);changed();updateOverlay();render();message((confirmed?'Full scan including belts confirmed for ':'Manual confirmation removed for ')+C.systemName(C.boxAt(s,s.activeBox),seq),confirmed?'success':'');if(confirmed&&C.metadata(s,s.activeBox).cursor===seq)await targetChanged();return;}
  if(button.dataset.target!==undefined){C.metadata(active(),active().activeBox).cursor=Number(button.dataset.target);await targetChanged();render();return;}
  if(button.dataset.box!==undefined){active().activeBox=Number(button.dataset.box);await targetChanged();render();return;}
  if(actions[button.dataset.action]){await actions[button.dataset.action]();scheduleSave();}
 }catch(err){message(err.message||String(err),'error');}
});
document.addEventListener('change',async e=>{
 const el=e.target;try{
  if(el.name==='sourceType'){draft().source.type=el.value;draft().anchors=[];delete draft().anchorListId;render();}
  else if(el.id==='sourceText'){draft().source.text=el.value;draft().anchors=[];delete draft().anchorListId;}
  else if(el.id==='anchorMass'){const d=draft();d.anchorMass=el.value;d.levels=el.value==='d'?['d','c']:[el.value];d.anchors=[];d.extraParents=[];delete d.anchorListId;render();}
  else if(el.name==='selectedAnchor'){draft().selected=Number(el.value);draft().extraParents=[];render();}
  else if(el.dataset.level){const d=draft();d.levels=el.checked?[...new Set([...d.levels,el.dataset.level])]:d.levels.filter(m=>m!==el.dataset.level);render();}
  else if(el.dataset.parent){const d=draft(),p=C.ancestor(d.anchors[d.selected],el.dataset.parent);d.extraParents=el.checked?[...d.extraParents,p]:d.extraParents.filter(x=>x.key!==p.key);render();}
  else if(el.dataset.bound!==undefined){try{C.setBound(boundsSurvey(),Number(el.dataset.bound),el.value);delete (app.ui.boundErrors||{})[el.dataset.bound];delete (app.ui.boundInputs||{})[el.dataset.bound];el.removeAttribute('aria-invalid');el.value=boundsSurvey().boxes[el.dataset.bound].end??'';}catch(err){(app.ui.boundErrors||(app.ui.boundErrors={}))[el.dataset.bound]=err.message;(app.ui.boundInputs||(app.ui.boundInputs={}))[el.dataset.bound]=el.value;throw err;}}
  else if(el.dataset.include!==undefined){const s=boundsSurvey(),i=Number(el.dataset.include);s.excluded=el.checked?s.excluded.filter(n=>n!==i):[...new Set([...s.excluded,i])];}
  else if(el.dataset.provider){const s=active();s.policy.providers=el.checked?[...new Set([...s.policy.providers,el.dataset.provider])]:s.policy.providers.filter(p=>p!==el.dataset.provider);render();}
  else if(el.id==='visitAll'){active().policy.visitAll=el.checked;render();}
  else if(el.id==='ignoreVisited'){active().policy.ignoreVisited=el.checked;changed();updateOverlay();await targetChanged();render();}
  else if(el.id==='staleDays'){const days=Number(el.value);if(!Number.isFinite(days)||days<0||days>36500)throw Error('Enter an age from 0 to 36,500 days.');active().policy.staleDays=days;render();}
  else if(['autoCopy','autoPlot','autoIterate','overlay'].includes(el.id)){app.options[el.id]=el.checked;if(el.id==='overlay')updateOverlay();if(el.id==='autoCopy'&&el.checked)await targetChanged();}
  else if(el.id==='surveySelect'){stop=true;bridge?.stopPlot();app.activeId=el.value;boxPage=0;tablePage=null;render();updateOverlay();}
  scheduleSave();
 }catch(err){message(err.message,'error');el.setAttribute('aria-invalid','true');}
});
function downloadJSON(name,data){if(bridge&&Elite.files?.json)return Elite.files.json(name,data);const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#clipboardFile').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>2048)throw Error('Invalid clipboard helper connection file.');await bridge.configureClipboard(JSON.parse(await file.text()));message('Clipboard helper connected. Automatic copying now works while Elite has focus.','success');render();if(app.options.autoCopy&&active())await targetChanged();}catch(err){message(err.message,'error');}finally{e.target.value='';}};
$('#export').onclick=()=>downloadJSON('boxel-survey-backup.json',app);
$('#reset').onclick=async()=>{
 if(resetting||busy||plotting||replaying)return;
 if(!confirm('Reset this tab to defaults? This clears all saved anchor lists, surveys, bounds, progress, journal checkpoints and options in this tab. A recovery backup will be downloaded first. JACoB settings, journal files and other tabs are unchanged.'))return;
 const wasFatal=fatal,workspace=fatal?null:C.clone(app),fresh=defaults();resetting=true;stop=true;targetGeneration++;pendingTarget=null;bridge?.stopPlot();clearTimeout(saveTimer);clearTimeout(renderTimer);render();
 const backup=storage=>downloadJSON('boxel-survey-before-reset-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json',{format:'systematic-survey-reset-backup',version:1,created:new Date().toISOString(),workspace,storage});
 try{
  const bytes=bridge?await bridge.reset(fresh,backup):await backup(null);
  await overlayTail;app=fresh;fatal=false;saveError=false;saveNotice='';boundsPage=boxPage=0;tablePage=null;logs.length=0;pendingEvents.length=0;
  if(bridge)try{await bridge.overlay(null,false);}catch{}
  $('#connection').textContent=bridge?`Saved · ${Math.ceil(bytes/1024)} KB`:'Offline preview';activity('');message('Tab reset to defaults. A recovery backup was downloaded.','success');
  // A load failure may have prevented host subscriptions from being installed.
  if(wasFatal&&bridge)location.reload();
 }catch(e){message('Reset failed; the previous survey was kept. '+e.message,'error');}
 finally{resetting=false;render();}
};
$('#import').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>50000000)throw Error('Backup is too large.');const loaded=await SurveyBridge.importBackup(JSON.parse(await file.text()));if(!confirm('Replace the currently loaded survey workspace with this backup?'))return;stop=true;bridge?.stopPlot();loaded.options={autoCopy:true,autoIterate:false,overlay:false,...loaded.options,autoPlot:false};C.restoreAnchorLists(loaded);const old=app;app=loaded;fatal=false;try{await save();}catch(e){app=old;throw e;}app.ui={step:app.activeId?3:0};render();message('Backup restored. Automatic plotting is off.','success');}catch(err){message(err.message,'error');}finally{e.target.value='';}};
try{
 if(bridge){app=await bridge.load();if(C.restoreAnchorLists(app))scheduleSave();app.ui=app.ui||{step:app.activeId?3:0};app.options={autoCopy:true,autoIterate:false,overlay:false,...app.options,autoPlot:false};$('#connection').textContent='JACoB connected';
  try{routeRows=await bridge.route();}catch(e){log('Route unavailable: '+e.message);}
  Elite.data.subscribe('navRoute',u=>{routeRows=(u.data?.Route||[]).map(r=>({name:r.StarSystem,id64:C.safeId(r.SystemAddress),pos:r.StarPos}));if((app.ui?.step??0)===0)scheduleRender();});
  Elite.journal.subscribe('*',e=>onJournal(e));render();if(active()){busy=true;stop=false;render();try{await recover(false);}finally{busy=false;}pendingTarget=null;}else try{journalReady=!!(await Elite.journal.files()).files?.length;}catch{}
  if(active()){updateOverlay();await targetChanged();}
 }else{$('#connection').textContent='Offline preview';message(hasHost?'This tab needs JACoB SDK 11 or later. Update JACoB to enable storage and catalogue checks.':'Preview mode. Import this HTML through JACoB’s Tab Manager to connect journals, catalogues, storage and overlays.');render();}
}catch(e){fatal=true;message('Could not load saved survey: '+e.message,'error');render();}
// Exposed only as a read-only test hook; game I/O still travels through the SDK.
window.SurveyUI={getState:()=>C.clone(app),getBusy:()=>busy,render};
})();

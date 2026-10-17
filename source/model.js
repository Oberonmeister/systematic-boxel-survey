/* Systematic Survey model. No network, DOM or game input.
 * Procedural parser/name formatter and base-26 naming adapted from
 * pseudo6626/JACoB examples/BOXEL-surveyer.html, commit 284f9cc.
 * Child order preserves its x + 2*y + 4*z convention.
 */
(function(root){
'use strict';
const MASSES='abcdefgh', norm=s=>String(s||'').trim().replace(/\s+/g,' ').toLowerCase();
const clone=x=>JSON.parse(JSON.stringify(x));
function parseName(name){
 const raw=String(name||'').trim(),m=raw.match(/^(.+?)\s+([A-Z]{2}-[A-Z])\s+([a-h])(?:(\d+)-(\d+)|(\d+))$/i);
 if(!m)return null;
 const mass=m[3].toLowerCase(),n1=m[4]!==undefined?Number(m[4]):0,seq=Number(m[5]!==undefined?m[5]:m[6]);
 if(!Number.isSafeInteger(n1)||!Number.isSafeInteger(seq)||seq<0||seq>maxSuffix(mass))return null;
 const sector=m[1].trim(),letters=m[2].toUpperCase();
 const code=letters.charCodeAt(0)-65+(letters.charCodeAt(1)-65)*26+(letters.charCodeAt(3)-65)*676+n1*17576;
 const xyz=[code%128,Math.floor(code/128)%128,Math.floor(code/16384)];
 const side=128/2**MASSES.indexOf(mass);
 if(xyz.some(v=>v<0||v>=side))return null;
 return boxFromXYZ(sector,mass,xyz,{raw,seq});
}
function maxSuffix(mass){return 2**(11+3*MASSES.indexOf(mass))-1;}
function lettersFromCode(code){const a=n=>String.fromCharCode(65+n%26);return `${a(code)}${a(Math.floor(code/26))}-${a(Math.floor(code/676))}`;}
function boxFromXYZ(sector,mass,xyz,extra={}){
 const code=xyz[0]+128*xyz[1]+16384*xyz[2],n1=Math.floor(code/17576),letters=lettersFromCode(code%17576);
 const prefix=`${sector} ${letters} ${mass}${n1||''}`;
 return{sector,letters,mass,n1,xyz:[...xyz],prefix,key:norm(prefix),...extra};
}
function systemName(box,seq){return box.n1?`${box.sector} ${box.letters} ${box.mass}${box.n1}-${seq}`:`${box.sector} ${box.letters} ${box.mass}${seq}`;}
function ancestor(box,mass){const d=MASSES.indexOf(mass)-MASSES.indexOf(box.mass);if(d<0)throw Error('Cannot locate a smaller boxel from this name.');return boxFromXYZ(box.sector,mass,box.xyz.map(n=>Math.floor(n/2**d)));}
function parents(box){return MASSES.slice(MASSES.indexOf(box.mass)+1).split('').map(m=>ancestor(box,m));}
function descendant(box,mass,index){
 const depth=MASSES.indexOf(box.mass)-MASSES.indexOf(mass);
 if(depth<0||index<0||index>=8**depth)throw Error('Invalid descendant index.');
 let xyz=[...box.xyz];
 for(let d=depth-1;d>=0;d--){const oct=Math.floor(index/8**d)%8;xyz=xyz.map((v,i)=>2*v+((oct>>i)&1));}
 return boxFromXYZ(box.sector,mass,xyz);
}
function inputNames(text){
 // Explicit route delimiters keep authored names intact. Also accept adjacent
 // procedural names separated only by whitespace, as in copied highway strings.
 const pieces=String(text||'').split(/\r?\n|\t|\s*(?:→|->|;|\||,)\s*/).map(x=>x.trim().replace(/^(?:[-*•]\s+|\d+[.)]\s+)/,'').replace(/^["`]|["`]$/g,'')).filter(Boolean),out=[];
 for(const piece of pieces){const matches=[...piece.matchAll(/(.+?\s+[A-Z]{2}-[A-Z]\s+[a-h](?:\d+-\d+|\d+))(?=\s|$)/gi)];
  if(matches.length>1&&norm(matches.map(x=>x[0]).join(' '))===norm(piece))out.push(...matches.map(x=>x[0].trim()));else out.push(piece);
 }return out;
}
function deriveAnchors(names,mass,single=false){
 if(!MASSES.includes(mass)||mass.length!==1)throw Error('Choose a valid anchor mass class.');
 const anchors=[],ignored=[],seen=new Map();
 names.forEach((item,index)=>{
  const name=typeof item==='string'?item:item.name||item.StarSystem||'',p=parseName(name);
  if(!p){ignored.push({name,reason:'No supported procedural boxel address'});return;}
  if(MASSES.indexOf(p.mass)>MASSES.indexOf(mass)){ignored.push({name,reason:`${p.mass.toUpperCase()} is above the ${mass.toUpperCase()} anchor`});return;}
  const b=ancestor(p,mass);let a=seen.get(b.key);
  if(!a){a={...b,count:0,firstIndex:index,lastIndex:index,firstSystem:name,lastSystem:name};anchors.push(a);seen.set(b.key,a);}
  a.count++;a.lastIndex=index;a.lastSystem=name;
 });
 if(single&&ignored.length)throw Error(`Choose a procedural system of mass ${mass.toUpperCase()} or lower. ${ignored[0].reason}.`);
 if(!anchors.length)throw Error('No eligible source systems remain. Choose systems at or below the anchor mass class.');
 return{anchors,ignored};
}
function anchorListFingerprint(value){
 const source=value.source||{},names=(source.snapshot||inputNames(source.text)).map(x=>norm(typeof x==='string'?x:x.name||x.StarSystem));
 return JSON.stringify([value.anchorMass,source.type||'single',names,value.anchors.map(b=>b.key)]);
}
function saveAnchorList(app,d,name='',now=new Date().toISOString()){
 if(!d.anchors?.length)throw Error('Identify anchor boxels before saving a list.');
 const lists=app.anchorLists||(app.anchorLists=[]),mass=d.anchorMass||d.anchors[0].mass;
 const candidate={anchorMass:mass,source:clone(d.source),anchors:clone(d.anchors),ignored:clone(d.ignored||[])};
 const fingerprint=anchorListFingerprint(candidate),existing=lists.find(x=>anchorListFingerprint(x)===fingerprint);
 if(existing)return existing;
 const first=candidate.anchors[0].prefix,last=candidate.anchors.at(-1).prefix;
 const entry={id:'anchors-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9),name:(String(name).trim()||`${mass.toUpperCase()} · ${first}${first!==last?' → '+last:''}`).slice(0,120),created:now,...candidate};
 validateAnchorList(entry);lists.push(entry);return entry;
}
function draftFromAnchorList(entry){
 validateAnchorList(entry);
 return{anchorListId:entry.id,source:clone(entry.source),anchorMass:entry.anchorMass,anchors:clone(entry.anchors),ignored:clone(entry.ignored),selected:0,levels:entry.anchorMass==='d'?['d','c']:[entry.anchorMass],extraParents:[]};
}
function restoreAnchorLists(app){
 // Backfill only once. Explicitly deleted lists must not reappear on reopening.
 if(app.anchorListsVersion===1)return false;
 app.anchorLists=app.anchorLists||[];
 for(const value of [...app.surveys,app.draft].filter(Boolean)){
  if(!value.anchors?.length||value.anchors.length===1&&value.source?.type==='single')continue;
  const entry=saveAnchorList(app,{...value,anchorMass:value.anchorMass||value.anchor?.mass||value.anchors[0].mass},'',value.created||new Date().toISOString());
  value.anchorListId=entry.id;
 }
 app.anchorListsVersion=1;return true;
}
function validateAnchorList(entry){
 if(!entry||typeof entry.id!=='string'||!entry.id||typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>120||!entry.source||!Array.isArray(entry.anchors)||!entry.anchors.length||!Array.isArray(entry.ignored)||typeof entry.anchorMass!=='string'||entry.anchorMass.length!==1||!MASSES.includes(entry.anchorMass))throw Error('Invalid saved anchor list.');
 if(entry.source.snapshot!==undefined&&(!Array.isArray(entry.source.snapshot)||entry.source.snapshot.some(x=>typeof x!=='string'&&(!x||typeof x!=='object'||typeof (x.name||x.StarSystem)!=='string'))))throw Error('Invalid saved anchor-list source.');
 for(const b of entry.anchors){
  const parsed=b&&parseName(systemName(b,0));
  if(!parsed||b.mass!==entry.anchorMass||parsed.key!==b.key||parsed.prefix!==b.prefix||JSON.stringify(parsed.xyz)!==JSON.stringify(b.xyz))throw Error('Invalid saved anchor boxel.');
 }
 if(new Set(entry.anchors.map(b=>b.key)).size!==entry.anchors.length)throw Error('Duplicate boxels in saved anchor list.');
 return entry;
}
function scopeSections(s){
 const sections=[],ai=MASSES.indexOf(s.anchor.mass);
 for(let i=ai;i>=0;i--)if(s.levels.includes(MASSES[i]))sections.push({mass:MASSES[i],count:8**(ai-i)});
 for(const p of s.extraParents||[])sections.push({mass:p.mass,count:1,parent:p});
 return sections;
}
function scopeCount(s){return scopeSections(s).reduce((n,x)=>n+x.count,0);}
function boxAt(s,index){
 if(!Number.isSafeInteger(index)||index<0)throw Error('Invalid boxel index.');
 let n=index;for(const part of scopeSections(s)){if(n<part.count)return{...(part.parent||descendant(s.anchor,part.mass,n)),index};n-=part.count;}
 return null;
}
function boxIndex(s,p){
 let offset=0;for(const part of scopeSections(s)){
  if(part.parent){if(part.parent.key===p.key)return offset;}
  else if(part.mass===p.mass&&ancestor(p,s.anchor.mass).key===s.anchor.key){
   const depth=MASSES.indexOf(s.anchor.mass)-MASSES.indexOf(p.mass),delta=p.xyz.map((v,i)=>v-s.anchor.xyz[i]*2**depth);let n=0;
   for(let d=depth-1;d>=0;d--)n=n*8+((delta[0]>>d)&1)+2*((delta[1]>>d)&1)+4*((delta[2]>>d)&1);
   return offset+n;
  }offset+=part.count;
 }return -1;
}
function isIncluded(s,i){return !s.excluded.includes(i)&&i>=0&&i<scopeCount(s);}
function metadata(s,i){return s.boxes[i]||(s.boxes[i]={end:null,cursor:0,records:{}});}
function newSurvey(draft,now=new Date().toISOString()){
 const anchor=draft.anchors[draft.selected];if(!anchor)throw Error('Choose an anchor boxel.');
 const s={id:'survey-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,7),created:now,source:clone(draft.source),anchor:clone(anchor),anchors:clone(draft.anchors),ignored:clone(draft.ignored||[]),levels:[...draft.levels],extraParents:clone(draft.extraParents||[]),excluded:[],boxes:{},activeBox:0,policy:{providers:['edsm','spansh'],staleDays:0,visitAll:false},liveSystem:null};
 if(draft.anchorListId)s.anchorListId=draft.anchorListId;
 if(!scopeCount(s))throw Error('Select at least one mass class or parent.');return s;
}
function setBound(s,index,value){
 const b=boxAt(s,index);if(!b)throw Error('Boxel not found.');const txt=String(value??'').trim(),meta=metadata(s,index);
 if(!txt){meta.end=null;Object.assign(meta.records,meta.probesBeyondBound||{});delete meta.probesBeyondBound;return;}
 let n;if(/^\d+$/.test(txt))n=Number(txt);else{const p=parseName(txt);if(!p||p.key!==b.key)throw Error('The pasted system must belong to this exact boxel.');n=p.seq;}
 if(!Number.isSafeInteger(n)||n<0||n>maxSuffix(b.mass))throw Error('Enter a valid non-negative final suffix.');
 const positive=Object.values(meta.records).filter(r=>r.journal.visited||r.journal.fss||Object.keys(r.journal.bodies||{}).length||r.alias||Object.values(r.catalogues).some(c=>c.state==='present'));
 const highest=positive.reduce((v,r)=>Math.max(v,r.seq),-1);
 if(n<highest)throw Error(`There is already evidence of an existing system at suffix ${highest}. Resolve that conflict before reducing the bound.`);
 // Guessed, absent and failed lookups beyond a user-confirmed end are probes,
 // not evidence that a system exists. Keep them out of the survey denominator.
 for(const [seq,r]of Object.entries(meta.records))if(Number(seq)>n){(meta.probesBeyondBound||(meta.probesBeyondBound={}))[seq]=r;delete meta.records[seq];}
 for(const [seq,r]of Object.entries(meta.probesBeyondBound||{}))if(Number(seq)<=n){meta.records[seq]=r;delete meta.probesBeyondBound[seq];}
 meta.end=n;meta.cursor=Math.min(meta.cursor,n);
}
function recordAt(s,i,seq,create=true){
 // Journal location state deliberately uses null indices for systems outside the
 // survey. Treat those as a normal lookup miss instead of passing null to boxAt.
 if(!Number.isSafeInteger(i)||i<0||!Number.isSafeInteger(seq)||seq<0)return null;
 const b=boxAt(s,i);if(!b||!isIncluded(s,i)||seq>maxSuffix(b.mass))return null;
 const m=create?metadata(s,i):s.boxes[i];if(m?.end!==null&&m?.end!==undefined&&seq>m.end)return null;
 if(!m)return null;if(!m.records[seq]&&create)m.records[seq]={seq,catalogues:{},journal:{bodies:{},expectedBelts:[],resolvedBelts:[],fss:false,visited:false}};
 return m.records[seq]||null;
}
function bodyKey(b){return String(b.BodyID??b.bodyId??b.id??b.BodyName??b.name??'');}
function beltName(name){return String(name||'').replace(/\s+Cluster\s+\d+.*$/i,'').trim();}
function normalBody(b){
 const name=String(b.BodyName||b.name||''),type=b.StarType?'Star':b.PlanetClass?'Planet':String(b.type||b.subType||'');
 const barycentre=/barycent(?:re|er)/i.test(type+' '+(b.subType||b.subtype||''));
 const belt=/\bBelt(?:\s+Cluster\s+\d+)?$/i.test(name)||/belt/i.test(type);
 const major=!belt&&!barycentre&&!!(b.StarType||b.PlanetClass||/^(Star|Planet)$/i.test(type));
 const star=!barycentre&&(!!b.StarType||/^Star$/i.test(type));
 const detailed=major&&(b.ScanType?b.ScanType!=='Basic':!!(b.subType||b.subtype||b.StarType||b.PlanetClass));
 const rings=[...(b.Rings||b.rings||[]).filter(r=>/\bBelt$/i.test(r.Name||r.name||'')),...(b.belts||[])].map(r=>String(r.Name||r.name));
 return{name,major,star,belt,detailed,rings,mapped:!!(b.WasMapped||b.wasMapped),timestamp:b.timestamp||b.updateTime||''};
}
function localStatus(r){
 const j=r?.journal||{},bodies=Object.values(j.bodies||{}),majors=bodies.filter(b=>b.major&&b.detailed),majorComplete=!!j.fss||(Number.isInteger(j.bodyCount)&&j.bodyCount>0&&majors.length>=j.bodyCount);
 const stars=bodies.filter(b=>b.star),belts=j.expectedBelts||[],missing=belts.filter(n=>!(j.resolvedBelts||[]).some(x=>norm(x)===norm(n)));
 // Seeing all major-body scans supplies the star/ring inventory needed to
 // distinguish no belts from an unknown belt inventory. FSSAllBodiesFound alone
 // is deliberately insufficient for that distinction.
 const inventoryKnown=!!j.beltsConfirmed||(majorComplete&&stars.length>0&&Number.isInteger(j.bodyCount)&&majors.length>=j.bodyCount);
 const manual=!!r?.manualCompletion,complete=manual||majorComplete&&(!!j.beltsConfirmed||(inventoryKnown&&!missing.length));
 return{complete,manual,majorComplete,beltsKnown:inventoryKnown,missingBelts:missing,majorScans:majors.length,label:manual?'Full scan manually confirmed':complete?'FSS + belts complete':majorComplete?(missing.length?'Belts unresolved':'Belt inventory uncertain'):majors.length?'Partially scanned':j.honked?'Honked':j.visited?'Visited':'No visit recorded'};
}
function personalStatus(r){
 if(!r?.journal?.visited)return r?.manualCompletion?'Manually confirmed':'No visit recorded';
 return (r.journal.visitedBeforeSurvey||r.journal.startedInSurvey===false?'Previously visited':'Visited')+' · '+localStatus(r).label;
}
function confirmFullScan(r,confirmed=true,now=new Date().toISOString()){
 if(!r)return false;
 if(confirmed)r.manualCompletion={confirmedAt:now,includesBelts:true};else delete r.manualCompletion;
 return true;
}
function catalogueTime(value){
 if(typeof value!=='string'||!value.trim())return '';
 const text=value.trim(),utc=/^\d{4}-\d\d-\d\d[ T]\d\d:\d\d:\d\d(?:\.\d+)?$/.test(text)?text.replace(' ','T')+'Z':text;
 const time=Date.parse(utc);return Number.isFinite(time)?new Date(time).toISOString():'';
}
function catalogueDateLabel(value,full=false){
 const date=catalogueTime(value);if(!date)return '';
 return (full?date.replace('T',' ').replace(/(?:\.000)?Z$/,' UTC'):date.slice(0,10))+(date<'2021-05-19T00:00:00.000Z'?' (pre-Odyssey)':'');
}
function catalogueStatus(raw,now=new Date().toISOString()){
 const source=raw||{},bs=Array.isArray(source.bodies)?source.bodies:[],unique=new Map();
 for(const b of bs){const key=bodyKey(b);if(key)unique.set(key,b);}
 const normal=[...unique.values()].map(normalBody),majors=normal.filter(b=>b.major&&b.detailed),stars=normal.filter(b=>b.star);
 // Never manufacture the expected count from the number of returned records.
 const expected=source.bodyCount??source.body_count,total=Number.isInteger(Number(expected))&&expected!==null&&expected!==undefined?Number(expected):null;
 const belts=stars.flatMap(b=>b.rings),resolved=normal.filter(b=>b.belt).map(b=>beltName(b.name));
 const majorComplete=total>0&&majors.length===total;
 const beltsComplete=majorComplete&&stars.length>0&&belts.every(n=>resolved.some(x=>norm(x)===norm(n)));
 const times=majors.map(b=>Date.parse(catalogueTime(b.timestamp))),dated=times.length>0&&times.every(Number.isFinite);
 const bodyDates=normal.map(b=>Date.parse(catalogueTime(b.timestamp))).filter(Number.isFinite);
 return{state:'present',name:source.name||source.system_name||'',id64:safeId(source.id64),expected:total,scanned:majors.length,belts:belts.length,beltsResolved:belts.filter(n=>resolved.some(x=>norm(x)===norm(n))).length,complete:beltsComplete,quality:beltsComplete?'Apparently complete':majorComplete?'Major bodies complete; belts unverified':majors.length?'Partial scan data':total?'Body count only':'Coordinates / visit record',updated:dated?new Date(Math.min(...times)).toISOString():'',latestBodyUpdate:bodyDates.length?new Date(Math.max(...bodyDates)).toISOString():'',checked:now};
}
function safeId(id){if(typeof id==='number'&&!Number.isSafeInteger(id))return '';return /^\d+$/.test(String(id??''))?String(id):'';}
function outcome(r,policy,now=Date.now()){
 if(!r)return{handled:false,reason:'Unchecked',kind:'unchecked'};
 const local=localStatus(r);if(local.complete)return{handled:true,reason:local.manual?'Full scan manually confirmed':'Personal scan complete, including belts',kind:'local'};
 if(policy.ignoreVisited&&r.journal.visited)return{handled:true,reason:'Ignored by policy · personally visited',kind:'visited'};
 const sources=policy.providers.map(p=>r.catalogues[p]);
 if(!sources.length)return{handled:false,reason:'Local survey required',kind:'attention'};
 if(sources.some(c=>c?.state==='absent'))return{handled:false,reason:'Absent from at least one catalogue',kind:'attention'};
 if(sources.some(c=>!c||c.state==='error'||c.state==='unknown'&&!c.searchLimited))return{handled:false,reason:'Catalogue check unresolved',kind:'unchecked'};
 if(sources.some(c=>c.state==='unknown'&&c.searchLimited))return{handled:false,reason:sources.some(c=>c.bulkSearch)?'Not found in Spansh boxel search; visit required':'No exact Spansh match in top 10; visit required',kind:'attention'};
 if(policy.visitAll)return{handled:false,reason:'Visit every system policy',kind:'attention'};
 if(sources.some(c=>!c.complete))return{handled:false,reason:'Incomplete or uncertain data',kind:'attention'};
 if(new Set(sources.map(c=>c.expected)).size>1)return{handled:false,reason:'Catalogue body counts disagree',kind:'attention'};
 if(policy.staleDays>0&&sources.some(c=>!c.updated||!Number.isFinite(Date.parse(c.updated))||now-Date.parse(c.updated)>policy.staleDays*86400000))return{handled:false,reason:'Old or undated catalogue data',kind:'attention'};
 return{handled:true,reason:'Complete in every enabled catalogue',kind:'catalogue'};
}
function boxStats(s,i){
 const m=s.boxes[i]||{end:null,records:{}},records=Object.values(m.records),states=records.map(r=>outcome(r,s.policy));
 const handled=states.filter(x=>x.handled).length,total=m.end===null?null:m.end+1;
 return{handled,total,processed:records.filter(r=>r.journal.visited||Object.keys(r.catalogues).length).length,attention:states.filter(x=>x.kind==='attention').length,complete:total!==null&&handled===total,percent:total===null?null:100*handled/total,highest:Object.keys(m.records).reduce((v,k)=>Math.max(v,Number(k)),-1)};
}
function surveyStats(s){
 const count=scopeCount(s)-s.excluded.length;let bounded=0,total=0,handled=0,processed=0,attention=0,complete=0,started=0;
 for(const key of Object.keys(s.boxes)){const i=Number(key);if(!isIncluded(s,i))continue;const st=boxStats(s,i);if(st.total!==null){bounded++;total+=st.total;}handled+=st.handled;processed+=st.processed;attention+=st.attention;complete+=Number(st.complete);started+=Number(st.processed>0);}
 const allBounded=bounded===count;return{count,bounded,total:allBounded?total:null,handled,processed,attention,complete,started,percent:allBounded&&total?100*handled/total:null};
}
function move(s,direction){
 const m=metadata(s,s.activeBox),b=boxAt(s,s.activeBox);let next=m.cursor+direction;
 while(next>=0&&next<=maxSuffix(b.mass)&&(m.end===null||next<=m.end)){
  if(!outcome(recordAt(s,s.activeBox,next,false),s.policy).handled){m.cursor=next;return true;}next+=direction;
 }return false;
}
function iterateBoxel(s){for(let i=s.activeBox+1;i<scopeCount(s);i++)if(isIncluded(s,i)){s.activeBox=i;metadata(s,i);return true;}return false;}
function advanceOnArrival(s,at,autoIterate=false){
 if(!at||at.i!==s.activeBox)return false;
 const m=metadata(s,s.activeBox);
 if(autoIterate&&Number.isSafeInteger(m.end)&&at.seq===m.end)return iterateBoxel(s);
 return at.seq===m.cursor&&move(s,1);
}
function locateEvent(s,e){
 const name=e.StarSystem||e.SystemName||'',p=parseName(name);
 if(p){const i=boxIndex(s,p);if(i>=0&&isIncluded(s,i))return{i,seq:p.seq};}
 const id=safeId(e.SystemAddress);if(id)for(const [i,m]of Object.entries(s.boxes))for(const r of Object.values(m.records))if(r.id64===id)return{i:Number(i),seq:r.seq};
 return null;
}
function applyJournal(s,e){
 const when=e.timestamp||new Date().toISOString(),arrival=['FSDJump','Location','CarrierJump'].includes(e.event),at=locateEvent(s,e);
 // Backfilling older files must never replace a newer live location.
 if(arrival&&(!s.liveSystem?.when||Date.parse(when)>=Date.parse(s.liveSystem.when)))s.liveSystem=at?{...at,name:e.StarSystem,when}:{name:e.StarSystem||'',i:null,seq:null,outside:true,when};
 if(!at)return null;const r=recordAt(s,at.i,at.seq);if(!r)return null;
 const currentEvidence=Date.parse(when)>=Date.parse(s.created);
 // Scan knowledge survives revisits. Elite does not emit a new complete scan
 // inventory just because the commander revisits an already scanned system.
 const j=r.journal,id=safeId(e.SystemAddress);if(id)r.id64=id;
 if(j.startedInSurvey===undefined)j.startedInSurvey=currentEvidence;
 if(arrival||['Scan','FSSDiscoveryScan','FSSAllBodiesFound','SAAScanComplete'].includes(e.event)){
  j.visited=true;if(!currentEvidence)j.visitedBeforeSurvey=true;
  if(!j.firstVisit||Date.parse(when)<Date.parse(j.firstVisit))j.firstVisit=when;
  if(!j.lastVisit||Date.parse(when)>Date.parse(j.lastVisit))j.lastVisit=when;
 }
 if(arrival)r.alias=e.StarSystem||r.alias||'';
 const bodyCount=e.event==='FSSDiscoveryScan'?e.BodyCount:e.event==='FSSAllBodiesFound'?e.Count:null;
 if(Number.isInteger(bodyCount)&&(!j.bodyCountTime||Date.parse(when)>=Date.parse(j.bodyCountTime))){j.bodyCount=bodyCount;j.bodyCountTime=when;}
 if(e.event==='FSSDiscoveryScan'){j.honked=true;if(!j.honkTime||when>j.honkTime)j.honkTime=when;}
 if(e.event==='FSSAllBodiesFound'){j.fss=true;if(!j.fssTime||when>j.fssTime)j.fssTime=when;}
 if(e.event==='Scan'){
  const b=normalBody(e),key=bodyKey(e),prior=j.bodies[key];
  if(key&&(!prior||b.detailed&&!prior.detailed||b.detailed===prior.detailed&&(!prior.timestamp||Date.parse(when)>=Date.parse(prior.timestamp))))j.bodies[key]={...b,timestamp:when,mapped:b.mapped||!!prior?.mapped};
  j.expectedBelts=[...new Set([...j.expectedBelts,...b.rings])];
  if(b.belt)j.resolvedBelts=[...new Set([...j.resolvedBelts,beltName(b.name)])];
 }
 if(e.event==='SAAScanComplete'){const b=j.bodies[bodyKey(e)];if(b)b.mapped=true;}
 return at;
}
function validateApp(app){
 if(!app||app.schema!==1||!Array.isArray(app.surveys))throw Error('Unsupported survey backup format.');
 if(app.anchorLists!==undefined){
  if(!Array.isArray(app.anchorLists))throw Error('Invalid saved anchor lists.');
  app.anchorLists.forEach(validateAnchorList);
  if(new Set(app.anchorLists.map(x=>x.id)).size!==app.anchorLists.length)throw Error('Duplicate saved anchor-list identifiers.');
 }
 for(const s of app.surveys){if(!s.id||!Array.isArray(s.levels)||!s.levels.every(m=>MASSES.includes(m)&&m.length===1&&MASSES.indexOf(m)<=MASSES.indexOf(s.anchor?.mass))||!Array.isArray(s.excluded)||!s.boxes||!s.policy)throw Error('Invalid survey structure.');
  if(!s.policy.providers?.every(p=>['edsm','spansh'].includes(p)))throw Error('Invalid catalogue provider.');
  if(!parseName(systemName(s.anchor,0))||!Number.isSafeInteger(s.activeBox)||!boxAt(s,s.activeBox))throw Error('Invalid anchor or active boxel.');
  if(!Array.isArray(s.anchors)||!s.source||!Array.isArray(s.extraParents)||new Set(s.levels).size!==s.levels.length)throw Error('Invalid scope snapshot.');
  if(s.extraParents.some(p=>!p||MASSES.indexOf(p.mass)<=MASSES.indexOf(s.anchor.mass)||ancestor(s.anchor,p.mass).key!==p.key)||new Set(s.extraParents.map(p=>p.key)).size!==s.extraParents.length)throw Error('Invalid parent selection.');
  if(new Set(s.excluded).size!==s.excluded.length||s.excluded.some(i=>!Number.isSafeInteger(i)||i<0||i>=scopeCount(s))||s.excluded.length>=scopeCount(s))throw Error('Invalid excluded boxels.');
  if(!Number.isFinite(s.policy.staleDays)||s.policy.staleDays<0)throw Error('Invalid age policy.');
  for(const [key,m]of Object.entries(s.boxes)){const b=boxAt(s,Number(key));if(!b||!Number.isInteger(m.cursor)||m.cursor<0||m.cursor>maxSuffix(b.mass)||!(m.end===null||Number.isInteger(m.end)&&m.end>=0&&m.end<=maxSuffix(b.mass)))throw Error('Invalid boxel bounds or cursor.');
   for(const [seq,r]of Object.entries(m.records||{}))if(!Number.isSafeInteger(Number(seq))||Number(seq)<0||r.seq!==Number(seq)||!r.catalogues||!r.journal||m.end!==null&&Number(seq)>m.end)throw Error('Invalid system record.');
  }
 }if(app.activeId&&!app.surveys.some(s=>s.id===app.activeId))throw Error('The active survey is missing.');return app;
}
const api={MASSES,norm,clone,parseName,systemName,boxFromXYZ,ancestor,parents,descendant,inputNames,deriveAnchors,saveAnchorList,draftFromAnchorList,restoreAnchorLists,scopeSections,scopeCount,boxAt,boxIndex,isIncluded,metadata,newSurvey,setBound,recordAt,normalBody,beltName,localStatus,personalStatus,confirmFullScan,catalogueTime,catalogueDateLabel,catalogueStatus,safeId,outcome,boxStats,surveyStats,move,iterateBoxel,advanceOnArrival,applyJournal,validateApp,maxSuffix};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SurveyCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);

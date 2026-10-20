/* JACoB SDK adapters. The host owns files, journal detection, input and overlays. */
(function(root){
'use strict';
const C=typeof module!=='undefined'&&module.exports?require('./model.js'):root.SurveyCore;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function pack(text){
 if(typeof CompressionStream==='undefined')return{text,encoding:'json'};
 const bytes=new Uint8Array(await new Response(new Blob([text]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
 let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return{text:btoa(binary),encoding:'gzip-base64'};
}
async function unpack(text,encoding){
 if(!encoding||encoding==='json')return text;
 if(encoding!=='gzip-base64'||typeof DecompressionStream==='undefined')throw Error('This browser cannot decode the saved compressed survey. Use a current Chrome or Edge browser.');
 const binary=atob(text),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
 return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}
async function importBackup(data){
 if(data?.format==='systematic-survey-reset-backup'){
  // Keep both the visible workspace and the last persisted snapshot in reset
  // backups. A corrupt workspace can still leave useful raw recovery evidence.
  if(data.workspace)return C.validateApp(data.workspace);
  if(!data.storage?.manifest)return C.validateApp({schema:1,surveys:[],activeId:null});
  data=JSON.parse(await unpack(data.storage.chunks.join(''),data.storage.manifest.encoding));
 }
 return C.validateApp(data);
}
function createBridge(Elite,notify=()=>{}){
 let callTail=Promise.resolve(),lastCall=0,saveTail=Promise.resolve(),manifest=null,plotToken=0,storeTail=Promise.resolve(),lastStoreCall=-Infinity,idHelpersAvailable=true,clipboardConfig=null;
 const owner=globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2);
 // JACoB rejects repeated CAS/batch mutations less than 50 ms apart. Pace
 // separate saves as well as cleanup; retry only explicitly rejected requests.
 const storeCall=fn=>{
  const p=storeTail.catch(()=>{}).then(async()=>{
   for(let attempt=0;;attempt++){
    await wait(Math.max(0,75-(performance.now()-lastStoreCall)));
    try{return await fn();}catch(e){if(e.code!=='RATE_LIMITED'||attempt>=2)throw e;await wait(250*(attempt+1));}
    finally{lastStoreCall=performance.now();}
   }
  });storeTail=p;return p;
 };
 const serial=fn=>{const p=callTail.catch(()=>{}).then(async()=>{await wait(Math.max(0,130-(Date.now()-lastCall)));lastCall=Date.now();return fn();});callTail=p;return p;};
 function json(res){
  if(res.status<200||res.status>=300)throw Error(`Catalogue returned HTTP ${res.status}.`);
  // Prefer raw JSON so ID64 does not pass through a JavaScript floating point number.
  if(typeof res.body==='string'&&res.body.trim())return JSON.parse(res.body.replace(/("(?:id64|SystemAddress)"\s*:\s*)(\d+)/g,'$1"$2"'));
  if(res.json!==undefined)return res.json;throw Error('Catalogue response contained no JSON data.');
 }
 async function fetchJSON(url,provider,options={}){
  const r=await serial(()=>Elite.net.fetchQueued(url,{method:'GET',headers:{Accept:'application/json'},group:`survey:${provider}`,minIntervalMs:600,retry:0,cacheTtlMs:60000,...options}));
  if(r.status===404)return null;return json(r);
 }
 async function load(){
  clipboardConfig=await Elite.store.get('survey.clipboardHelper',null);
  manifest=await Elite.store.get('survey.manifest',null);if(!manifest)return{schema:1,surveys:[],activeId:null};
  if(manifest.schema!==1||!Number.isInteger(manifest.chunks)||manifest.chunks<1||manifest.chunks>32)throw Error('Invalid saved survey manifest. Existing data has been left intact.');
  const parts=[];for(let i=0;i<manifest.chunks;i++){const p=await Elite.store.get('survey.chunk.'+i,null);if(typeof p!=='string')throw Error(`Saved survey chunk ${i+1} is missing. Restore a backup before continuing.`);parts.push(p);}
  return C.validateApp(JSON.parse(await unpack(parts.join(''),manifest.encoding)));
 }
 function save(app){
  const snapshot=JSON.stringify(app);
  const p=saveTail.catch(()=>{}).then(async()=>{
   const packed=await pack(snapshot),bytes=new TextEncoder().encode(packed.text).length;
   if(bytes>1750000)throw Error('JACoB’s tab storage is nearly full. Export a backup and remove a finished survey before continuing. No progress was discarded.');
   const parts=[];for(let i=0;i<packed.text.length;i+=65000)parts.push(packed.text.slice(i,i+65000));
   const ops=parts.map((value,i)=>({op:'set',key:'survey.chunk.'+i,value}));
   for(let i=parts.length;i<(manifest?.chunks||0);i++)ops.push({op:'delete',key:'survey.chunk.'+i});
   const next={schema:1,chunks:parts.length,bytes,encoding:packed.encoding,revision:(manifest?.revision||0)+1,updated:new Date().toISOString()};ops.push({op:'set',key:'survey.manifest',value:next});
   const canLock=!!Elite.store.update;let committed=false;
   if(canLock){const lease=await storeCall(()=>Elite.store.update('survey.writeLease',old=>old&&old.owner!==owner&&old.until>Date.now()?old:{owner,until:Date.now()+30000}));if(lease?.owner!==owner)throw Error('Another window is saving this tab. Wait a moment and try again.');}
   try{const latest=await Elite.store.get('survey.manifest',null);if((latest?.revision||0)!==(manifest?.revision||0))throw Error('This survey was changed in another window. Export your unsaved work, then reload.');
    // Commit the snapshot and release its lock together. A successful save
    // must not be reported as failed because of a separate cleanup request.
    if(canLock)ops.push({op:'set',key:'survey.writeLease',value:null});
    await storeCall(()=>Elite.store.batch(ops));manifest=next;committed=true;return bytes;
   }finally{if(canLock&&!committed)try{await storeCall(()=>Elite.store.update('survey.writeLease',old=>old?.owner===owner?null:old));}catch{/* Preserve the save error. This view can reclaim its own lease on retry. */}}
  });saveTail=p;return p;
 }
 function reset(app,backup){
  const snapshot=JSON.stringify(C.validateApp(app));
  if(typeof backup!=='function')throw Error('A backup must be created before resetting this tab.');
  const p=saveTail.catch(()=>{}).then(async()=>{
   const packed=await pack(snapshot),canLock=!!Elite.store.update;let committed=false;
   if(canLock){const lease=await storeCall(()=>Elite.store.update('survey.writeLease',old=>old&&old.owner!==owner&&old.until>Date.now()?old:{owner,until:Date.now()+30000}));if(lease?.owner!==owner)throw Error('Another window is saving this tab. Wait a moment and try again.');}
   try{
    const previous=await Elite.store.get('survey.manifest',null),chunks=[];
    // Read all possible chunks, even if the manifest is damaged. Reset remains
    // usable after load failure, and the recovery download preserves raw data.
    for(let i=0;i<32;i++)chunks.push(await Elite.store.get('survey.chunk.'+i,null));
    await backup({manifest:previous,chunks});
    const next={schema:1,chunks:1,bytes:new TextEncoder().encode(packed.text).length,encoding:packed.encoding,revision:Number.isSafeInteger(previous?.revision)?previous.revision+1:Date.now(),updated:new Date().toISOString()};
    const ops=[{op:'set',key:'survey.chunk.0',value:packed.text},{op:'set',key:'survey.manifest',value:next}];
    for(let i=1;i<32;i++)ops.push({op:'delete',key:'survey.chunk.'+i});
    ops.push({op:'set',key:'survey.writeLease',value:null});
    await storeCall(()=>Elite.store.batch(ops));manifest=next;committed=true;return next.bytes;
   }finally{if(canLock&&!committed)try{await storeCall(()=>Elite.store.update('survey.writeLease',old=>old?.owner===owner?null:old));}catch{}}
  });saveTail=p;return p;
 }
 async function route(){
  const result=await Elite.data.get('navRoute');const rows=result?.data?.Route;
  return result?.found&&Array.isArray(rows)?rows.map(r=>({name:r.StarSystem,id64:C.safeId(r.SystemAddress),pos:r.StarPos})).filter(r=>r.name):[];
 }
 async function history(onEvent,all=false,cursors={},stopped=()=>false){
  const index=await Elite.journal.files();let files=(index.files||[]).map(x=>typeof x==='string'?x:x.file).filter(Boolean).sort();
  if(!files.length)throw Error('No journal files detected. Configure the journal directory in JACoB.');
  const last=Object.keys(cursors).sort().at(-1);
  if(!all)files=last?files.filter(f=>f>=last):files.slice(-1);let count=0;
  for(const [index,file] of files.entries()){if(stopped())break;notify(`Reading journal ${index+1} of ${files.length}…`);let offset=all?0:(cursors[file]||0);for(;;){if(stopped())break;const page=await serial(()=>Elite.journal.read({file,offset,limit:1000}));
   for(const e of page.events||[]){onEvent(e);count++;}
   cursors[file]=offset+(page.events||[]).length;
   if(!page.info?.truncated)break;const next=page.info.nextOffset;if(!Number.isInteger(next)||next<=offset)throw Error('Journal pagination did not advance.');offset=next;
  }}return count;
 }
 function rejectedValidID(e,id){
  // Some JACoB builds inject /^d+$/ instead of the intended digit regex.
  // Fall back only for that exact rejection of a valid uint64. Do not turn
  // IDs into Numbers: higher addresses would silently lose precision.
  if(e?.code!=='BAD_PARAMS'||e.message!=='id64 must be an unsigned decimal integer string'||!C.safeId(id)||BigInt(id)>18446744073709551615n)return false;
  idHelpersAvailable=false;return true;
 }
 async function sequenceAddress(s,i,seq){
  const reference=C.referenceAddress(s,i),expected=C.addressAt(s,i,seq);if(!expected)return '';
  if(idHelpersAvailable&&Elite.galaxy?.addressForSequence){
   try{const id=C.safeId(await serial(()=>Elite.galaxy.addressForSequence(reference.id,seq)));
    if(id!==expected)throw Error('Calculated address disagrees with the saved boxel.');return id;
   }catch(e){if(!rejectedValidID(e,reference.id))throw e;}
  }return expected;
 }
 function verifyIdentity(raw,id,name){
  const supplied=raw?.id64??raw?.systemAddress;
  if(supplied!==undefined&&C.safeId(supplied)!==id)throw Error('Catalogue returned a different system address.');
  if(raw?.name&&C.norm(raw.name)!==C.norm(name)){
   if(C.safeId(supplied)!==id)throw Error('Alternate catalogue name has no matching system address.');
   const p=C.parseName(raw.name),a=C.addressParts(id);
   if(p&&(!a||p.mass!==a.mass||p.seq!==a.seq))throw Error('Alternate catalogue name disagrees with its system address.');
  }
 }
 async function spansh(s,i,seq){
  const b=C.boxAt(s,i),r=C.recordAt(s,i,seq),name=C.systemName(b,seq);let id=r.id64||await sequenceAddress(s,i,seq);
  if(!id){
   // Search ranks broad name matches. Inspect one relevance-ranked page only;
   // alphabetic sorting and pagination cannot establish exact-name absence.
   const found=await fetchJSON('https://spansh.co.uk/api/systems/search','spansh',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:{filters:{name:{value:name}},size:10,page:0}});
   if(!found||!Array.isArray(found.results))throw Error('Spansh search response was not recognised.');
   const rows=found.results.slice(0,10),exact=rows.find(x=>C.norm(x.name)===C.norm(name));
   if(exact){id=C.safeId(exact.id64);if(!id)throw Error('Spansh exact match did not provide a safe system address.');}
   if(!id){
    // A listed sibling supplies address bits, not evidence that our target
    // exists. Reject other sectors, invalid IDs and name/address disagreement.
    const sibling=rows.find(x=>{
     const p=C.parseName(x.name),address=C.safeId(x.id64);if(!p||p.key!==b.key||!address)return false;
     const bits=BigInt(address),mass=Number(bits&7n),shift=BigInt(44-3*mass),width=BigInt(11+3*mass);
     return bits>0n&&bits<(1n<<55n)&&C.MASSES[mass]===p.mass&&Number((bits>>shift)&((1n<<width)-1n))===p.seq;
    });
    if(sibling){C.metadata(s,i).referenceId=C.safeId(sibling.id64);id=await sequenceAddress(s,i,seq);}
   }
   if(!id)return{state:'unknown',quality:'No exact match in top 10',searchLimited:true,checked:new Date().toISOString()};
  }
  if(!id)throw Error('Spansh did not provide an exact system address.');
  let raw;
  if(idHelpersAvailable&&Elite.catalog?.system?.get){
   try{const res=await serial(()=>Elite.catalog.system.get({id64:id,provider:'spansh',detail:'full'}));if(!res.found)return{state:'absent',checked:new Date().toISOString()};raw=res.record;}
   catch(e){if(!rejectedValidID(e,id))throw e;}
  }
  if(!idHelpersAvailable||!Elite.catalog?.system?.get){const res=await fetchJSON('https://spansh.co.uk/api/system/'+id,'spansh');if(!res)return{state:'absent',checked:new Date().toISOString()};raw=res.record;}
  if(!raw||!raw.name)throw Error('Spansh system record was not recognised.');
  verifyIdentity(raw,id,name);
  r.id64=id;r.alias=raw.name;C.metadata(s,i).referenceId=id;
  const dump=await fetchJSON('https://spansh.co.uk/api/dump/'+id,'spansh');
  if(!dump?.system)return{...C.catalogueStatus({...raw,id64:id}),complete:false,quality:'Body detail unavailable'};
  verifyIdentity(dump.system,id,raw.name);
  // Trust the requested system address; preserve the original expected denominator.
  const full={...raw,...dump.system,id64:id,bodyCount:raw.bodyCount??raw.body_count??dump.system.bodyCount};
  return C.catalogueStatus(full);
 }
 const discoveryRequests=new WeakMap();
 function edsmName(s,i,seq){
  const r=C.recordAt(s,i,seq),known=r.catalogues.edsm;
  return known?.state==='present'&&known.id64===r.id64&&known.name?known.name:r.alias||C.systemName(C.boxAt(s,i),seq);
 }
 async function edsmDiscovery(s,i,seq,{stopped=()=>false}={}){
  const r=C.recordAt(s,i,seq,false);if(!r||!s.policy.providers.includes('edsm')||r.catalogues.edsm?.state!=='present'||stopped())return;
  const name=edsmName(s,i,seq),cached=r.edsmDiscovery;
  if(cached?.name===name&&(cached.commander||Date.now()-Date.parse(cached.checked)<(cached.error?60000:86400000)))return cached;
  if(discoveryRequests.has(r))return discoveryRequests.get(r);
  const request=(async()=>{
   try{
    const raw=await fetchJSON('https://www.edsm.net/api-system-v1/traffic?systemName='+encodeURIComponent(name),'edsm');
    if(stopped())return;
    if(!raw||C.norm(raw.name)!==C.norm(name)||r.id64&&C.safeId(raw.id64)!==r.id64)throw Error('EDSM attribution response did not match this system.');
    const commander=typeof raw.discovery?.commander==='string'?raw.discovery.commander.trim().replace(/[\u0000-\u001f\u007f]/g,' '):'';
    // This is EDSM system discovery attribution, never body discovery or visit evidence.
    return r.edsmDiscovery={name,commander,date:C.catalogueTime(raw.discovery?.date),checked:new Date().toISOString()};
   }catch(e){if(!stopped())return r.edsmDiscovery={name,commander:'',checked:new Date().toISOString(),error:e.message||String(e)};}
  })();
  discoveryRequests.set(r,request);try{return await request;}finally{discoveryRequests.delete(r);}
 }
 async function edsmBatch(s,i,sequences){
  const names=sequences.map(seq=>edsmName(s,i,seq));
  const query=names.map(n=>'systemName[]='+encodeURIComponent(n)).join('&');
  const data=await fetchJSON('https://www.edsm.net/api-v1/systems?showId=1&showCoordinates=1&includeHidden=1&'+query,'edsm');
  if(!Array.isArray(data))throw Error('EDSM batch response was not an array; absence cannot be established.');
  const out=new Map();
  for(let k=0;k<sequences.length;k++){
   const seq=sequences[k],r=C.recordAt(s,i,seq),hit=data.find(x=>C.norm(x.name)===C.norm(names[k])||(r.id64&&C.safeId(x.id64)===r.id64));
   if(!hit){out.set(seq,{state:'absent',checked:new Date().toISOString()});continue;}
   if(hit.mergedTo){out.set(seq,{state:'unknown',quality:'Renamed catalogue entry; identity needs resolution',checked:new Date().toISOString()});continue;}
   try{verifyIdentity(hit,r.id64||C.safeId(hit.id64),names[k]);}catch(e){out.set(seq,{state:'error',error:e.message,checked:new Date().toISOString()});continue;}
   if(C.safeId(hit.id64))r.id64=C.safeId(hit.id64);
   try{const detail=await fetchJSON('https://www.edsm.net/api-system-v1/bodies?systemName='+encodeURIComponent(hit.name),'edsm');
    if(!detail||!Array.isArray(detail.bodies)){out.set(seq,{...C.catalogueStatus(hit),complete:false,quality:'Body detail unavailable'});continue;}
    verifyIdentity(detail,r.id64,hit.name);
    out.set(seq,C.catalogueStatus({...hit,...detail}));
   }catch(e){out.set(seq,{...C.catalogueStatus(hit),complete:false,quality:'Body detail request failed',error:e.message});}
  }return out;
 }
 async function check(s,i,sequences,{stopped=()=>false,updated=()=>{},force=false}={}){
  const error=e=>({state:'error',error:e.message||String(e),checked:new Date().toISOString()});
  const fresh=(r,p)=>{const c=r.catalogues[p];return !force&&c&&!(c.needsDetails&&needsDetails(s,r))&&(['present','absent'].includes(c.state)||c.state==='unknown'&&c.bulkSearch)&&Date.now()-Date.parse(c.checked)<60000;};
  for(let start=0;start<sequences.length&&!stopped();start+=25){
   const chunk=sequences.slice(start,start+25);
   if(s.policy.providers.includes('edsm')&&!stopped()){
    const wanted=chunk.filter(seq=>{const r=C.recordAt(s,i,seq);return r&&!fresh(r,'edsm');});
    if(wanted.length){notify(`Checking EDSM · ${wanted.length} system${wanted.length===1?'':'s'}`);try{const results=await edsmBatch(s,i,wanted);for(const [seq,status]of results)C.recordAt(s,i,seq).catalogues.edsm=status;}catch(e){for(const seq of wanted)C.recordAt(s,i,seq).catalogues.edsm=error(e);}updated();}
   }
   const renamed=[];
   if(s.policy.providers.includes('spansh'))for(const seq of chunk){if(stopped())break;const r=C.recordAt(s,i,seq);if(!r||fresh(r,'spansh'))continue;const before=r.alias||C.systemName(C.boxAt(s,i),seq);
    notify(`Checking Spansh · ${C.systemName(C.boxAt(s,i),seq)}`);try{r.catalogues.spansh=await spansh(s,i,seq); }catch(e){r.catalogues.spansh=error(e);updated();
     if((e.code==='TIMEOUT'||/timed? ?out|HTTP 5[0-9][0-9]/i.test(e.message||''))&&seq!==sequences.at(-1))throw Error('Spansh is not responding reliably. Batch paused; completed results are retained. Retry Check target later.');
    }finally{if(r.alias&&C.norm(r.alias)!==C.norm(before)&&!(r.catalogues.edsm?.state==='present'&&r.catalogues.edsm.id64===r.id64)){
     renamed.push(seq);if(s.policy.providers.includes('edsm'))r.catalogues.edsm={state:'unknown',quality:'Alternate name resolved; EDSM recheck pending',checked:new Date().toISOString()};
    }updated();}
   }
   if(renamed.length&&s.policy.providers.includes('edsm')&&!stopped()){
    notify('Checking EDSM under verified alternate names…');
    try{for(const [seq,status]of await edsmBatch(s,i,renamed))C.recordAt(s,i,seq).catalogues.edsm=status;}
    catch(e){for(const seq of renamed)C.recordAt(s,i,seq).catalogues.edsm=error(e);}updated();
   }
  }
 }
 function needsDetails(s,r){
  return !C.localStatus(r).complete&&!(s.policy.ignoreVisited&&r.journal.visited)&&!s.policy.visitAll&&s.policy.providers.length>0&&s.policy.providers.every(p=>r.catalogues[p]?.state==='present');
 }
 async function checkBoxel(s,i,{stopped=()=>false,updated=()=>{}}={}){
  const b=C.boxAt(s,i),m=C.metadata(s,i),end=m.end;
  if(!b||!Number.isSafeInteger(end)||end<0)throw Error('Set the final suffix before checking an entire boxel.');
  const providers=['edsm','spansh'].filter(p=>s.policy.providers.includes(p)),policy=JSON.stringify(s.policy),hits={},errors=[];
  const prefixOf=box=>box.prefix+(box.n1?'-':'');
  const prefixes=new Set([prefixOf(b)]),reference=C.referenceAddress(s,i);
  // Query observed aliases in bulk, never rename all siblings from one sample.
  // Other systems in the alternate region are accepted only by physical ID.
  for(const r of Object.values(m.records)){
   const p=C.parseName(r.alias),a=C.addressParts(r.id64);if(p&&a&&reference?.cell===a.cell&&a.seq===r.seq&&p.mass===b.mass&&p.seq===r.seq)prefixes.add(prefixOf(p));
  }
  const changed=()=>stopped()||m.end!==end||!C.isIncluded(s,i)||JSON.stringify(s.policy)!==policy;
  const failed=e=>({state:'error',error:e.message||String(e),checked:new Date().toISOString()});
  // Presence is discovered once per provider, before any body detail requests.
  for(const provider of providers){
   if(changed())return;notify(`Finding ${provider==='edsm'?'EDSM':'Spansh'} systems in ${b.prefix}…`);
   try{
    const found=new Map();for(const prefix of prefixes){
     if(changed())return;
     const data=provider==='edsm'?await fetchJSON('https://www.edsm.net/api-v1/systems?showId=1&includeHidden=1&systemName='+encodeURIComponent(prefix),'edsm'):
      await fetchJSON('https://spansh.co.uk/api/systems/search','spansh',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:{filters:{name:{value:prefix}},sort:[],size:end+11,page:0}});
     const rows=provider==='edsm'?data:data?.results;
     if(!Array.isArray(rows)||rows.some(x=>!x||typeof x.name!=='string'))throw Error('Bulk catalogue response was not recognised.');
     if(m.end!==end||!C.isIncluded(s,i))return;
     const currentReference=C.referenceAddress(s,i);
     for(const row of rows){const p=C.parseName(row.name),id=C.safeId(row.id64),a=C.addressParts(id);if(!p||p.seq>end)continue;
      const same=p.key===b.key,physical=a&&currentReference?.cell===a.cell&&a.seq===p.seq&&p.mass===b.mass;
      if(!same&&!physical)continue;
      const prior=found.get(p.seq);
      if(prior&&C.safeId(prior.id64)&&id&&C.safeId(prior.id64)!==id)throw Error('Catalogue returned conflicting system addresses for one suffix.');
      if(!prior||prior.mergedTo&&!row.mergedTo||physical&&!same)found.set(p.seq,row);
     }
    }
    hits[provider]=found;
    for(let seq=0;seq<=end;seq++){
     const r=C.recordAt(s,i,seq),hit=found.get(seq),checked=new Date().toISOString();if(!r)continue;
     if(!hit){r.catalogues[provider]=provider==='edsm'?{state:'absent',checked}:{state:'unknown',quality:'Not found in boxel search',searchLimited:true,bulkSearch:true,checked};continue;}
     if(hit.mergedTo){r.catalogues[provider]={state:'unknown',quality:'Renamed catalogue entry; identity needs resolution',checked};continue;}
     const id=C.safeId(hit.id64);
     if(id&&r.id64&&id!==r.id64){r.catalogues[provider]={state:'error',error:'Catalogue address disagrees with the saved system address.',checked};continue;}
     if(id){r.id64=id;if(C.norm(hit.name)!==C.norm(C.systemName(b,seq)))r.alias=hit.name;}
     r.catalogues[provider]={...C.catalogueStatus(hit,checked),complete:false,quality:'Present; scan details not requested',needsDetails:true};
    }
   }catch(e){errors.push(provider+': '+e.message);for(let seq=0;seq<=end;seq++){const r=C.recordAt(s,i,seq);if(r)r.catalogues[provider]=failed(e);}}
   updated();
  }
  if(changed())return;
  if(errors.length)throw Error('Bulk checks incomplete; successful results retained. '+errors.join(' '));
  for(let seq=0;seq<=end&&!changed();seq++){
   const r=C.recordAt(s,i,seq);if(!r||!needsDetails(s,r))continue;
   for(const provider of providers){
    if(changed())return;const hit=hits[provider].get(seq);notify(`Checking scan details · ${provider==='edsm'?'EDSM':'Spansh'} · ${hit.name}`);
    try{
     const id=C.safeId(hit.id64);if(provider==='spansh'&&!id)throw Error('Spansh did not provide a safe system address.');
     const data=await fetchJSON(provider==='edsm'?'https://www.edsm.net/api-system-v1/bodies?systemName='+encodeURIComponent(hit.name):'https://spansh.co.uk/api/dump/'+id,provider);
     const detail=provider==='edsm'?data:data?.system;
     if(!detail||!Array.isArray(detail.bodies))throw Error('Body detail response was not recognised.');
     verifyIdentity(detail,id,hit.name);
     r.catalogues[provider]=C.catalogueStatus({...hit,...detail,id64:id||detail.id64,bodyCount:hit.bodyCount??hit.body_count??detail.bodyCount??detail.body_count});
    }catch(e){r.catalogues[provider]={...r.catalogues[provider],complete:false,quality:'Body detail request failed',error:e.message,needsDetails:true};updated();
     if(e.code==='TIMEOUT'||/timed? ?out|HTTP 5[0-9][0-9]/i.test(e.message||''))throw Error('Catalogue detail checks paused; completed results retained. '+e.message);
    }
    updated();
   }
  }
 }
 let clipboardTail=Promise.resolve(),overlayDescription='Centered green text; HUD2 effects activate on compatible JACoB versions.';
 function validateClipboardConfig(config){
  if(config?.format!=='survey-clipboard-helper'||config.transport!=='jacob-store-v1'||!/^[a-f0-9]{64}$/.test(config.token||''))throw Error('Choose the connection.json file created by the current survey clipboard helper installer.');
  return{format:config.format,transport:config.transport,token:config.token};
 }
 function clipboardRequest(action,body,config=clipboardConfig){
  const task=clipboardTail.catch(()=>{}).then(async()=>{
   validateClipboardConfig(config);
   const id=owner+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),expiresAt=Date.now()+10000;
   await storeCall(()=>Elite.store.batch([{op:'set',key:'survey.clipboardRequest',value:{id,action,...body,expiresAt,token:config.token}}]));
   while(Date.now()<expiresAt){
    const result=await Elite.data.get('SurveyClipboardStatus.json'),reply=result?.data;
    if(result?.found&&reply?.requestId===id){if(!reply.ok)throw Error(reply.error||'The helper could not copy the target.');return reply;}
    await wait(250);
   }
   throw Error('Clipboard helper did not respond. Start the Survey Clipboard Helper shortcut and check its journal-folder setting, then retry.');
  });clipboardTail=task;return task;
 }
 async function configureClipboard(config){
  const validated=validateClipboardConfig(config);await clipboardRequest('health',{},validated);
  await storeCall(()=>Elite.store.batch([{op:'set',key:'survey.clipboardHelper',value:validated}]));clipboardConfig=validated;
 }
 async function disconnectClipboard(){
  await clipboardTail.catch(()=>{});await storeCall(()=>Elite.store.batch([{op:'delete',key:'survey.clipboardHelper'},{op:'delete',key:'survey.clipboardRequest'}]));clipboardConfig=null;
 }
 async function copy(text){
  if(clipboardConfig&&text.length<=16384){await clipboardRequest('clipboard',{text});return 'helper';}
  // Adapted from BOXEL-surveyer: execCommand remains useful in sandboxed saved tabs.
  const ta=document.createElement('textarea');ta.value=text;ta.readOnly=true;ta.style.cssText='position:fixed;left:-9999px;top:0';document.body.appendChild(ta);ta.focus({preventScroll:true});ta.select();ta.setSelectionRange(0,ta.value.length);
  let ok=false;try{ok=document.execCommand('copy');}catch{}ta.remove();
  if(!ok&&globalThis.navigator?.clipboard?.writeText){await navigator.clipboard.writeText(text);ok=true;}
  if(!ok)throw Error('Browser clipboard access failed. Connect the local clipboard helper for automatic copying while Elite has focus.');return 'browser';
 }
 async function overlay(s,enabled){
  if(!enabled)return Elite.overlay.clear();const b=C.boxAt(s,s.activeBox),m=C.metadata(s,s.activeBox),st=C.boxStats(s,s.activeBox),overall=C.surveyStats(s),r=C.recordAt(s,s.activeBox,m.cursor,false);
  const progress=stats=>stats.total===null?`${stats.handled} handled; end unknown`:`${stats.handled}/${stats.total} (${stats.percent.toFixed(1)}%)`;
  const sections=[`Total survey: ${progress(overall)}`,`Current boxel survey: ${b.prefix} - ${progress(st)}`,`Next: ${r?.alias||C.systemName(b,m.cursor)}`,...s.policy.providers.map(p=>{
   const c=r?.catalogues[p],who=p==='edsm'&&c?.state==='present'?r?.edsmDiscovery?.commander:'',date=C.catalogueTime(c?.latestBodyUpdate);
   return `${p==='edsm'?'EDSM':'Spansh'}: ${c?.state||'unchecked'}${who?' ['+who+']':''}${date?' · body update '+C.catalogueDateLabel(date):''}`;
  })];
  if(s.liveSystem&&!s.liveSystem.outside&&Number.isSafeInteger(s.liveSystem.i)&&Number.isSafeInteger(s.liveSystem.seq)){const current=C.recordAt(s,s.liveSystem.i,s.liveSystem.seq,false);if(current)sections.push(`Here: ${C.localStatus(current).label}`);}
  else if(s.liveSystem?.outside&&s.liveSystem.name)sections.push(`Here: ${s.liveSystem.name} (outside survey)`);
  const text=sections.join(' | ');let fontSize=18,hud2=false;
  // Keep the whole HUD in the top strip, with room for the game's corner UI.
  // HUD2 smooths text and supports font/effect controls. Older hosts keep a
  // centered green line with their existing renderer.
  try{const info=await Elite.overlay.info?.();hud2=info?.hudVersion>=2;if(info?.width>0){
   let textWidth=text.length*9;
   if(typeof document!=='undefined'){const ctx=document.createElement('canvas').getContext('2d');if(ctx){ctx.font=(hud2?'600 ':'')+'18px "Segoe UI"';textWidth=ctx.measureText(text).width;}}
   fontSize=Math.max(6,Math.min(18,Math.floor(18*info.width*.86/(textWidth*1.05))));
  }}catch{/* Overlay info is optional; use the standard 18 px size. */}
  overlayDescription=hud2?'HUD2: smooth green text, dark outline and subtle glow.':'Legacy renderer: centered green text. Update JACoB for smooth HUD2 text, outlines and glow.';
  const effects=hud2?{fontFamily:'Segoe UI',fontWeight:600,opacity:1,outlineWidth:1.5,outlineColor:'#001408E6',shadowX:1,shadowY:1,shadowColor:'#000000B0',glow:1,glowColor:'#42FF8060'}:{};
  return Elite.overlay.set({z:20,space:'normalized',...(hud2?{theme:'highcontrast',opacity:1,scale:1}:{}),items:[{type:'text',x:.5,y:.004,text,color:'#65FF9A',fontSize,align:'center',...effects}]});
 }
 function stopPlot(){plotToken++;}
 async function plot(name){
  // Input sequence adapted from the upstream route queue; success requires a
  // NEW NavRoute whose final destination matches, not an intermediate FSDTarget.
  const token=++plotToken;let actual='',off;
  const check=()=>{if(token!==plotToken)throw Error('Plotting cancelled.');};
  const press=async n=>{check();await Elite.bindings.press(n);};
  try{
   const health=await Elite.system.health();if(health?.status==='blocked')throw Error((health.blockers||['Game input unavailable']).join('; '));
   off=Elite.data.subscribe('navRoute',u=>{const rows=u.data?.Route;if(rows?.length)actual=rows[rows.length-1].StarSystem||'';});
   await press('GalaxyMapOpen');await wait(1400);await press('UI_Up');await wait(180);await press('UI_Select');await wait(260);
   check();await Elite.input.text(name,{intervalMs:18});await wait(250);await press('UI_Down');await wait(170);await press('UI_Select');await wait(1000);
   await press('MoveFreeCamRight');await wait(140);await press('UI_Right');await wait(180);for(let i=0;i<7;i++){await press('UI_Down');await wait(90);}
   await press('UI_Select');await wait(600);await press('GalaxyMapOpen');
   for(let i=0;i<20&&!actual;i++){check();await wait(250);}
   if(C.norm(actual)!==C.norm(name))throw Error(actual?`Route ended at ${actual}; requested ${name}.`:'No matching route confirmation arrived. Check GalMap.');
   return actual;
  }finally{off?.();}
 }
 return{load,save,reset,route,history,check,checkBoxel,copy,configureClipboard,disconnectClipboard,hasClipboardHelper:()=>!!clipboardConfig,overlayDescription:()=>overlayDescription,overlay,plot,stopPlot,fetchJSON,edsmBatch,edsmDiscovery,spansh};
}
if(typeof module!=='undefined'&&module.exports)module.exports={createBridge,importBackup};else root.SurveyBridge={createBridge,importBackup};
})(typeof globalThis!=='undefined'?globalThis:this);

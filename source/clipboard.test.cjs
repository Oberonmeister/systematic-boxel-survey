const test=require('node:test'),assert=require('node:assert/strict'),{createBridge}=require('./bridge.js');
function setup({native=true,available=true,helper=true,write=async()=>({written:true}),info}={}){
 const db=helper?{'survey.clipboardHelper':{format:'survey-clipboard-helper',transport:'jacob-store-v1',token:'a'.repeat(64)}}:{},calls={native:[],helper:[],info:0};
 const sdk={store:{get:async(k,f)=>db[k]??f,batch:async ops=>{for(const o of ops){if(o.op==='delete')delete db[o.key];else db[o.key]=o.value;if(o.key==='survey.clipboardRequest')calls.helper.push(o.value);}}},data:{get:async()=>({found:true,data:{requestId:db['survey.clipboardRequest'].id,ok:true}})}};
 if(native)sdk.clipboard={info:async()=>{calls.info++;return info?info():{available,maxTextBytes:16384,backend:'test'};},writeText:async text=>{calls.native.push(text);return write(text);}};
 return{sdk,calls,bridge:createBridge(sdk)};
}
function fakeBrowser(){const saved=globalThis.document,copies=[];let element;globalThis.document={body:{appendChild(){}},createElement:()=>element={style:{},focus(){},select(){},setSelectionRange(){},remove(){}},execCommand:()=>{copies.push(element.value);return true;}};return{copies,restore:()=>{if(saved===undefined)delete globalThis.document;else globalThis.document=saved;}};}

test('native discovery is read-only; native copying wins over an already paired helper',async()=>{
 const {bridge,calls}=setup();await bridge.load();await bridge.refreshClipboard();assert.equal(calls.native.length,0);assert.equal(calls.helper.length,0);
 assert.equal(await bridge.copy('Pyurks FH-J d10-0'),'native');assert.deepEqual(calls.native,['Pyurks FH-J d10-0']);assert.equal(calls.helper.length,0);assert.equal(bridge.clipboardStatus().nativeReady,true);
});

test('first automatic native copy waits for a manual copy in this open tab',async()=>{
 const {bridge,calls}=setup();await bridge.load();await assert.rejects(bridge.copy('first',{automatic:true}),e=>e.code==='CLIPBOARD_SETUP_REQUIRED');assert.equal(calls.native.length,0);assert.equal(calls.helper.length,0);
 await bridge.copy('manual');assert.equal(await bridge.copy('next',{automatic:true}),'native');assert.deepEqual(calls.native,['manual','next']);
});

test('a native write is successful only after a positive host acknowledgement',async()=>{
 let done;const {bridge}=setup({write:()=>new Promise(resolve=>{done=resolve;})});let settled=false;const p=bridge.copy('target').then(x=>{settled=true;return x;});await new Promise(r=>setImmediate(r));
 assert.equal(settled,false);assert.equal(bridge.clipboardStatus().nativeReady,false);done({written:true});assert.equal(await p,'native');assert.equal(bridge.clipboardStatus().nativeReady,true);
 for(const result of [undefined,{},false,{written:false},{written:'true'}]){const h=setup({write:async()=>result});await h.bridge.load();await assert.rejects(h.bridge.copy('target'),/did not confirm/);assert.equal(h.calls.helper.length,0);}
});

test('native denial, host restriction, busy, timeout, unavailable and failed writes never use another writer',async()=>{
 const browser=fakeBrowser();try{for(const code of ['PERMISSION_DENIED','HOST_ONLY','CLIPBOARD_BUSY','CLIPBOARD_TIMEOUT','CLIPBOARD_UNAVAILABLE','CLIPBOARD_FAILED']){
  const {bridge,calls}=setup({write:async()=>{throw Object.assign(Error(code),{code});}});await bridge.load();await assert.rejects(bridge.copy('target'),e=>e.code===code);assert.equal(calls.native.length,1);assert.equal(calls.helper.length,0);assert.equal(bridge.clipboardStatus().nativeReady,false);
 }assert.deepEqual(browser.copies,[]);}finally{browser.restore();}
});

test('missing API and confirmed unavailable backend keep the optional helper working',async()=>{
 for(const options of [{native:false},{available:false}]){const {bridge,calls}=setup(options);await bridge.load();assert.equal(await bridge.copy('target',{automatic:true}),'helper');assert.equal(calls.native.length,0);assert.equal(calls.helper.filter(x=>x.action==='clipboard').length,1);}
});

test('failed or malformed capability discovery is not treated as native unavailability',async()=>{
 for(const info of [async()=>{throw Error('status timeout');},async()=>({})]){const {bridge,calls}=setup({info});await bridge.load();await assert.rejects(bridge.copy('target'),/Could not check/);assert.equal(calls.native.length,0);assert.equal(calls.helper.length,0);}
});

test('explicit helper/browser modes select one writer and disconnecting preserves native availability',async()=>{
 const h=setup(),browser=fakeBrowser();try{await h.bridge.load();h.bridge.setClipboardMode('helper');assert.equal(await h.bridge.copy('helper target'),'helper');assert.equal(h.calls.native.length,0);
 h.bridge.setClipboardMode('browser');assert.equal(await h.bridge.copy('browser target'),'browser');assert.deepEqual(browser.copies,['browser target']);
 await h.bridge.disconnectClipboard();h.bridge.setClipboardMode('auto');assert.equal(await h.bridge.copy('native target'),'native');assert.equal(h.bridge.clipboardStatus().helper,false);
 h.bridge.setClipboardMode('helper');await assert.rejects(h.bridge.copy('missing helper'),/Connect the optional/);assert.throws(()=>h.bridge.setClipboardMode('wrong'),/valid clipboard/);
 }finally{browser.restore();}
});

test('native byte limits preserve Unicode and use the browser only for oversized manual lists before any write attempt',async()=>{
 const h=setup(),browser=fakeBrowser();try{await h.bridge.load();const text='Зоря 🌟\nNext target';assert.equal(await h.bridge.copy(text),'native');assert.equal(h.calls.native[0],text);
 assert.equal(await h.bridge.copy('Ж'.repeat(8192)),'native');const oversized='Ж'.repeat(8193);assert.equal(await h.bridge.copy(oversized),'browser');assert.deepEqual(browser.copies,[oversized]);assert.equal(h.calls.native.length,2);assert.equal(h.calls.helper.length,0);
 await assert.rejects(h.bridge.copy(oversized,{automatic:true}),/size limit/);for(const value of [42,null,'a\0b'])await assert.rejects(h.bridge.copy(value),/string without NUL/);
 assert.equal(h.calls.native.length,2);assert.equal(await h.bridge.copy(''),'native');assert.equal(h.calls.native.at(-1),'');
 }finally{browser.restore();}
});

test('obsolete targets and changed transport choices are discarded before a delayed capability lookup finishes',async()=>{
 for(const change of ['target','mode']){let finish,current=true;const h=setup({info:()=>new Promise(resolve=>{finish=resolve;})});await h.bridge.load();const p=h.bridge.copy('obsolete',{isCurrent:()=>current});await new Promise(r=>setImmediate(r));
 if(change==='target')current=false;else h.bridge.setClipboardMode('helper');finish({available:true});await assert.rejects(p,e=>e.code==='STALE_TARGET');assert.equal(h.calls.native.length,0);assert.equal(h.calls.helper.length,0);}
});

test('concurrent copies do not queue stale target strings or send duplicate writes',async()=>{
 let finish;const h=setup({write:()=>new Promise(resolve=>{finish=resolve;})});const p=h.bridge.copy('first');await new Promise(r=>setImmediate(r));await assert.rejects(h.bridge.copy('second'),e=>e.code==='CLIPBOARD_BUSY');finish({written:true});await p;assert.deepEqual(h.calls.native,['first']);
});

test('capability refresh can discover a newly available backend without writing',async()=>{
 let available=false;const h=setup({info:async()=>({available})});await h.bridge.refreshClipboard();assert.equal(h.bridge.clipboardStatus().native.available,false);available=true;await h.bridge.refreshClipboard();assert.equal(h.bridge.clipboardStatus().native.available,true);assert.equal(h.calls.native.length,0);
});

/* Simulates the SDK 11 get/CAS/batch protocol and the host's per-frame limiter. */
function createStoreHost(initial={},gap=50){
 let db=structuredClone(initial),failures=new Map();const last=new Map(),calls=[],limited=[];
 const clone=v=>v===undefined?undefined:structuredClone(v);
 async function request(method,p){
  const now=performance.now();calls.push({method,at:now});
  if(method!=='get'){
   if(now-(last.get(method)??-Infinity)<gap){limited.push(method);throw Object.assign(Error('custom-tab request rate exceeded'),{code:'RATE_LIMITED'});}
   last.set(method,now);
  }
  if(failures.has(method)){const e=failures.get(method);failures.delete(method);throw e;}
  if(method==='get')return{found:Object.hasOwn(db,p.key),value:clone(db[p.key])};
  if(method==='cas'){
   const found=Object.hasOwn(db,p.key),value=db[p.key];
   if(found!==p.expectedFound||(found&&JSON.stringify(value)!==JSON.stringify(p.expected)))return{swapped:false,found,value:clone(value)};
   db[p.key]=clone(p.value);return{swapped:true,found:true,value:clone(p.value)};
  }
  const next=clone(db);for(const o of p.operations)o.op==='set'?next[o.key]=clone(o.value):delete next[o.key];db=next;return{applied:p.operations.length};
 }
 const store={
  get:async(key,fallback=null)=>{const r=await request('get',{key});return r.found?r.value:fallback;},
  update:async(key,updater,options={})=>{
   for(let attempt=1;attempt<=(options.retries||8);attempt++){
    const before=await request('get',{key}),found=!!before.found,current=found?clone(before.value):clone(options.defaultValue??null);
    const next=await updater(clone(current),{found,attempt});
    if(next===undefined)throw Error('Updater must return a JSON value');
    const result=await request('cas',{key,expectedFound:found,expected:before.value??null,value:next});if(result.swapped)return result.value;
   }
   throw Object.assign(Error('store.update could not commit because the value kept changing'),{code:'TAB_STATE_CONFLICT'});
  },
  batch:operations=>request('batch',{operations})
 };
 return{store,calls,limited,data:()=>clone(db),failNext:(method,e)=>failures.set(method,e)};
}
module.exports={createStoreHost};

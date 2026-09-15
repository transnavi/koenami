/* Two complete takes are committed together, so an interrupted write keeps the old pair. */
export const TakeStore={
 db:null,queue:Promise.resolve(),
 async open(){if(this.db)return this.db;this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('koe-takes',1);r.onupgradeneeded=()=>r.result.createObjectStore('session');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return this.db;},
 async read(key='takes'){const db=await this.open();return new Promise((resolve,reject)=>{const r=db.transaction('session').objectStore('session').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});},
 write(pair,key='takes'){return this.writeEntries([[pair,key]]);},
 writeEntries(entries){this.queue=this.queue.catch(()=>{}).then(async()=>{const db=await this.open();await new Promise((resolve,reject)=>{const tx=db.transaction('session','readwrite');for(const [value,key] of entries)tx.objectStore('session').put(value,key);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Storage failed'));});});return this.queue;},
 saveRecording(snapshot,metadata){return this.recordingTransaction(metadata.id,()=>({snapshot,metadata}));},
 finishRecording(id,detail){return this.recordingTransaction(id,(snapshot,metadata)=>{
  if(!snapshot||!metadata)return null;
  return {snapshot:{...snapshot,detail,measurement:snapshot.range?snapshot.measurement:detail},metadata:{...metadata,features:detail.features,duration:detail.duration}};
 });},
 recordingTransaction(id,change){
  const operation=this.queue.catch(()=>{}).then(async()=>{
   const db=await this.open();return new Promise((resolve,reject)=>{
    const tx=db.transaction('session','readwrite'),store=tx.objectStore('session');let index=[],snapshot,result,remaining=2;
    const update=()=>{if(--remaining)return;const changed=change(snapshot,index.find(t=>t.id===id));if(!changed){result=null;return;}
     const next=index.some(t=>t.id===id)?index.map(t=>t.id===id?changed.metadata:t):[changed.metadata,...index];
     store.put(changed.snapshot,'recording:'+id);store.put(next,'recording-index');result={snapshot:changed.snapshot,index:next};
    };
    const saved=store.get('recording:'+id);saved.onsuccess=()=>{snapshot=saved.result;update();};
    const list=store.get('recording-index');list.onsuccess=()=>{index=list.result||[];update();};
    tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Storage failed'));
   });
  });this.queue=operation;return operation;
 }
};

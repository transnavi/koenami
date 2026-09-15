/* Two complete takes are committed together, so an interrupted write keeps the old pair. */
export const TakeStore={
 db:null,queue:Promise.resolve(),
 async open(){if(this.db)return this.db;this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('koe-takes',1);r.onupgradeneeded=()=>r.result.createObjectStore('session');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return this.db;},
 async read(key='takes'){const db=await this.open();return new Promise((resolve,reject)=>{const r=db.transaction('session').objectStore('session').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});},
 write(pair,key='takes'){return this.writeEntries([[pair,key]]);},
 writeEntries(entries){this.queue=this.queue.catch(()=>{}).then(async()=>{const db=await this.open();await new Promise((resolve,reject)=>{const tx=db.transaction('session','readwrite');for(const [value,key] of entries)tx.objectStore('session').put(value,key);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Storage failed'));});});return this.queue;},
 // Read and modify one rating inside a transaction, including across browser tabs.
 updateRating(key,change){
  const operation=this.queue.catch(()=>{}).then(async()=>{
   const db=await this.open();return new Promise((resolve,reject)=>{
    const tx=db.transaction('session','readwrite'),store=tx.objectStore('session');let rows,index,result,remaining=2;
    const update=()=>{if(--remaining)return;
     if(rows!==undefined&&!Array.isArray(rows)){tx.abort();return;}rows=rows||[];result=rows;
     if(key.startsWith('own:')&&!(index||[]).some(r=>r.id===key.slice(4)))return;
     try{const next=change(rows.find(r=>r.key===key));result=rows.filter(r=>r.key!==key);if(next)result.push(next);store.put(result,'listener-ratings');}catch{tx.abort();}
    };
    const ratings=store.get('listener-ratings');ratings.onsuccess=()=>{rows=ratings.result;update();};
    const recordings=store.get('recording-index');recordings.onsuccess=()=>{index=recordings.result;update();};
    tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Storage failed'));
   });
  });this.queue=operation;return operation;
 },
 saveRecording(snapshot,metadata){return this.recordingTransaction(metadata.id,()=>({snapshot,metadata}));},
 deleteRecording(id){
  const operation=this.queue.catch(()=>{}).then(async()=>{
   const db=await this.open();return new Promise((resolve,reject)=>{
    const tx=db.transaction('session','readwrite'),store=tx.objectStore('session');let index=[],pair,ratings,remaining=3;
    const remove=()=>{if(--remaining)return;index=index.filter(t=>t.id!==id);store.delete('recording:'+id);store.put(index,'recording-index');
     if(pair)store.put({current:pair.current?.takeId===id?null:pair.current,previous:pair.previous?.takeId===id?null:pair.previous},'takes');
     if(Array.isArray(ratings))store.put(ratings.filter(r=>r.key!=='own:'+id),'listener-ratings');
    };
    const list=store.get('recording-index');list.onsuccess=()=>{index=list.result||[];remove();};
    const saved=store.get('takes');saved.onsuccess=()=>{pair=saved.result;remove();};
    const impressions=store.get('listener-ratings');impressions.onsuccess=()=>{ratings=impressions.result;remove();};
    tx.oncomplete=()=>{globalThis.dispatchEvent?.(new CustomEvent('koenami-recording-deleted',{detail:id}));resolve(index);};tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Storage failed'));
   });
  });this.queue=operation;return operation;
 },
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

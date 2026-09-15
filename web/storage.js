/* Two complete takes are committed together, so an interrupted write keeps the old pair. */
export const TakeStore={
 db:null,queue:Promise.resolve(),
 async open(){if(this.db)return this.db;this.db=await new Promise((resolve,reject)=>{const r=indexedDB.open('koe-takes',1);r.onupgradeneeded=()=>r.result.createObjectStore('session');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});return this.db;},
 async read(key='takes'){const db=await this.open();return new Promise((resolve,reject)=>{const r=db.transaction('session').objectStore('session').get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});},
 write(pair,key='takes'){return this.writeEntries([[pair,key]]);},
 writeEntries(entries){this.queue=this.queue.catch(()=>{}).then(async()=>{const db=await this.open();await new Promise((resolve,reject)=>{const tx=db.transaction('session','readwrite');for(const [value,key] of entries)tx.objectStore('session').put(value,key);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Storage failed'));});});return this.queue;}
};

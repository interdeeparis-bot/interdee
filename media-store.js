(function(){
  const DB_NAME='goodDealsMediaV1';const STORE_NAME='media';let dbPromise;
  function open(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      if(!window.indexedDB){reject(new Error('当前浏览器不支持本地视频存储'));return}
      const request=indexedDB.open(DB_NAME,1);
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE_NAME))request.result.createObjectStore(STORE_NAME)};
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('无法打开本地媒体库'));
    });
    return dbPromise;
  }
  async function run(mode,action){
    const db=await open();return new Promise((resolve,reject)=>{const transaction=db.transaction(STORE_NAME,mode);const store=transaction.objectStore(STORE_NAME);const request=action(store);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new Error('媒体文件保存失败'));});
  }
  async function putMany(entries){
    const db=await open();return new Promise((resolve,reject)=>{const transaction=db.transaction(STORE_NAME,'readwrite'),store=transaction.objectStore(STORE_NAME);entries.forEach(([key,value])=>store.put(value,key));transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(new Error('批量照片保存失败'));transaction.onabort=()=>reject(new Error('批量照片保存被中止'))});
  }
  window.MediaStore={put:(key,value)=>run('readwrite',store=>store.put(value,key)),putMany,get:key=>run('readonly',store=>store.get(key)),remove:key=>run('readwrite',store=>store.delete(key))};
})();

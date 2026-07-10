(function(){
  const config=window.SUPABASE_CONFIG||{url:'https://xvqnxforarptdqfgsntp.supabase.co',anonKey:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2cW54Zm9yYXJwdGRxZmdzbnRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2ODgwMDksImV4cCI6MjA5OTI2NDAwOX0.lKCHow_5Pt4OWqYLWBHIoFBlV45MLM3dvttEjsckUIg'};
  const base=String(config.url||'').replace(/\/$/,'');
  const anon=String(config.anonKey||'');
  const tokenKey='interdeeAdminTokenV1';
  const configured=Boolean(base&&anon);
  const authToken=()=>sessionStorage.getItem(tokenKey)||anon;
  const headers=(admin=false,extra={})=>({apikey:anon,Authorization:`Bearer ${admin?authToken():anon}`,...extra});
  async function request(path,{method='GET',body,admin=false,prefer}={}){
    if(!configured)throw new Error('云端数据库尚未配置');
    const response=await fetch(base+path,{method,headers:headers(admin,{'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})}),body:body===undefined?undefined:JSON.stringify(body)});
    if(!response.ok){const detail=await response.text();throw new Error(detail||`请求失败 (${response.status})`)}
    if(response.status===204)return null;const text=await response.text();return text?JSON.parse(text):null;
  }
  function fromRow(row){return {id:row.id,name:row.name,category:row.category,label:row.label,composition:row.composition||'',price:Number(row.price)||0,original:Number(row.original)||0,discountRate:Number(row.discount_rate)||0,stock:Number(row.stock)||0,variants:Array.isArray(row.variants)?row.variants:[],image:row.image||'',colorImages:row.color_images||{},icon:row.icon||'✦',color:row.color||'#b78166',desc:row.description||'',visible:row.visible!==false,order:Number(row.display_order)||0}}
  function toRow(product){return {id:String(product.id),name:product.name||String(product.id),category:product.category||'autres',label:product.label||'',composition:product.composition||'',price:Number(product.price)||0,original:Number(product.original)||0,discount_rate:Number(product.discountRate)||0,stock:Number(product.stock)||0,variants:product.variants||[],image:product.image||'',color_images:product.colorImages||{},icon:product.icon||'✦',color:product.color||'#b78166',description:product.desc||'',visible:product.visible!==false,display_order:Number(product.order)||0}}
  async function loadProducts(admin=false){const rows=await request(`/rest/v1/products?select=*&order=display_order.asc${admin?'':'&visible=eq.true'}`,{admin});return (rows||[]).map(fromRow)}
  async function loadSettings(admin=false){const rows=await request('/rest/v1/site_settings?select=data&id=eq.site',{admin});return rows?.[0]?.data||{}}
  async function submitOrder(customer,items,total){return request('/rest/v1/orders',{method:'POST',body:{customer,items,total:Number(total)||0,status:'new'},prefer:'return=minimal'})}
  async function login(email,password){const result=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});if(!result?.access_token)throw new Error('登录失败');sessionStorage.setItem(tokenKey,result.access_token);return result}
  function logout(){sessionStorage.removeItem(tokenKey)}
  async function verifyAdmin(){return request('/rest/v1/admin_users?select=user_id&limit=1',{admin:true})}
  async function upsertProducts(products){return request('/rest/v1/products?on_conflict=id',{method:'POST',admin:true,body:products.map(toRow),prefer:'resolution=merge-duplicates,return=minimal'})}
  async function deleteProduct(id){return request(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',admin:true})}
  async function saveSettings(data){return request('/rest/v1/site_settings?on_conflict=id',{method:'POST',admin:true,body:{id:'site',data},prefer:'resolution=merge-duplicates,return=minimal'})}
  async function loadOrders(){return request('/rest/v1/orders?select=*&order=created_at.desc',{admin:true})}
  async function updateOrder(id,status){return request(`/rest/v1/orders?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',admin:true,body:{status},prefer:'return=minimal'})}
  async function upload(file,folder='uploads'){
    const extension=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'');
    const path=`${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension||'bin'}`;
    const response=await fetch(`${base}/storage/v1/object/product-media/${path}`,{method:'POST',headers:headers(true,{'Content-Type':file.type||'application/octet-stream','x-upsert':'true'}),body:file});
    if(!response.ok)throw new Error(await response.text()||'图片上传失败');
    return `${base}/storage/v1/object/public/product-media/${path}`;
  }
  window.CloudAPI={configured,loadProducts,loadSettings,submitOrder,login,logout,verifyAdmin,upsertProducts,deleteProduct,saveSettings,loadOrders,updateOrder,upload};
})();

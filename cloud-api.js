(function(){
  const config=window.SUPABASE_CONFIG||{url:'https://xvqnxforarptdqfgsntp.supabase.co',anonKey:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2cW54Zm9yYXJwdGRxZmdzbnRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM2ODgwMDksImV4cCI6MjA5OTI2NDAwOX0.lKCHow_5Pt4OWqYLWBHIoFBlV45MLM3dvttEjsckUIg'};
  const base=String(config.url||'').replace(/\/$/,'');
  const anon=String(config.anonKey||'');
  const tokenKey='interdeeAdminSessionV2';
  const legacyTokenKey='interdeeAdminTokenV1';
  const configured=Boolean(base&&anon);
  const publicHeaders=(extra={})=>({apikey:anon,Authorization:`Bearer ${anon}`,...extra});
  function readSession(){try{return JSON.parse(localStorage.getItem(tokenKey)||'null')}catch(_){return null}}
  function saveSession(result){
    if(!result?.access_token)return;
    localStorage.setItem(tokenKey,JSON.stringify({access_token:result.access_token,refresh_token:result.refresh_token||'',expires_at:Date.now()+(Number(result.expires_in)||3600)*1000}));
    sessionStorage.removeItem(legacyTokenKey);
  }
  async function authToken(){
    const current=readSession();
    if(current?.access_token&&Number(current.expires_at)>Date.now()+60000)return current.access_token;
    if(current?.refresh_token){
      const response=await fetch(`${base}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:publicHeaders({'Content-Type':'application/json'}),body:JSON.stringify({refresh_token:current.refresh_token})});
      if(response.ok){const refreshed=await response.json();saveSession(refreshed);return refreshed.access_token}
    }
    const legacy=sessionStorage.getItem(legacyTokenKey);
    if(legacy)return legacy;
    throw new Error('请先通过邮箱登录');
  }
  async function adminHeaders(extra={}){return {apikey:anon,Authorization:`Bearer ${await authToken()}`,...extra}}
  async function request(path,{method='GET',body,admin=false,prefer}={}){
    if(!configured)throw new Error('云端数据库尚未配置');
    const extra={'Content-Type':'application/json',...(prefer?{Prefer:prefer}:{})};
    const response=await fetch(base+path,{method,headers:admin?await adminHeaders(extra):publicHeaders(extra),body:body===undefined?undefined:JSON.stringify(body)});
    if(!response.ok){const detail=await response.text();throw new Error(detail||`请求失败 (${response.status})`)}
    if(response.status===204)return null;const text=await response.text();return text?JSON.parse(text):null;
  }
  function fromRow(row){return {id:row.id,name:row.name,category:row.category,label:row.label,composition:row.composition||'',price:Number(row.price)||0,original:Number(row.original)||0,discountRate:Number(row.discount_rate)||0,stock:Number(row.stock)||0,variants:Array.isArray(row.variants)?row.variants:[],image:row.image||'',colorImages:row.color_images||{},icon:row.icon||'✦',color:row.color||'#b78166',desc:row.description||'',visible:row.visible!==false,order:Number(row.display_order)||0}}
  function toRow(product){return {id:String(product.id),name:product.name||String(product.id),category:product.category||'autres',label:product.label||'',composition:product.composition||'',price:Number(product.price)||0,original:Number(product.original)||0,discount_rate:Number(product.discountRate)||0,stock:Number(product.stock)||0,variants:product.variants||[],image:product.image||'',color_images:product.colorImages||{},icon:product.icon||'✦',color:product.color||'#b78166',description:product.desc||'',visible:product.visible!==false,display_order:Number(product.order)||0}}
  async function loadProducts(admin=false){const rows=await request(`/rest/v1/products?select=*&order=display_order.asc${admin?'':'&visible=eq.true'}`,{admin:false});return (rows||[]).map(fromRow)}
  async function loadSettings(admin=false){const rows=await request('/rest/v1/site_settings?select=data&id=eq.site',{admin:false});return rows?.[0]?.data||{}}
  async function submitOrder(customer,items,total){return request('/rest/v1/orders',{method:'POST',body:{customer,items,total:Number(total)||0,status:'new'},prefer:'return=minimal'})}
  async function requestMagicLink(email){
    const redirectTo=`${location.origin}${location.pathname}`;
    return request(`/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`,{method:'POST',body:{email:String(email||'').trim(),create_user:false}});
  }
  function completeAuthRedirect(){
    const params=new URLSearchParams(location.hash.replace(/^#/,''));
    const error=params.get('error_description')||params.get('error');
    if(error){history.replaceState({},'',location.pathname);throw new Error(error)}
    const accessToken=params.get('access_token');
    if(!accessToken)return false;
    saveSession({access_token:accessToken,refresh_token:params.get('refresh_token')||'',expires_in:params.get('expires_in')||3600});
    history.replaceState({},'',location.pathname);
    return true;
  }
  async function login(email,password){const result=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}});if(!result?.access_token)throw new Error('登录失败');saveSession(result);return result}
  function logout(){localStorage.removeItem(tokenKey);sessionStorage.removeItem(legacyTokenKey)}
  async function verifyAdmin(){return request('/rest/v1/admin_users?select=user_id&limit=1',{admin:true})}
  async function upsertProducts(products){return request('/rest/v1/products?on_conflict=id',{method:'POST',admin:true,body:products.map(toRow),prefer:'resolution=merge-duplicates,return=minimal'})}
  async function deleteProduct(id){return request(`/rest/v1/products?id=eq.${encodeURIComponent(id)}`,{method:'DELETE',admin:true})}
  async function saveSettings(data){return request('/rest/v1/site_settings?on_conflict=id',{method:'POST',admin:true,body:{id:'site',data},prefer:'resolution=merge-duplicates,return=minimal'})}
  async function loadOrders(){return request('/rest/v1/orders?select=*&order=created_at.desc',{admin:true})}
  async function updateOrder(id,status){return request(`/rest/v1/orders?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',admin:true,body:{status},prefer:'return=minimal'})}
  async function upload(file,folder='uploads'){
    const extension=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'');
    const path=`${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension||'bin'}`;
    const response=await fetch(`${base}/storage/v1/object/product-media/${path}`,{method:'POST',headers:await adminHeaders({'Content-Type':file.type||'application/octet-stream','x-upsert':'true'}),body:file});
    if(!response.ok)throw new Error(await response.text()||'图片上传失败');
    return `${base}/storage/v1/object/public/product-media/${path}`;
  }
  window.CloudAPI={configured,loadProducts,loadSettings,submitOrder,requestMagicLink,completeAuthRedirect,login,logout,verifyAdmin,upsertProducts,deleteProduct,saveSettings,loadOrders,updateOrder,upload};
})();

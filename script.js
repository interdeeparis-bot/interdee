const money=new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'});
const sizeOrder=['F','XS','S','M','L','XL','S/M','M/L'];
let products=StoreData.getProducts();
let settings=StoreData.getSettings();
let storedReserved;
try{storedReserved=JSON.parse(localStorage.getItem('reservedDealsV2')||'[]')}catch(_){storedReserved=[]}
let reserved=(Array.isArray(storedReserved)?storedReserved:[]).map(item=>typeof item==='string'?{id:item}:{id:String(item.id||''),color:item.color||'',size:item.size||''});
let activeFilter='all';
let choosingProduct=null;
let heroVideoObjectUrl='';
let heroMediaRequest=0;
const productPhotoUrls=new Map();
const grid=document.querySelector('#productGrid');
const cartCount=document.querySelector('#cartCount');
const dialog=document.querySelector('#reserveDialog');
const variantDialog=document.querySelector('#variantDialog');
const esc=StoreData.safeText;
const safeImage=StoreData.safeImage;
const clothingCategories=StoreData.categories;
const categoryFilters=document.querySelector('#categoryFilters');
function categoryId(value){return clothingCategories.some(category=>category.id===value)?value:'autres'}
function categoryLabel(value){return clothingCategories.find(category=>category.id===categoryId(value))?.label||'Autres'}

function syncProductStock(product){
  if(Array.isArray(product.variants)&&product.variants.length)product.stock=product.variants.reduce((sum,v)=>sum+Math.max(0,Number(v.quantity)||0),0);
  return product;
}
function activeProducts(){return products.map(syncProductStock).filter(p=>p.visible!==false).sort((a,b)=>(a.order??999)-(b.order??999)||String(a.id).localeCompare(String(b.id)))}
function discount(product){return product.original>product.price?Math.round((1-product.price/product.original)*100):0}
function sameSelection(a,b){return a.id===b.id&&(a.color||'')===(b.color||'')&&(a.size||'')===(b.size||'')}
function productSelections(id){return reserved.filter(item=>item.id===id).length}
function availableVariants(product){return (product.variants||[]).filter(v=>Number(v.quantity)>0)}
function productPhotoKey(product){return Object.values(product?.colorImageKeys||{}).find(Boolean)||''}
function productPhoto(product){const key=productPhotoKey(product);return safeImage(product?.image)||safeImage(Object.values(product?.colorImages||{}).find(Boolean))||productPhotoUrls.get(key)||''}
async function hydrateProductPhotos(){
  const images=[...grid.querySelectorAll('img[data-media-key]')];for(const image of images){const key=image.dataset.mediaKey;if(!key)continue;if(productPhotoUrls.has(key)){image.src=productPhotoUrls.get(key);continue}try{const blob=await MediaStore.get(key);if(blob){const url=URL.createObjectURL(blob);productPhotoUrls.set(key,url);image.src=url}}catch(_){}}
}

async function applyHeroMedia(){
  const request=++heroMediaRequest;const heroVisual=document.querySelector('.hero-visual');const video=document.querySelector('#heroVideo');const heroImage=safeImage(settings.heroImage);const type=settings.heroMediaType==='video'?'video':heroImage?'image':'template';
  video.pause();video.hidden=true;video.removeAttribute('src');video.load();if(heroVideoObjectUrl){URL.revokeObjectURL(heroVideoObjectUrl);heroVideoObjectUrl=''}
  heroVisual.classList.remove('custom-photo','custom-video');heroVisual.style.backgroundImage='';
  if(type==='image'){heroVisual.classList.add('custom-photo');heroVisual.style.backgroundImage=`url("${heroImage}")`;return}
  if(type==='video'){
    try{const blob=await MediaStore.get('hero-video');if(request!==heroMediaRequest)return;if(blob){heroVideoObjectUrl=URL.createObjectURL(blob);video.src=heroVideoObjectUrl;video.hidden=false;video.muted=true;heroVisual.classList.add('custom-video');video.play().catch(()=>{});return}}catch(_){}
  }
}

function applySettings(){
  document.title=settings.brandName+' — Bons plans';
  document.querySelector('#brandName').childNodes[0].nodeValue=settings.brandName;document.querySelector('#footerBrand').childNodes[0].nodeValue=settings.brandName;
  document.querySelector('#siteNotice').textContent=settings.notice;
  ['heroEyebrow','heroTitle','heroAccent','heroDescription','heroCta','sectionTitle','footerText'].forEach(id=>document.querySelector('#'+id).textContent=settings[id]);
  document.querySelector('#contactTitle').innerHTML=esc(settings.contactTitle).replace('|','<br>');document.querySelector('#phoneText').textContent=settings.phone;document.querySelector('#phoneLink').href='tel:'+settings.phone.replace(/[^+\d]/g,'');
  document.body.dataset.theme=settings.theme;
  const logoImage=safeImage(settings.logoImage);document.querySelectorAll('.brand-mark').forEach(mark=>{mark.classList.toggle('custom-logo',Boolean(logoImage));mark.style.backgroundImage=logoImage?`url("${logoImage}")`:'';mark.textContent=logoImage?'':'B'});
  applyHeroMedia();
  const howSection=document.querySelector('.how-section');const howImage=safeImage(settings.howBackgroundImage);howSection.classList.toggle('custom-background',Boolean(howImage));howSection.style.backgroundImage=howImage?`linear-gradient(#17251dcc,#17251dcc),url("${howImage}")`:'';
  const contactSection=document.querySelector('.contact-section');const contactImage=safeImage(settings.contactBackgroundImage);contactSection.classList.toggle('custom-background',Boolean(contactImage));contactSection.style.backgroundImage=contactImage?`linear-gradient(#1c271fc2,#1c271fc2),url("${contactImage}")`:'';
  grid.style.setProperty('--grid-columns',Math.min(4,Math.max(2,Number(settings.columns)||3)));
  const current=activeProducts();document.querySelector('#productTotal').textContent=current.length;document.querySelector('#maxSaving').textContent='– '+current.reduce((n,p)=>Math.max(n,discount(p)),0)+' %';
}
function variantSummary(product){
  const variants=availableVariants(product);if(!variants.length)return '';
  const colors=[...new Set(variants.map(v=>v.color))];const sizes=[...new Set(variants.map(v=>v.size))].sort((a,b)=>sizeOrder.indexOf(a)-sizeOrder.indexOf(b));
  return `<div class="variant-summary"><span class="variant-colors"><strong>Couleurs :</strong> ${colors.map(esc).join(', ')}</span><span class="size-chips">${sizes.map(size=>`<i>${esc(size)}</i>`).join('')}</span></div>`;
}
function renderCategoryFilters(){
  const present=new Set(activeProducts().map(product=>categoryId(product.category)));if(activeFilter!=='all'&&!present.has(activeFilter))activeFilter='all';
  categoryFilters.innerHTML=`<button class="filter ${activeFilter==='all'?'active':''}" data-filter="all">Tout</button>`+clothingCategories.filter(category=>present.has(category.id)).map(category=>`<button class="filter ${activeFilter===category.id?'active':''}" data-filter="${category.id}">${esc(category.label)}</button>`).join('');
}
function render(){
  renderCategoryFilters();const list=activeProducts().filter(p=>activeFilter==='all'||categoryId(p.category)===activeFilter);
  grid.innerHTML=list.length?list.map(product=>{
    const unavailable=Number(product.stock)<=0;const photo=productPhoto(product),photoKey=productPhotoKey(product),hasPhoto=Boolean(photo||photoKey);const count=productSelections(product.id);const hasVariants=Array.isArray(product.variants)&&product.variants.length>0;
    const buttonText=unavailable?'Article épuisé':hasVariants?`Choisir couleur et taille${count?` · ${count} sélectionné${count>1?'s':''}`:''}`:count?'✓ Ajouté à ma sélection':'Réserver gratuitement';
    return `<article class="product-card">
      <div class="product-image ${hasPhoto?'has-photo':''}" style="--shape:${esc(product.color)}"><span class="sale-badge">${discount(product)?'– '+discount(product)+' %':'PRIX DOUX'}</span>${hasPhoto?`<img class="product-photo" ${photo?`src="${photo}"`:''} ${photoKey?`data-media-key="${esc(photoKey)}"`:''} alt="${esc(product.name)}">`:`<span class="product-icon" role="img" aria-label="${esc(product.name)}">${esc(product.icon)}</span>`}<span class="stock ${unavailable?'sold-out':''}">${unavailable?'Épuisé':product.stock+' en stock'}</span></div>
      <div class="product-meta"><span class="product-category">${esc(categoryLabel(product.category)).toUpperCase()}</span><div class="product-name-row"><span class="product-name">${esc(product.name)}</span><span class="prices"><span class="price">${money.format(Number(product.price))}</span>${product.original>product.price?`<span class="original">${money.format(Number(product.original))}</span>`:''}</span></div>${product.composition?`<p class="product-composition">${esc(product.composition)}</p>`:''}<p class="product-desc">${esc(product.desc)}</p>${variantSummary(product)}
      <button class="reserve-button ${count?'added':''}" data-id="${esc(product.id)}" ${unavailable?'disabled':''}>${buttonText}</button></div>
    </article>`;
  }).join(''):'<div class="empty-grid"><strong>Aucun article pour le moment.</strong><br>Revenez bientôt pour découvrir nos nouveautés.</div>';hydrateProductPhotos();
}
function selectionAvailable(selection){
  const product=activeProducts().find(p=>p.id===selection.id);if(!product||product.stock<=0)return false;
  if(product.variants?.length)return Boolean(selection.color&&selection.size&&product.variants.find(v=>v.color===selection.color&&v.size===selection.size&&Number(v.quantity)>0));
  return !selection.color&&!selection.size;
}
function updateCount(){reserved=reserved.filter(selectionAvailable);cartCount.textContent=reserved.length;localStorage.setItem('reservedDealsV2',JSON.stringify(reserved))}
function toggleSimple(id){const selection={id,color:'',size:''};const index=reserved.findIndex(item=>sameSelection(item,selection));if(index>=0)reserved.splice(index,1);else reserved.push(selection);updateCount();render()}
function updateVariantSizes(){
  if(!choosingProduct)return;const color=document.querySelector('#variantColor').value;const variants=availableVariants(choosingProduct).filter(v=>v.color===color).sort((a,b)=>sizeOrder.indexOf(a.size)-sizeOrder.indexOf(b.size));
  document.querySelector('#variantSize').innerHTML=variants.map(v=>`<option value="${esc(v.size)}">${esc(v.size)} · ${v.quantity} disponible${v.quantity>1?'s':''}</option>`).join('');
  document.querySelector('#variantAvailability').textContent=variants.length?`${variants.reduce((sum,v)=>sum+Number(v.quantity),0)} article(s) disponible(s) dans cette couleur.`:'Cette couleur est épuisée.';document.querySelector('#confirmVariant').disabled=!variants.length;
}
function chooseVariant(product){
  choosingProduct=product;document.querySelector('#variantProductName').textContent=product.name;
  const colors=[...new Set(availableVariants(product).map(v=>v.color))];document.querySelector('#variantColor').innerHTML=colors.map(color=>`<option value="${esc(color)}">${esc(color)}</option>`).join('');updateVariantSizes();variantDialog.showModal();
}
grid.addEventListener('click',event=>{
  const button=event.target.closest('.reserve-button');if(!button||button.disabled)return;const product=products.find(p=>p.id===button.dataset.id);if(!product)return;product.variants?.length?chooseVariant(product):toggleSimple(product.id);
});
document.querySelector('#variantColor').addEventListener('change',updateVariantSizes);
document.querySelector('#confirmVariant').addEventListener('click',()=>{
  if(!choosingProduct)return;const selection={id:choosingProduct.id,color:document.querySelector('#variantColor').value,size:document.querySelector('#variantSize').value};if(!reserved.some(item=>sameSelection(item,selection)))reserved.push(selection);updateCount();render();variantDialog.close();
});
document.querySelector('#closeVariant').addEventListener('click',()=>variantDialog.close());
variantDialog.addEventListener('click',event=>{if(event.target===variantDialog)variantDialog.close()});
categoryFilters.addEventListener('click',event=>{const button=event.target.closest('.filter');if(!button)return;activeFilter=button.dataset.filter;render()});

function showDialog(){
  products=StoreData.getProducts();products.forEach(syncProductStock);updateCount();document.querySelector('#successMessage').hidden=true;document.querySelector('#reserveContent').hidden=false;
  const box=document.querySelector('#reserveItems');
  box.innerHTML=reserved.length?reserved.map((selection,index)=>{const product=products.find(p=>p.id===selection.id);const option=selection.color||selection.size?` · ${esc(selection.color)} ${esc(selection.size)}`:'';return `<div class="reserve-line"><span>${esc(product.name)}${option} · ${money.format(Number(product.price))}</span><button class="remove-item" data-index="${index}">Retirer</button></div>`}).join(''):'<div class="empty">Votre sélection est vide.</div>';
  if(!dialog.open)dialog.showModal();
}
document.querySelector('#openReserve').addEventListener('click',showDialog);
document.querySelector('#closeDialog').addEventListener('click',()=>dialog.close());
document.querySelector('#reserveItems').addEventListener('click',event=>{if(event.target.matches('.remove-item')){reserved.splice(Number(event.target.dataset.index),1);updateCount();render();showDialog()}});
document.querySelector('#reserveForm').addEventListener('submit',event=>{
  event.preventDefault();if(!reserved.length){dialog.close();document.querySelector('#deals').scrollIntoView();return}
  const form=Object.fromEntries(new FormData(event.target));const fresh=StoreData.getProducts();fresh.forEach(syncProductStock);
  const selected=reserved.map(selection=>{const product=fresh.find(p=>p.id===selection.id);if(!product)return null;const variant=product.variants?.find(v=>v.color===selection.color&&v.size===selection.size);if(product.variants?.length&&(!variant||variant.quantity<1))return null;if(!product.variants?.length&&product.stock<1)return null;return {id:product.id,name:product.name,price:product.price,color:selection.color||'',size:selection.size||''}}).filter(Boolean);
  if(!selected.length){reserved=[];updateCount();dialog.close();render();return}
  const reservations=StoreData.getReservations();reservations.unshift({id:'R'+Date.now(),createdAt:new Date().toISOString(),status:'new',customer:form,items:selected});StoreData.saveReservations(reservations);
  document.querySelector('#reserveContent').hidden=true;document.querySelector('#successMessage').hidden=false;reserved=[];updateCount();render();event.target.reset();
});
document.querySelector('#doneButton').addEventListener('click',()=>dialog.close());
dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});
window.addEventListener('storage',()=>{products=StoreData.getProducts();settings=StoreData.getSettings();applySettings();updateCount();render()});
applySettings();updateCount();render();

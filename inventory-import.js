Exit code: 0
Wall time: 0.4 seconds
Output:
(function(){
  const SHEET_URL='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  const PDF_URL='https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/build/pdf.min.mjs';
  const PDF_WORKER_URL='https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/build/pdf.worker.min.mjs';
  const sizes=['F','XS','S','M','L','XL','S/M','M/L'];
  let sheetPromise;
  const aliases={
    photo:['photo','image','图片','照片'],sku:['款号','货号','商品编号','款式编号','sku','style','stylecode','reference','référence','ref'],
    name:['商品名称','商品名称可选','品名','名称','款名','name','productname','nom','produit'],category:['品类','类别','分类','category','categorie','catégorie'],
    composition:['composition','composant','matiere','matière','成分','材质','面料'],color:['颜色','色号','color','colour','couleur'],size:['尺寸','尺码','size','taille'],
    price:['价格','原价','单价','price','prix','prix€','prixeur'],discount:['折扣','折扣%','折扣百分比','discount','remise','réduction','reduction'],
    quantity:['数量','库存','库存数量','quantity','qty','stock','quantité','quantite'],total:['总数量','数量合计','合计','total','qtetotal','quantitetotale','quantitétotale']
  };
  function normalizeWord(value){return String(value??'').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[\s_\-—–:：()（）%€]/g,'')}
  function canonicalHeader(value){const word=normalizeWord(value);for(const [key,list] of Object.entries(aliases))if(list.some(alias=>normalizeWord(alias)===word))return key;return ''}
  function sizeFromHeader(value){
    let text=String(value??'').trim().toUpperCase().replace(/\s/g,'').replace(/[（(].*$/,'').replace(/-/g,'/');
    if(/^S\/?M$/.test(text))return 'S/M';if(/^M\/?L$/.test(text))return 'M/L';if(text.startsWith('XS'))return 'XS';if(text.startsWith('XL'))return 'XL';if(/^F(?:$|[^A-Z])/.test(text))return 'F';if(/^S(?:$|[^A-Z])/.test(text))return 'S';if(/^M(?:$|[^A-Z])/.test(text))return 'M';if(/^L(?:$|[^A-Z])/.test(text))return 'L';return '';
  }
  function categoryValue(value){
    const word=normalizeWord(value);if(!word)return 'autres';const categories=window.StoreData?.categories||[['robes','Robes'],['hauts','Hauts'],['chemises','Chemises'],['pulls','Pulls & gilets'],['vestes','Vestes'],['manteaux','Manteaux'],['pantalons','Pantalons'],['jeans','Jeans'],['jupes','Jupes'],['shorts','Shorts'],['combinaisons','Combinaisons'],['ensembles','Ensembles'],['accessoires','Accessoires'],['autres','Autres']].map(([id,label])=>({id,label}));
    const category=categories.find(item=>[item.id,item.label,item.zh,...(item.aliases||[])].some(alias=>normalizeWord(alias)===word));return category?.id||'';
  }
  function loadSheetJs(){
    if(window.XLSX)return Promise.resolve(window.XLSX);if(sheetPromise)return sheetPromise;
    sheetPromise=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=SHEET_URL;script.async=true;script.onload=()=>window.XLSX?resolve(window.XLSX):reject(new Error('Excel 读取组件加载失败'));script.onerror=()=>reject(new Error('无法连接 Excel 读取组件；可先另存为 CSV 后导入'));document.head.appendChild(script)});return sheetPromise;
  }
  function parseCsv(text){
    const firstLine=text.split(/\r?\n/,1)[0]||'';const delimiter=[';',',','\t'].sort((a,b)=>(firstLine.split(b).length-firstLine.split(a).length))[0];const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){const char=text[i];if(char==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(char===delimiter&&!quoted){row.push(cell);cell=''}else if((char==='\n'||char==='\r')&&!quoted){if(char==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>String(x).trim()))rows.push(row);row=[]}else cell+=char}
    row.push(cell);if(row.some(x=>String(x).trim()))rows.push(row);return rows;
  }

  function createZipReader(arrayBuffer){
    const bytes=new Uint8Array(arrayBuffer),view=new DataView(arrayBuffer);let eocd=-1;
    for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--){if(view.getUint32(i,true)===0x06054b50){eocd=i;break}}
    if(eocd<0)throw new Error('不是有效的 XLSX 压缩文件');const total=view.getUint16(eocd+10,true);let offset=view.getUint32(eocd+16,true);const entries=new Map();const decoder=new TextDecoder('utf-8');
    for(let i=0;i<total;i++){
      if(view.getUint32(offset,true)!==0x02014b50)break;const method=view.getUint16(offset+10,true),compressedSize=view.getUint32(offset+20,true),nameLength=view.getUint16(offset+28,true),extraLength=view.getUint16(offset+30,true),commentLength=view.getUint16(offset+32,true),localOffset=view.getUint32(offset+42,true);const name=decoder.decode(bytes.slice(offset+46,offset+46+nameLength));entries.set(name,{method,compressedSize,localOffset});offset+=46+nameLength+extraLength+commentLength;
    }
    async function read(name){
      const entry=entries.get(name);if(!entry)return null;const local=entry.localOffset;if(view.getUint32(local,true)!==0x04034b50)return null;const nameLength=view.getUint16(local+26,true),extraLength=view.getUint16(local+28,true),start=local+30+nameLength+extraLength;const compressed=bytes.slice(start,start+entry.compressedSize);
      if(entry.method===0)return compressed;if(entry.method!==8)throw new Error('Excel 图片使用了不支持的压缩格式');if(!window.DecompressionStream)throw new Error('当前浏览器不能解压 Excel 内嵌图片');const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    return {entries,read};
  }
  function resolveZipPath(base,target){
    if(target.startsWith('/'))return target.slice(1);const parts=(base.split('/').slice(0,-1).concat(target.split('/'))),resolved=[];parts.forEach(part=>{if(!part||part==='.')return;if(part==='..')resolved.pop();else resolved.push(part)});return resolved.join('/');
  }
  async function compressEmbeddedImage(bytes,mime){
    const blob=new Blob([bytes],{type:mime});const url=URL.createObjectURL(blob);
    try{return await new Promise((resolve,reject)=>{const image=new Image();image.onerror=()=>reject(new Error('Excel 内嵌图片无法识别'));image.onload=()=>{const scale=Math.min(1,600/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/webp',.68))};image.src=url})}finally{URL.revokeObjectURL(url)}
  }
  async function extractXlsxImages(arrayBuffer){
    const reader=createZipReader(arrayBuffer),decoder=new TextDecoder('utf-8'),imagesByRow={};let processed=0;const drawings=[...reader.entries.keys()].filter(name=>/^xl\/drawings\/drawing\d+\.xml$/i.test(name)).sort();
    for(const drawingPath of drawings){
      const drawingBytes=await reader.read(drawingPath);if(!drawingBytes)continue;const drawingXml=decoder.decode(drawingBytes);const file=drawingPath.split('/').pop();const relsPath=`xl/drawings/_rels/${file}.rels`;const relsBytes=await reader.read(relsPath);if(!relsBytes)continue;const relsXml=decoder.decode(relsBytes),relations={};
      for(const tag of relsXml.match(/<Relationship\b[^>]*>/g)||[]){const id=tag.match(/\bId="([^"]+)"/i)?.[1],target=tag.match(/\bTarget="([^"]+)"/i)?.[1];if(id&&target)relations[id]=resolveZipPath(drawingPath,target)}
      const anchorPattern=/<xdr:(oneCellAnchor|twoCellAnchor)\b[\s\S]*?<\/xdr:\1>/gi;let anchor;
      while((anchor=anchorPattern.exec(drawingXml))){const block=anchor[0],row=Number(block.match(/<xdr:row>(\d+)<\/xdr:row>/i)?.[1]),embed=block.match(/<a:blip\b[^>]*\br:embed="([^"]+)"/i)?.[1];if(!Number.isInteger(row)||!embed||imagesByRow[row])continue;const mediaPath=relations[embed],media=mediaPath?await reader.read(mediaPath):null;if(!media)continue;const extension=mediaPath.split('.').pop().toLowerCase();const mime={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'}[extension];if(!mime)continue;try{imagesByRow[row]=await compressEmbeddedImage(media,mime);processed++;if(processed%25===0)window.dispatchEvent(new CustomEvent('inventory-import-progress',{detail:{processed}}))}catch(_){}
      }
    }
    return imagesByRow;
  }
  async function parseSpreadsheet(file){
    if(file.name.toLowerCase().endsWith('.csv'))return parseCsv(await file.text());const XLSX=await loadSheetJs();const buffer=await file.arrayBuffer();const book=XLSX.read(buffer,{type:'array'});if(!book.SheetNames.length)throw new Error('Excel 文件中没有工作表');const sheet=book.Sheets[book.SheetNames[0]];const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,blankrows:true});
    try{matrix._imagesByRow=await extractXlsxImages(buffer)}catch(error){matrix._imageError=error.message}try{matrix._rowOffset=XLSX.utils.decode_range(sheet['!ref']).s.r}catch(_){matrix._rowOffset=0}return matrix;
  }

  function groupPdfItems(items){const rows=[];items.filter(item=>String(item.str||'').trim()).sort((a,b)=>b.transform[5]-a.transform[5]||a.transform[4]-b.transform[4]).forEach(item=>{const y=item.transform[5];let row=rows.find(r=>Math.abs(r.y-y)<3);if(!row){row={y,items:[]};rows.push(row)}row.items.push({text:String(item.str).trim(),x:item.transform[4]})});return rows.sort((a,b)=>b.y-a.y).map(row=>({y:row.y,items:row.items.sort((a,b)=>a.x-b.x)}))}
  function pdfRowsToMatrix(grouped){
    let headerIndex=-1,headers=[];for(let i=0;i<Math.min(grouped.length,20);i++){const found=grouped[i].items.map(item=>({...item,key:canonicalHeader(item.text)})).filter(x=>x.key);if(new Set(found.map(x=>x.key)).size>=4){headerIndex=i;headers=found;break}}if(headerIndex<0)return [];
    headers=headers.filter((header,index,list)=>list.findIndex(x=>x.key===header.key)===index).sort((a,b)=>a.x-b.x);const boundaries=headers.slice(0,-1).map((h,i)=>(h.x+headers[i+1].x)/2),matrix=[headers.map(h=>h.key)];grouped.slice(headerIndex+1).forEach(row=>{const cells=headers.map(()=>[]);row.items.forEach(item=>{let col=boundaries.findIndex(boundary=>item.x<boundary);if(col<0)col=headers.length-1;cells[col].push(item.text)});const values=cells.map(parts=>parts.join(' ').trim());if(values.filter(Boolean).length>=3)matrix.push(values)});return matrix;
  }
  async function parsePdf(file){
    let pdfjs;try{pdfjs=await import(PDF_URL)}catch(_){throw new Error('PDF 读取组件无法加载，请检查网络；也可以将表格另存为 Excel 或 CSV')}pdfjs.GlobalWorkerOptions.workerSrc=PDF_WORKER_URL;const pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise,all=[];
    for(let pageNumber=1;pageNumber<=pdf.numPages;pageNumber++){const page=await pdf.getPage(pageNumber),content=await page.getTextContent(),matrix=pdfRowsToMatrix(groupPdfItems(content.items));if(matrix.length){if(!all.length)all.push(matrix[0]);all.push(...matrix.slice(1))}}if(!all.length)throw new Error('PDF 中没有识别到标准库存表格；扫描版 PDF 请先转换为 Excel');return all;
  }
  async function parseFile(file){const lower=file.name.toLowerCase();if(lower.endsWith('.pdf'))return parsePdf(file);if(/\.(xlsx|xls|csv)$/.test(lower))return parseSpreadsheet(file);throw new Error('请选择 .xlsx、.xls、.csv 或 .pdf 文件')}
  function numberValue(value){const cleaned=String(value??'').replace(/\s/g,'').replace('€','').replace(',','.').replace(/[^0-9.\-]/g,''),number=Number(cleaned);return Number.isFinite(number)?number:NaN}
  function discountValue(value){const text=String(value??'').trim();if(!text)return 0;let number=numberValue(text);if(!Number.isFinite(number))return NaN;if(text.includes('折'))number=1-number/10;else if(text.includes('%')||Math.abs(number)>1)number=Math.abs(number)/100;else number=Math.abs(number);return number>=0&&number<1?number:NaN}
  function rowPhoto(matrix,rowIndex,map,row){const cell=map.photo===undefined?'':String(row[map.photo]??'').trim();return matrix._imagesByRow?.[(matrix._rowOffset||0)+rowIndex]||window.StoreData?.safeImage?.(cell)||(/^(data:image\/(?:png|jpe?g|webp);base64,|https?:\/\/)/i.test(cell)?cell:'')}

  function normalize(matrix){
    const errors=[],warnings=[],records=[];let headerRow=-1,map={},sizeColumns=[],mode='';
    for(let i=0;i<Math.min(matrix.length,20);i++){
      const candidate={};matrix[i].forEach((cell,index)=>{const key=canonicalHeader(cell);if(key&&!Object.prototype.hasOwnProperty.call(candidate,key))candidate[key]=index});const wideSizes=matrix[i].map((cell,index)=>({size:sizeFromHeader(cell),index})).filter(item=>item.size);
      if(candidate.sku!==undefined&&candidate.color!==undefined&&wideSizes.length){headerRow=i;map=candidate;sizeColumns=wideSizes;mode='wide';break}
      if(['sku','color','size','price','discount','quantity'].filter(key=>candidate[key]!==undefined).length>=5){headerRow=i;map=candidate;mode='long';break}
    }
    if(headerRow<0)return {records,errors:['没有找到库存表头。可使用横向尺码列模板，或包含款号、颜色、尺寸、价格、折扣、数量的明细表。'],warnings};
    if(map.photo!==undefined&&!Object.keys(matrix._imagesByRow||{}).length)warnings.push(matrix._imageError?`PHOTO 列已识别，但图片提取失败：${matrix._imageError}`:'PHOTO 列已识别，但没有检测到 Excel 内嵌图片。请把图片真正插入单元格区域，而不是填写本地文件路径。');
    matrix.slice(headerRow+1).forEach((row,offset)=>{
      const rowIndex=headerRow+offset+1,line=rowIndex+1+(matrix._rowOffset||0);if(!row||!row.some(cell=>String(cell??'').trim()))return;
      const sku=String(row[map.sku]??'').trim().toUpperCase(),name=map.name===undefined?'':String(row[map.name]??'').trim(),rawCategory=map.category===undefined?'':String(row[map.category]??'').trim(),category=categoryValue(rawCategory),composition=map.composition===undefined?'':String(row[map.composition]??'').trim(),color=String(row[map.color]??'').trim(),image=rowPhoto(matrix,rowIndex,map,row),lineErrors=[];
      if(!sku)lineErrors.push('款号为空');if(rawCategory&&!category)lineErrors.push(`品类“${rawCategory}”不在标准服装品类中`);if(!color)lineErrors.push('颜色为空');
      const original=map.price===undefined?0:numberValue(row[map.price]),discount=map.discount===undefined?0:discountValue(row[map.discount]);if(!Number.isFinite(original)||original<0)lineErrors.push('价格无效');if(!Number.isFinite(discount))lineErrors.push('折扣无效');
      if(mode==='wide'){
        const quantities=[];sizeColumns.forEach(column=>{const raw=String(row[column.index]??'').trim();if(!raw)return;const quantity=numberValue(raw);if(!Number.isInteger(quantity)||quantity<0)lineErrors.push(`${column.size} 数量必须是非负整数`);else quantities.push({size:column.size,quantity})});
        const sum=quantities.reduce((total,item)=>total+item.quantity,0),declared=map.total===undefined?NaN:numberValue(row[map.total]);if(Number.isFinite(declared)&&declared!==sum)warnings.push(`第 ${line} 行：QTE TOTAL 为 ${declared}，尺码数量合计为 ${sum}，系统采用尺码合计。`);if(!quantities.length)lineErrors.push('没有填写任何尺码数量');
        if(lineErrors.length){errors.push(`第 ${line} 行：${lineErrors.join('；')}`);return}quantities.forEach(item=>records.push({sku,name,category:category||'autres',composition,color,size:item.size,original:Number(original.toFixed(2)),discount:Number(discount.toFixed(4)),price:Number((original*(1-discount)).toFixed(2)),quantity:item.quantity,image}));
      }else{
        const size=String(row[map.size]??'').trim().toUpperCase(),quantity=numberValue(row[map.quantity]);if(!sizes.includes(size))lineErrors.push(`尺码“${size||'空'}”不在 ${sizes.join('/')} 中`);if(!Number.isInteger(quantity)||quantity<0)lineErrors.push('数量必须是非负整数');if(lineErrors.length){errors.push(`第 ${line} 行：${lineErrors.join('；')}`);return}records.push({sku,name,category:category||'autres',composition,color,size,original:Number(original.toFixed(2)),discount:Number(discount.toFixed(4)),price:Number((original*(1-discount)).toFixed(2)),quantity,image});
      }
    });
    const details=new Map();records.forEach(record=>{if(!details.has(record.sku))details.set(record.sku,{name:'',category:'autres',composition:''});const detail=details.get(record.sku);if(record.name)detail.name=record.name;if(record.category!=='autres')detail.category=record.category;if(record.composition)detail.composition=record.composition});records.forEach(record=>{const detail=details.get(record.sku);if(!record.name)record.name=detail.name;if(record.category==='autres')record.category=detail.category;if(!record.composition)record.composition=detail.composition});
    if(!records.length&&!errors.length)errors.push('文件中没有库存数据行');const duplicates=new Map();records.forEach(record=>{const key=[record.sku,record.color.toLowerCase(),record.size].join('|');duplicates.set(key,(duplicates.get(key)||0)+1)});const duplicateCount=[...duplicates.values()].filter(count=>count>1).length;if(duplicateCount)warnings.push(`${duplicateCount} 个重复规格已自动合并，数量将相加。`);const photoCount=new Set(records.filter(record=>record.image).map(record=>`${record.sku}|${record.color}`)).size;if(photoCount)warnings.push(`已从 Excel 提取并压缩 ${photoCount} 张商品照片。`);return {records,errors,warnings,mode};
  }
  async function downloadTemplate(){
    const rows=[['PHOTO','CATEGORIE','COMPOSITION','REFERENCE','COULEUR','F','XS','S','M','L','XL','S/M','M/L','QTE TOTAL','PRIX','REMISE'],['','PANTALON','100% coton','W20754','TAUPE','','','2','','','','','','2',49.9,30],['','JUPE','100% coton','S20302','ECRU','','','1','','','','','','1',39.9,20],['','ROBE','100% laine','S20248','BORDEAUX','','','','','','','8','8','16',79.9,40]];
    try{const XLSX=await loadSheetJs(),book=XLSX.utils.book_new(),sheet=XLSX.utils.aoa_to_sheet(rows);sheet['!cols']=[{wch:16},{wch:16},{wch:20},{wch:14},{wch:14},...Array(8).fill({wch:8}),{wch:12},{wch:11},{wch:11}];sheet['!rows']=[{hpt:34},{hpt:65},{hpt:65},{hpt:65}];XLSX.utils.book_append_sheet(book,sheet,'库存表');XLSX.writeFile(book,'库存导入模板_含照片.xlsx');return 'xlsx'}catch(_){const csv='\ufeff'+rows.map(row=>row.map(cell=>`"${String(cell).replace(/"/g,'""')}"`).join(';')).join('\r\n'),url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download='库存导入模板_横向尺码.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return 'csv'}
  }
  window.InventoryImport={parseFile,normalize,downloadTemplate,sizes};
})();


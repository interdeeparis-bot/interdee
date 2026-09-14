(function(){
  'use strict';
  const XLSX_URL='https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  const JSPDF_URL='https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
  let xlsxPromise,pdfPromise;
  function load(url,ready){if(ready())return Promise.resolve(ready());return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=url;s.onload=()=>resolve(ready());s.onerror=()=>reject(new Error('导出组件加载失败，请检查网络后重试。'));document.head.appendChild(s)})}
  const getXlsx=()=>xlsxPromise||(xlsxPromise=load(XLSX_URL,()=>window.XLSX));
  const getPdf=()=>pdfPromise||(pdfPromise=load(JSPDF_URL,()=>window.jspdf?.jsPDF));
  const safe=(v,f='')=>String(v??'').trim()||f;
  const filename=v=>safe(v,'PROFORMA').replace(/[\\/:*?"<>|\u0000-\u001f]/g,'-').slice(0,90);
  const money=(value,currency)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:currency||'EUR'}).format(Number(value)||0);
  function normalize(data){
    const lines=(data.lines||[]).filter(x=>Number(x.quantity)>0).map((x,i)=>({...x,sequence:i+1,quantity:Number(x.quantity)||0,unitPrice:Number(x.unitPrice)||0,total:(Number(x.quantity)||0)*(Number(x.unitPrice)||0)}));
    return {...data,lines,totalQty:lines.reduce((s,x)=>s+x.quantity,0),total:lines.reduce((s,x)=>s+x.total,0)};
  }
  async function excel(raw){
    const data=normalize(raw),XLSX=await getXlsx();
    const rows=[['PROFORMA INVOICE'],[],['Seller',data.sellerName],['Brand',data.sellerBrand],['Seller address',data.sellerAddress],['VAT / SIRET',data.sellerTaxId],['Email',data.sellerEmail],[],['Customer',data.customerName],['Customer code',data.customerCode],['Billing address',data.billingAddress],['VAT number',data.vatNumber],['Email',data.email],['Phone',data.phone],[],['Proforma no.',data.orderNumber],['Date',data.orderDate],['Season',data.season],['Estimated delivery',data.delivery],['Payment terms',data.paymentTerms],['Currency',data.currency],[],['No.','REFERENCE','CATEGORY','COLOUR','SIZE','QTY','UNIT PRICE','TOTAL']];
    data.lines.forEach(x=>rows.push([x.sequence,x.reference,x.category,x.color,x.size,x.quantity,x.unitPrice,x.total]));
    rows.push(['','','','','TOTAL QTY',data.totalQty,'TOTAL',data.total]);
    if(data.note)rows.push([],['Notes',data.note]);
    const ws=XLSX.utils.aoa_to_sheet(rows),header=22,final=header+data.lines.length;
    ws['!cols']=[{wch:7},{wch:18},{wch:18},{wch:18},{wch:12},{wch:10},{wch:14},{wch:16}];
    ws['!merges']=[{s:{r:0,c:0},e:{r:0,c:7}}];
    ws['!autofilter']={ref:`A23:H${Math.max(23,final)}`};
    for(let c=0;c<8;c++){const h=ws[XLSX.utils.encode_cell({r:header,c})];if(h)h.s={fill:{fgColor:{rgb:'19231F'}},font:{bold:true,color:{rgb:'FFFFFF'}},alignment:{horizontal:'center'}}}
    for(let r=header+1;r<=final;r++)for(let c=0;c<8;c++){const cell=ws[XLSX.utils.encode_cell({r,c})];if(cell)cell.s={border:{top:{style:'thin',color:{rgb:'D9DDD9'}},bottom:{style:'thin',color:{rgb:'D9DDD9'}},left:{style:'thin',color:{rgb:'D9DDD9'}},right:{style:'thin',color:{rgb:'D9DDD9'}}},alignment:{vertical:'center'},...(c>=5?{numFmt:c>=6?'#,##0.00':'0'}:{})}}
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,'Proforma');XLSX.writeFile(wb,`${filename(data.orderNumber)}-Proforma.xlsx`,{compression:true,cellStyles:true});
  }
  function wrap(ctx,text,maxWidth,maxLines=3){const words=safe(text).split(/\s+/),lines=[];let line='';for(const word of words){const next=line?line+' '+word:word;if(line&&ctx.measureText(next).width>maxWidth){lines.push(line);line=word;if(lines.length>=maxLines-1)break}else line=next}if(line&&lines.length<maxLines)lines.push(line);return lines.length?lines:['']}
  function cell(ctx,text,x,y,w,h,opt={}){ctx.fillStyle=opt.fill||'#fff';ctx.fillRect(x,y,w,h);ctx.strokeStyle='#d8dcd8';ctx.strokeRect(x,y,w,h);ctx.fillStyle=opt.color||'#19231f';ctx.font=`${opt.bold?'700':'400'} ${opt.font||15}px Arial, sans-serif`;ctx.textAlign=opt.align||'left';ctx.textBaseline='middle';const lines=wrap(ctx,text,w-16,2),lh=(opt.font||15)+3,start=y+h/2-(lines.length-1)*lh/2;lines.forEach((line,i)=>ctx.fillText(line,opt.align==='center'?x+w/2:x+8,start+i*lh,w-16))}
  function pageCanvas(data,lines,page,pageCount,last){
    const cv=document.createElement('canvas');cv.width=1600;cv.height=1130;const c=cv.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,1600,1130);
    c.fillStyle='#19231f';c.fillRect(0,0,1600,18);c.font='700 38px Georgia, serif';c.fillText('INTERDEE',55,70);c.font='700 27px Arial, sans-serif';c.textAlign='right';c.fillText('PROFORMA INVOICE',1545,66);c.font='400 14px Arial, sans-serif';c.fillStyle='#6d756f';c.fillText(`PAGE ${page} / ${pageCount}`,1545,93);c.textAlign='left';
    c.fillStyle='#f3f1ec';c.fillRect(55,115,1490,150);c.fillStyle='#19231f';c.font='700 14px Arial, sans-serif';c.fillText('SELLER',78,145);c.fillText('BILL TO',580,145);c.fillText('ORDER',1130,145);c.font='400 16px Arial, sans-serif';
    wrap(c,[data.sellerName,data.sellerBrand,data.sellerAddress,data.sellerTaxId,data.sellerEmail].filter(Boolean).join(' · '),450,4).forEach((x,i)=>c.fillText(x,78,175+i*23));
    wrap(c,[data.customerName,data.customerCode,data.billingAddress,data.vatNumber,data.email,data.phone].filter(Boolean).join(' · '),500,4).forEach((x,i)=>c.fillText(x,580,175+i*23));
    [['NO.',data.orderNumber],['DATE',data.orderDate],['SEASON',data.season],['DELIVERY',data.delivery]].forEach((x,i)=>{c.font='700 13px Arial';c.fillText(x[0],1130,175+i*23);c.font='400 15px Arial';c.fillText(safe(x[1],'—'),1240,175+i*23)});
    const widths=[60,215,205,205,110,90,150,175],headers=['NO.','REFERENCE','CATEGORY','COLOUR','SIZE','QTY','UNIT PRICE','TOTAL'];let y=295,x=55;headers.forEach((h,i)=>{cell(c,h,x,y,widths[i],46,{fill:'#19231f',color:'#fff',bold:true,align:'center',font:14});x+=widths[i]});y+=46;
    lines.forEach(row=>{x=55;[row.sequence,row.reference,row.category,row.color,row.size,row.quantity,money(row.unitPrice,data.currency),money(row.total,data.currency)].forEach((v,i)=>{cell(c,v,x,y,widths[i],50,{align:i===0||i>=4?'center':'left'});x+=widths[i]});y+=50});
    if(last){x=55;const values=['','','','','TOTAL',data.totalQty,'AMOUNT',money(data.total,data.currency)];values.forEach((v,i)=>{cell(c,v,x,y,widths[i],54,{fill:i>=4?'#f3f1ec':'#fff',bold:i>=4,align:i===0||i>=4?'center':'left'});x+=widths[i]});y+=78;c.font='700 14px Arial';c.fillStyle='#19231f';c.fillText('PAYMENT TERMS',55,y);c.font='400 15px Arial';c.fillText(safe(data.paymentTerms,'—'),220,y);if(data.note){c.font='700 14px Arial';c.fillText('NOTES',55,y+34);c.font='400 15px Arial';wrap(c,data.note,1250,2).forEach((t,i)=>c.fillText(t,220,y+34+i*20))}}
    c.fillStyle='#b21f3d';c.fillRect(55,1080,100,4);c.fillStyle='#6d756f';c.font='400 13px Arial';c.textAlign='right';c.fillText(`${safe(data.sellerName,'DOOS')} · ${safe(data.sellerEmail,'INTERDEE')}`,1545,1084);return cv;
  }
  async function pdf(raw){const data=normalize(raw),JsPdf=await getPdf(),perPage=11,pages=Math.max(1,Math.ceil(data.lines.length/perPage)),doc=new JsPdf({orientation:'landscape',unit:'mm',format:'a4',compress:true});for(let i=0;i<pages;i++){if(i)doc.addPage('a4','landscape');const canvas=pageCanvas(data,data.lines.slice(i*perPage,(i+1)*perPage),i+1,pages,i===pages-1);doc.addImage(canvas.toDataURL('image/jpeg',.94),'JPEG',0,0,297,210,undefined,'FAST')}doc.save(`${filename(data.orderNumber)}-Proforma.pdf`)}
  window.ProformaExport={excel,pdf,normalize};
}());

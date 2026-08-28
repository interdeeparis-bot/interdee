(function () {
  'use strict';

  const SHEET_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  const HTML2PDF_URL = 'https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.1/dist/html2pdf.bundle.min.js';
  const SIZES = ['F', 'XS', 'S', 'M', 'L', 'XL', 'S/M', 'M/L'];
  const HEADERS = ['序号', 'CATEGORIE', 'COMPOSITION', 'REFERENCE', 'COULEUR', 'F', 'XS(2岁)', 'S（4岁）', 'M（6岁）', 'L（8岁）', 'XL（10岁）', 'S/M', 'M/L', 'QTE TOTAL', 'PRIX'];
  let sheetPromise;
  let pdfPromise;

  function loadScript(url, ready) {
    if (ready()) return Promise.resolve(ready());
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      script.onload = () => resolve(ready());
      script.onerror = () => reject(new Error('下载组件加载失败，请检查网络后重试。'));
      document.head.appendChild(script);
    });
  }

  function loadSheetJs() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (!sheetPromise) sheetPromise = loadScript(SHEET_URL, () => window.XLSX);
    return sheetPromise;
  }

  function loadHtml2Pdf() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    if (!pdfPromise) pdfPromise = loadScript(HTML2PDF_URL, () => window.html2pdf);
    return pdfPromise;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
  }

  function safeFilePart(value, fallback) {
    const clean = String(value || '').trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, '-').slice(0, 70);
    return clean || fallback;
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function normalizeSize(value) {
    const text = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!text) return 'F';
    if (text === 'SM' || text === 'S-M') return 'S/M';
    if (text === 'ML' || text === 'M-L') return 'M/L';
    return SIZES.find(size => size.toUpperCase() === text) || 'F';
  }

  function buildModel(order, products, statusLabels) {
    const customer = order && order.customer || {};
    const productById = new Map((products || []).map(product => [String(product.id), product]));
    const grouped = new Map();
    const items = Array.isArray(order && order.items) ? order.items : [];

    items.forEach(item => {
      const reference = String(item.id || item.reference || '').trim();
      const product = productById.get(reference) || {};
      const color = String(item.color || '').trim();
      const price = number(item.price);
      const key = [reference, color, price].join('\u0001');
      if (!grouped.has(key)) {
        grouped.set(key, {
          category: String(product.label || product.category || item.category || '').toUpperCase(),
          composition: String(product.composition || item.composition || ''),
          reference,
          color,
          sizes: Object.fromEntries(SIZES.map(size => [size, 0])),
          price,
        });
      }
      const row = grouped.get(key);
      row.sizes[normalizeSize(item.size)] += Math.max(1, Math.floor(number(item.quantity) || 1));
    });

    const rows = [...grouped.values()].map((row, index) => ({
      ...row,
      sequence: index + 1,
      quantity: SIZES.reduce((sum, size) => sum + row.sizes[size], 0),
    }));
    const calculatedTotal = rows.reduce((sum, row) => sum + row.quantity * row.price, 0);
    const code = String(order && (order.public_code || order.id && order.id.slice(0, 8)) || 'ORDER');
    const createdAt = order && order.created_at ? new Date(order.created_at).toLocaleString('zh-CN') : '';
    const note = String(customer.note || customer.message || order && order.note || '');
    return {
      code,
      createdAt,
      status: statusLabels && statusLabels[order && order.status] || order && order.status || '',
      customer: {
        name: String(customer.name || ''),
        phone: String(customer.phone || ''),
        email: String(customer.email || ''),
        note,
      },
      rows,
      totalQuantity: rows.reduce((sum, row) => sum + row.quantity, 0),
      totalAmount: number(order && order.total) || calculatedTotal,
      filename: `INTERDEE-订单-${safeFilePart(code, 'ORDER')}-${safeFilePart(customer.name, 'CLIENT')}`,
    };
  }

  function excelBorder() {
    const side = { style: 'thin', color: { rgb: 'B7C9E2' } };
    return { top: side, right: side, bottom: side, left: side };
  }

  function applyExcelStyles(XLSX, sheet, rowCount, totalRow, infoStart) {
    const headerStyle = { fill: { fgColor: { rgb: '4472C4' } }, font: { name: 'Arial', sz: 14, bold: true, color: { rgb: 'FFFFFF' } }, alignment: { horizontal: 'center', vertical: 'center' }, border: excelBorder() };
    const textStyle = { font: { name: 'Arial', sz: 10 }, alignment: { vertical: 'center' }, border: excelBorder() };
    const centeredStyle = { font: { name: 'Arial', sz: 10 }, alignment: { horizontal: 'center', vertical: 'center' }, border: excelBorder() };
    const moneyStyle = { ...centeredStyle, numFmt: '#,##0.00 "€"' };
    for (let column = 0; column < HEADERS.length; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
      if (cell) cell.s = headerStyle;
    }
    for (let row = 1; row <= rowCount; row += 1) {
      for (let column = 0; column < HEADERS.length; column += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
        if (cell) cell.s = column >= 5 ? (column === 14 ? moneyStyle : centeredStyle) : textStyle;
      }
    }
    for (let column = 0; column < HEADERS.length; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: totalRow, c: column })];
      if (cell) cell.s = { ...(column === 0 ? headerStyle : centeredStyle), font: { name: 'Arial', sz: 11, bold: true, color: column === 0 ? { rgb: 'FFFFFF' } : { rgb: '17251E' } }, ...(column === 14 ? { numFmt: '#,##0.00 "€"' } : {}) };
    }
    for (let row = infoStart; row < infoStart + 7; row += 1) {
      const label = sheet[XLSX.utils.encode_cell({ r: row, c: 0 })];
      const value = sheet[XLSX.utils.encode_cell({ r: row, c: 1 })];
      if (label) label.s = { fill: { fgColor: { rgb: 'DCE6F1' } }, font: { name: 'Arial', sz: 10, bold: true, color: { rgb: '173529' } }, alignment: { vertical: 'center' }, border: excelBorder() };
      if (value) value.s = { font: { name: 'Arial', sz: 10 }, alignment: { vertical: 'center', wrapText: true }, border: excelBorder() };
    }
    sheet['!cols'] = [{ wch: 8 }, { wch: 19 }, { wch: 25 }, { wch: 18 }, { wch: 17 }, { wch: 7 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 11 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 14 }];
    sheet['!rows'] = [{ hpt: 31 }, ...Array(rowCount).fill({ hpt: 22 }), { hpt: 25 }];
    sheet['!autofilter'] = { ref: `A1:O${Math.max(2, rowCount + 1)}` };
    sheet['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft', state: 'frozen' };
  }

  async function downloadExcel(order, products, statusLabels) {
    const XLSX = await loadSheetJs();
    const model = buildModel(order, products, statusLabels);
    const sizeTotals = Object.fromEntries(SIZES.map(size => [size, model.rows.reduce((sum, row) => sum + row.sizes[size], 0)]));
    const data = [HEADERS];
    model.rows.forEach(row => data.push([row.sequence, row.category, row.composition, row.reference, row.color, ...SIZES.map(size => row.sizes[size] || ''), row.quantity, row.price]));
    data.push(['合计', '/', '/', '/', '/', ...SIZES.map(size => sizeTotals[size] || ''), model.totalQuantity, model.totalAmount]);
    data.push([]);
    const infoStart = data.length;
    data.push(['订单号', model.code]);
    data.push(['客户姓名', model.customer.name]);
    data.push(['电话', model.customer.phone]);
    data.push(['邮箱', model.customer.email]);
    data.push(['订单状态', model.status]);
    data.push(['提交时间', model.createdAt]);
    data.push(['客户备注', model.customer.note || '无备注']);

    const sheet = XLSX.utils.aoa_to_sheet(data);
    sheet['!merges'] = Array.from({ length: 7 }, (_, index) => ({ s: { r: infoStart + index, c: 1 }, e: { r: infoStart + index, c: 14 } }));
    applyExcelStyles(XLSX, sheet, model.rows.length, model.rows.length + 1, infoStart);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, safeFilePart(model.customer.name || model.code, '订单').slice(0, 31));
    XLSX.writeFile(book, `${model.filename}.xlsx`, { compression: true, cellStyles: true });
    return model;
  }

  function pdfTable(model) {
    const rows = model.rows.map(row => `<tr><td>${row.sequence}</td><td>${escapeHtml(row.category)}</td><td>${escapeHtml(row.composition)}</td><td><strong>${escapeHtml(row.reference)}</strong></td><td>${escapeHtml(row.color)}</td>${SIZES.map(size => `<td>${row.sizes[size] || ''}</td>`).join('')}<td><strong>${row.quantity}</strong></td><td>${row.price.toFixed(2)} €</td></tr>`).join('');
    const sizeTotals = Object.fromEntries(SIZES.map(size => [size, model.rows.reduce((sum, row) => sum + row.sizes[size], 0)]));
    return `<table><thead><tr>${HEADERS.map(header => `<th>${escapeHtml(header)}</th>`).join('')}</tr></thead><tbody>${rows}<tr class="total"><td>合计</td><td>/</td><td>/</td><td>/</td><td>/</td>${SIZES.map(size => `<td>${sizeTotals[size] || ''}</td>`).join('')}<td>${model.totalQuantity}</td><td>${model.totalAmount.toFixed(2)} €</td></tr></tbody></table>`;
  }

  async function downloadPdf(order, products, statusLabels) {
    const html2pdf = await loadHtml2Pdf();
    const model = buildModel(order, products, statusLabels);
    const root = document.createElement('section');
    root.className = 'order-pdf-document';
    root.style.cssText = 'position:fixed;left:-100000px;top:0;width:1080px;background:#fff;color:#17251e;padding:28px;font-family:Arial,"Microsoft YaHei",sans-serif;';
    root.innerHTML = `<style>.order-pdf-document h1{font-size:24px;margin:0;color:#173529}.order-pdf-document .subtitle{margin:4px 0 18px;color:#64736c}.order-pdf-document .info{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:14px}.order-pdf-document .info div{border:1px solid #dce3df;padding:7px 9px;font-size:10px}.order-pdf-document .info strong{display:block;color:#4472c4;margin-bottom:2px}.order-pdf-document .note{grid-column:1/-1;white-space:pre-wrap}.order-pdf-document table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:7.5px}.order-pdf-document th{background:#4472c4;color:white;font-weight:bold;padding:7px 3px;border:1px solid #2f5597;text-align:center}.order-pdf-document td{padding:6px 3px;border:1px solid #b7c9e2;text-align:center;word-break:break-word}.order-pdf-document th:nth-child(2),.order-pdf-document td:nth-child(2){width:9%}.order-pdf-document th:nth-child(3),.order-pdf-document td:nth-child(3){width:13%}.order-pdf-document th:nth-child(4),.order-pdf-document td:nth-child(4){width:9%}.order-pdf-document th:nth-child(5),.order-pdf-document td:nth-child(5){width:8%}.order-pdf-document .total td{font-weight:bold;background:#edf3fa}.order-pdf-document .total td:first-child{background:#4472c4;color:#fff}</style><h1>INTERDEE · 客户订单</h1><p class="subtitle">订单号：${escapeHtml(model.code)} · ${escapeHtml(model.status)} · ${escapeHtml(model.createdAt)}</p><div class="info"><div><strong>客户姓名</strong>${escapeHtml(model.customer.name)}</div><div><strong>电话</strong>${escapeHtml(model.customer.phone)}</div><div><strong>邮箱</strong>${escapeHtml(model.customer.email)}</div><div class="note"><strong>客户备注</strong>${escapeHtml(model.customer.note || '无备注')}</div></div>${pdfTable(model)}`;
    document.body.appendChild(root);
    try {
      await html2pdf().set({ margin: 5, filename: `${model.filename}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }, pagebreak: { mode: ['css', 'legacy'], avoid: ['tr'] } }).from(root).save();
    } finally {
      root.remove();
    }
    return model;
  }

  window.OrderExport = { buildModel, downloadExcel, downloadPdf };
}());

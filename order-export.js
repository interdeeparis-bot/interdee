(function () {
  'use strict';

  const SHEET_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  const JSPDF_URL = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
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

  function loadJsPdf() {
    if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
    if (!pdfPromise) pdfPromise = loadScript(JSPDF_URL, () => window.jspdf && window.jspdf.jsPDF);
    return pdfPromise;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character]));
  }

  function safeFilePart(value, fallback) {
    const clean = String(value || '').trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').replace(/\s+/g, '-').slice(0, 70);
    return clean || fallback;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
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

  function wrapCanvasText(context, value, maxWidth, maxLines = 2) {
    const text = String(value == null ? '' : value);
    if (!text) return [''];
    const characters = [...text];
    const lines = [];
    let line = '';
    for (const character of characters) {
      const next = line + character;
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line);
        line = character;
        if (lines.length === maxLines - 1) break;
      } else line = next;
    }
    if (lines.length < maxLines) {
      const consumed = lines.join('').length;
      const remainder = characters.slice(consumed).join('');
      let finalLine = remainder;
      while (context.measureText(finalLine).width > maxWidth && finalLine.length > 1) finalLine = finalLine.slice(0, -1);
      if (finalLine.length < remainder.length && finalLine.length > 1) finalLine = finalLine.slice(0, -1) + '…';
      lines.push(finalLine);
    }
    return lines.slice(0, maxLines);
  }

  function drawCell(context, text, x, y, width, height, options = {}) {
    context.fillStyle = options.fill || '#ffffff';
    context.fillRect(x, y, width, height);
    context.strokeStyle = options.border || '#b7c9e2';
    context.lineWidth = 1;
    context.strokeRect(x, y, width, height);
    context.fillStyle = options.color || '#17251e';
    context.font = `${options.bold ? '700' : '400'} ${options.fontSize || 15}px Arial, "Microsoft YaHei", sans-serif`;
    context.textAlign = options.align || 'center';
    context.textBaseline = 'middle';
    const padding = 7;
    const lines = wrapCanvasText(context, text, width - padding * 2, options.maxLines || 2);
    const lineHeight = (options.fontSize || 15) + 3;
    const startY = y + height / 2 - (lines.length - 1) * lineHeight / 2;
    lines.forEach((line, index) => context.fillText(line, options.align === 'left' ? x + padding : x + width / 2, startY + index * lineHeight, width - padding * 2));
  }

  function pdfRowValues(row) {
    return [row.sequence, row.category, row.composition, row.reference, row.color, ...SIZES.map(size => row.sizes[size] || ''), row.quantity, `${row.price.toFixed(2)} €`];
  }

  function makePdfCanvas(model, rows, pageNumber, pageCount, includeTotal) {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 1130;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#173529';
    context.font = '700 34px Arial, "Microsoft YaHei", sans-serif';
    context.textAlign = 'left';
    context.fillText('INTERDEE · CLIENT ORDER', 30, 48);
    context.font = '400 16px Arial, "Microsoft YaHei", sans-serif';
    context.fillStyle = '#5f6f67';
    context.fillText(`ORDER: ${model.code}   STATUS: ${model.status}   DATE: ${model.createdAt}   PAGE: ${pageNumber}/${pageCount}`, 30, 78);
    let tableY = 108;
    if (pageNumber === 1) {
      context.font = '700 16px Arial, "Microsoft YaHei", sans-serif';
      context.fillStyle = '#4472c4';
      context.fillText('CLIENT', 30, 112);
      context.fillStyle = '#17251e';
      context.font = '400 16px Arial, "Microsoft YaHei", sans-serif';
      context.fillText(`${model.customer.name}   |   ${model.customer.phone}   |   ${model.customer.email}`, 105, 112);
      context.font = '700 16px Arial, "Microsoft YaHei", sans-serif';
      context.fillStyle = '#4472c4';
      context.fillText('NOTE', 30, 140);
      context.fillStyle = '#17251e';
      context.font = '400 16px Arial, "Microsoft YaHei", sans-serif';
      const noteLines = wrapCanvasText(context, model.customer.note || '无备注', 1420, 2);
      noteLines.forEach((line, index) => context.fillText(line, 105, 140 + index * 20));
      tableY = 180;
    }
    const rawWidths = [50, 150, 220, 145, 125, 50, 60, 60, 60, 60, 65, 65, 65, 95, 105];
    const available = 1540;
    const scale = available / rawWidths.reduce((sum, value) => sum + value, 0);
    const widths = rawWidths.map(value => value * scale);
    const rowHeight = 52;
    let x = 30;
    HEADERS.forEach((header, index) => {
      drawCell(context, header, x, tableY, widths[index], 50, { fill: '#4472c4', color: '#ffffff', border: '#2f5597', bold: true, fontSize: 15 });
      x += widths[index];
    });
    let y = tableY + 50;
    rows.forEach(row => {
      x = 30;
      pdfRowValues(row).forEach((value, index) => {
        drawCell(context, value, x, y, widths[index], rowHeight, { align: index >= 1 && index <= 4 ? 'left' : 'center', bold: index === 3 || index === 13, fontSize: 15 });
        x += widths[index];
      });
      y += rowHeight;
    });
    if (includeTotal) {
      const sizeTotals = Object.fromEntries(SIZES.map(size => [size, model.rows.reduce((sum, row) => sum + row.sizes[size], 0)]));
      const values = ['合计', '/', '/', '/', '/', ...SIZES.map(size => sizeTotals[size] || ''), model.totalQuantity, `${model.totalAmount.toFixed(2)} €`];
      x = 30;
      values.forEach((value, index) => {
        drawCell(context, value, x, y, widths[index], rowHeight, { fill: index === 0 ? '#4472c4' : '#edf3fa', color: index === 0 ? '#ffffff' : '#17251e', bold: true, fontSize: 15 });
        x += widths[index];
      });
    }
    context.fillStyle = '#66726c';
    context.font = '400 13px Arial, sans-serif';
    context.textAlign = 'right';
    context.fillText('INTERDEE PARIS', 1570, 1105);
    return canvas;
  }

  async function downloadPdf(order, products, statusLabels) {
    const JsPdf = await loadJsPdf();
    const model = buildModel(order, products, statusLabels);
    const rowsPerPage = 14;
    const pageCount = Math.max(1, Math.ceil(model.rows.length / rowsPerPage));
    const pdf = new JsPdf({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
      if (pageIndex) pdf.addPage('a4', 'landscape');
      const start = pageIndex * rowsPerPage;
      const pageRows = model.rows.slice(start, start + rowsPerPage);
      const canvas = makePdfCanvas(model, pageRows, pageIndex + 1, pageCount, pageIndex === pageCount - 1);
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', 0, 0, 297, 210, undefined, 'FAST');
    }
    const blob = pdf.output('blob');
    if (!(blob instanceof Blob) || blob.size < 10000) throw new Error('PDF 内容生成失败，请刷新后台后重试。');
    downloadBlob(blob, `${model.filename}.pdf`);
    model.pdfBytes = blob.size;
    return model;
  }

  window.OrderExport = { buildModel, downloadExcel, downloadPdf };
}());

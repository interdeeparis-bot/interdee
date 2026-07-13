(function () {
  'use strict';
  const SHEET_URL = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
  const PDF_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/build/pdf.min.mjs';
  const PDF_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/build/pdf.worker.min.mjs';
  const SIZES = ['F', 'XS', 'S', 'M', 'L', 'XL', 'S/M', 'M/L'];
  let sheetPromise;
  const aliases = {
    photo: ['photo', 'image', 'picture', 'photo produit', '图片', '照片'],
    sku: ['reference', 'référence', 'ref', 'sku', 'style', 'style code', '款号', '货号'],
    name: ['name', 'product name', 'nom', 'produit', '品名', '商品名称'],
    category: ['categorie', 'catégorie', 'category', '品类', '类别', '分类'],
    composition: ['composition', 'matiere', 'matière', 'composant', '成分', '材质'],
    color: ['couleur', 'color', 'colour', '颜色', '色号'],
    size: ['taille', 'size', '尺码', '尺寸'],
    price: ['prix', 'price', '价格', '售价', '折后价'],
    original: ['prix original', 'original price', 'prix avant', '原价'],
    discount: ['remise', 'discount', 'reduction', 'réduction', '折扣', '折扣%'],
    quantity: ['qte', 'quantité', 'quantity', 'qty', 'stock', '数量', '库存'],
    total: ['qte total', 'qte_total', 'total', 'quantity total', '总数量', '库存总数']
  };
  const categoryMap = {
    robes: 'robes', robe: 'robes', dresses: 'robes', dress: 'robes',
    hauts: 'hauts', chemises: 'chemises', shirts: 'chemises', chemise: 'chemises',
    pulls: 'pulls', 'pulls & gilets': 'pulls', gilets: 'pulls',
    vestes: 'vestes', jackets: 'vestes', manteaux: 'manteaux', coats: 'manteaux',
    pantalons: 'pantalons', pants: 'pantalons', jeans: 'jeans', jupes: 'jupes',
    skirts: 'jupes', shorts: 'shorts', combinaisons: 'combinaisons',
    ensembles: 'ensembles', accessoires: 'accessoires', accessories: 'accessoires',
    autres: 'autres', other: 'autres'
  };
  function clean(value) { return String(value == null ? '' : value).trim(); }
  function key(value) { return clean(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[：:_%/\\-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function number(value) {
    const text = clean(value).replace(/\s/g, '').replace(/€/g, '').replace(/,/g, '.').replace(/[^0-9.+-]/g, '');
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  function discount(value) {
    const text = clean(value);
    if (!text) return 0;
    const parsed = number(text);
    return Math.abs(parsed) <= 1 && /%/.test(text) ? Math.abs(parsed * 100) : Math.abs(parsed);
  }
  function category(value) { return categoryMap[key(value)] || key(value) || 'autres'; }
  function findColumn(headers, field) {
    const names = (aliases[field] || []).map(key);
    return headers.findIndex(header => names.includes(key(header)));
  }
  function readCell(row, index) { return index >= 0 ? clean(row[index]) : ''; }
  function rowPhoto(row, rowIndex, photoIndex) {
    const direct = readCell(row, photoIndex);
    if (/^(data:image\/|https?:\/\/)/i.test(direct)) return direct;
    const embedded = row && row._imagesByRow ? row._imagesByRow[rowIndex] : null;
    return embedded || '';
  }
  function parseCsvText(text) {
    const lines = String(text || '').split(/\r?\n/).filter(line => line.trim());
    return lines.map(line => {
      const cells = []; let cell = ''; let quoted = false;
      for (let i = 0; i < line.length; i += 1) {
        const ch = line[i];
        if (ch === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
        else if (ch === '"') quoted = !quoted;
        else if (ch === ',' && !quoted) { cells.push(cell); cell = ''; }
        else cells.push(ch), cell += ch;
      }
      cells.push(cell);
      return cells;
    });
  }
  function loadSheetJs() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (sheetPromise) return sheetPromise;
    sheetPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SHEET_URL; script.onload = () => resolve(window.XLSX); script.onerror = () => reject(new Error('无法加载 Excel 解析组件，请检查网络后重试。'));
      document.head.appendChild(script);
    });
    return sheetPromise;
  }
  function zipReader(buffer) {
    const bytes = new Uint8Array(buffer); const view = new DataView(buffer); const decoder = new TextDecoder();
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('不是有效的 XLSX 文件。');
    const count = view.getUint16(eocd + 10, true); let offset = view.getUint32(eocd + 16, true); const entries = new Map();
    for (let i = 0; i < count; i += 1) {
      if (view.getUint32(offset, true) !== 0x02014b50) break;
      const method = view.getUint16(offset + 10, true), size = view.getUint32(offset + 20, true);
      const nameLength = view.getUint16(offset + 28, true), extraLength = view.getUint16(offset + 30, true), commentLength = view.getUint16(offset + 32, true);
      const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
      entries.set(name, { method, size, localOffset: view.getUint32(offset + 42, true) }); offset += 46 + nameLength + extraLength + commentLength;
    }
    return { entries, async read(name) {
      const entry = entries.get(name); if (!entry) return null;
      const local = entry.localOffset; const nameLength = view.getUint16(local + 26, true); const extraLength = view.getUint16(local + 28, true);
      const start = local + 30 + nameLength + extraLength; const compressed = bytes.slice(start, start + entry.size);
      if (entry.method === 0) return compressed;
      if (entry.method !== 8 || typeof DecompressionStream === 'undefined') return null;
      const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } };
  }
  function zipPath(base, target) {
    const parts = base.split('/').slice(0, -1).concat(target.split('/')); const out = [];
    parts.forEach(part => { if (!part || part === '.') return; if (part === '..') out.pop(); else out.push(part); });
    return out.join('/');
  }
  async function imageData(bytes, mime) {
    const blob = new Blob([bytes], { type: mime }); const url = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => { const scale = Math.min(1, 800 / Math.max(image.naturalWidth, image.naturalHeight)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale)); canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height); resolve(canvas.toDataURL('image/webp', 0.78)); }; image.onerror = () => reject(new Error('图片无法识别')); image.src = url; });
    } finally { URL.revokeObjectURL(url); }
  }
  async function extractImages(buffer) {
    const reader = zipReader(buffer); const decoder = new TextDecoder(); const result = {};
    const drawings = [...reader.entries.keys()].filter(name => /^xl\/drawings\/drawing\d+\.xml$/i.test(name));
    for (const drawing of drawings) {
      const xmlBytes = await reader.read(drawing); const relBytes = await reader.read(drawing.replace('drawings/', 'drawings/_rels/') + '.rels'); if (!xmlBytes || !relBytes) continue;
      const relations = {}; const relXml = decoder.decode(relBytes); (relXml.match(/<Relationship\b[^>]*>/g) || []).forEach(tag => { const id = tag.match(/\bId="([^"]+)"/i)?.[1]; const target = tag.match(/\bTarget="([^"]+)"/i)?.[1]; if (id && target) relations[id] = zipPath(drawing, target); });
      const xml = decoder.decode(xmlBytes); const anchors = xml.match(/<xdr:(?:oneCellAnchor|twoCellAnchor)\b[\s\S]*?<\/xdr:(?:oneCellAnchor|twoCellAnchor)>/gi) || [];
      for (const anchor of anchors) { const row = Number(anchor.match(/<xdr:row>(\d+)<\/xdr:row>/i)?.[1]); const embed = anchor.match(/<a:blip\b[^>]*\br:embed="([^"]+)"/i)?.[1]; if (!Number.isInteger(row) || !embed || result[row]) continue; const path = relations[embed]; const bytes = path ? await reader.read(path) : null; if (!bytes) continue; const ext = path.split('.').pop().toLowerCase(); const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[ext]; if (mime) { try { result[row] = await imageData(bytes, mime); } catch (_) {} } }
    }
    return result;
  }
  async function parseSpreadsheet(file) {
    const XLSX = await loadSheetJs(); const buffer = await file.arrayBuffer(); const book = XLSX.read(buffer, { type: 'array' }); if (!book.SheetNames.length) throw new Error('Excel 文件中没有工作表。');
    const sheet = book.Sheets[book.SheetNames[0]]; const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: true });
    matrix._imagesByRow = {}; try { matrix._imagesByRow = await extractImages(buffer); } catch (error) { matrix._imageError = error.message; } matrix.forEach((row, index) => { row._rowIndex = index; row._imagesByRow = matrix._imagesByRow; }); return matrix;
  }
  async function parsePdf(file) {
    const pdfjs = await import(PDF_URL); pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL; const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise; const rows = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) { const page = await pdf.getPage(pageNo); const content = await page.getTextContent(); const lines = {}; content.items.forEach(item => { const y = Math.round(item.transform[5]); (lines[y] ||= []).push(item.str); }); Object.keys(lines).sort((a, b) => b - a).forEach(y => rows.push(lines[y])); }
    return rows;
  }
  function normalize(matrix) {
    const errors = []; const warnings = []; const rows = Array.isArray(matrix) ? matrix.filter(row => row.some(cell => clean(cell))) : []; if (!rows.length) return { records: [], errors: ['文件中没有可读取的数据。'], warnings };
    const headerIndex = rows.findIndex(row => row.some(cell => ['reference', 'sku', '款号', 'couleur', 'color', 'categorie', 'category'].includes(key(cell)))); const header = rows[headerIndex >= 0 ? headerIndex : 0];
    const columns = {}; Object.keys(aliases).forEach(field => { columns[field] = findColumn(header, field); }); const sizeColumns = {}; SIZES.forEach(size => { const index = header.findIndex(cell => key(cell) === key(size)); if (index >= 0) sizeColumns[size] = index; });
    const records = []; const photoIndex = columns.photo; const dataRows = rows.slice((headerIndex >= 0 ? headerIndex : 0) + 1);
    dataRows.forEach((row, rowNumber) => {
      const sku = readCell(row, columns.sku); if (!sku) return; const color = readCell(row, columns.color) || '—'; const name = readCell(row, columns.name); const cat = category(readCell(row, columns.category)); const composition = readCell(row, columns.composition); let original = number(readCell(row, columns.original)); let price = number(readCell(row, columns.price)); const disc = discount(readCell(row, columns.discount)); if (!price && original && disc) price = +(original * (1 - disc / 100)).toFixed(2); if (!original && price && disc < 100) original = +(price / (1 - disc / 100)).toFixed(2); if (!price) errors.push(`第 ${rowNumber + 2} 行（${sku}）缺少价格。`);
      const base = { sku, name, category: cat, composition, original: original || price, price: price || original, discount: disc, image: rowPhoto(matrix, row._rowIndex ?? rowNumber, photoIndex) };
      const hasSizeColumns = Object.keys(sizeColumns).length > 0; if (hasSizeColumns) Object.entries(sizeColumns).forEach(([size, index]) => { const quantity = Math.max(0, Math.floor(number(row[index]))); if (quantity > 0) records.push({ ...base, color, size, quantity }); });
      else { const size = readCell(row, columns.size) || 'F'; const quantity = Math.max(0, Math.floor(number(readCell(row, columns.quantity) || readCell(row, columns.total)))); if (quantity > 0) records.push({ ...base, color, size, quantity }); }
    });
    if (matrix._imageError) warnings.push('未能读取部分 Excel 内嵌图片，请确认图片是直接插入 PHOTO 单元格且文件为 .xlsx。'); if (!records.length && !errors.length) errors.push('没有找到有效库存数量。'); return { records, errors, warnings };
  }
  async function parseFile(file) { if (!file) throw new Error('请选择 Excel 或 PDF 文件。'); const lower = file.name.toLowerCase(); if (lower.endsWith('.pdf')) return parsePdf(file); if (lower.endsWith('.csv')) { const rows = parseCsvText(await file.text()); rows.forEach((row, index) => { row._rowIndex = index; }); return rows; } return parseSpreadsheet(file); }
  async function downloadTemplate() { const XLSX = await loadSheetJs(); const headers = ['PHOTO', 'CATEGORIE', 'COMPOSITION', 'REFERENCE', 'COULEUR', 'F', 'XS', 'S', 'M', 'L', 'XL', 'S/M', 'M/L', 'QTE TOTAL', 'PRIX', 'REMISE']; const sample = ['', 'PANTALON', '100% coton', 'EXAMPLE-001', 'NOIR', '', '', 2, 1, '', '', '', '', 3, 49, 50]; const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, sample]), '库存表'); XLSX.writeFile(book, 'interdee-inventory-template.xlsx'); }
  window.InventoryImport = { parseFile, normalize, downloadTemplate };
}());

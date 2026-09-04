(function () {
  const config = window.APPWRITE_CONFIG || {};
  const endpoint = String(config.endpoint || 'https://cloud.appwrite.io/v1').replace(/\/$/, '');
  const projectId = String(config.projectId || '').trim();
  const databaseId = String(config.databaseId || 'interdee');
  const productsTableId = String(config.productsTableId || config.productsCollectionId || 'products');
  const settingsTableId = String(config.settingsTableId || config.settingsCollectionId || 'settings');
  const ordersTableId = String(config.ordersTableId || config.ordersCollectionId || 'orders');
  const bucketId = String(config.bucketId || 'product-media');
  const configured = Boolean(endpoint && projectId && projectId !== 'YOUR_PROJECT_ID');

  const json = (value, fallback) => {
    if (value === undefined || value === null || value === '') return fallback;
    try { return typeof value === 'string' ? JSON.parse(value) : value; } catch (_) { return fallback; }
  };
  const text = value => typeof value === 'string' ? value : JSON.stringify(value ?? '');
  const ensure = () => { if (!configured) throw new Error('Appwrite 尚未配置，请先填写项目 ID。'); };
  const safeRowId = value => {
    const candidate = String(value || '').trim().replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 36);
    return candidate || `p-${Date.now()}`;
  };

  async function request(path, options = {}) {
    ensure();
    const headers = new Headers(options.headers || {});
    headers.set('X-Appwrite-Project', projectId);
    headers.set('X-Appwrite-Response-Format', '1.9.6');
    let body = options.body;
    if (body !== undefined && body !== null && !(body instanceof FormData) && typeof body !== 'string') {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(body);
    }
    const response = await fetch(`${endpoint}${path}`, { ...options, headers, body, credentials: 'include' });
    const raw = await response.text();
    let data = json(raw, {});
    if (!response.ok) {
      const error = new Error(data?.message || data?.error || `Appwrite 请求失败（${response.status}）`);
      error.code = Number(data?.code) || response.status;
      throw error;
    }
    return data;
  }

  async function listAll(tableId) {
    ensure();
    const rows = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      const params = new URLSearchParams();
      // Appwrite Cloud's current REST API expects each query as a JSON
      // object (the shorthand `limit(100)` form now returns a syntax error).
      params.append('queries[0]', JSON.stringify({ method: 'limit', values: [limit] }));
      params.append('queries[1]', JSON.stringify({ method: 'offset', values: [offset] }));
      const page = await request(`/tablesdb/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(tableId)}/rows?${params.toString()}`);
      const pageRows = page?.rows || [];
      rows.push(...pageRows);
      if (pageRows.length < limit) break;
      offset += pageRows.length;
    }
    return rows;
  }

  function fromProduct(row) {
    const payload = json(row?.payload, null);
    if (payload && typeof payload === 'object') return { ...payload, id: payload.id || row.$id };
    return {
      id: row?.$id || '', name: row?.name || row?.$id || '', category: row?.category || 'autres',
      label: row?.label || '', season: String(row?.season || '').toUpperCase(), composition: row?.composition || '',
      price: Number(row?.price) || 0, original: Number(row?.original) || 0, discountRate: Number(row?.discountRate) || 0,
      stock: Number(row?.stock) || 0, variants: json(row?.variants, []), image: row?.image || '',
      colorImages: json(row?.colorImages, {}), icon: row?.icon || '✦', color: row?.color || '#b78166',
      desc: row?.description || row?.desc || '', visible: row?.visible !== false, order: Number(row?.displayOrder) || 0
    };
  }

  function fromOrder(row) {
    const payload = json(row?.payload, {});
    return {
      ...payload,
      id: payload.id || row?.$id || '',
      public_code: payload.public_code || payload.publicCode || row?.$id || '',
      created_at: payload.created_at || payload.createdAt || row?.$createdAt || new Date().toISOString(),
      status: payload.status || 'new',
      customer: json(payload.customer, {}),
      items: json(payload.items, [])
    };
  }

  async function loadProducts() {
    return (await listAll(productsTableId)).map(fromProduct).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  }
  async function loadSettings() {
    ensure();
    try {
      const row = await request(`/tablesdb/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(settingsTableId)}/rows/site`);
      return json(row?.payload, {});
    } catch (error) {
      if (Number(error?.code) === 404) return {};
      throw error;
    }
  }
  async function submitOrder(customer, items, total) {
    ensure();
    const now = new Date().toISOString();
    const publicCode = `R${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
    const payload = { public_code: publicCode, created_at: now, status: 'new', customer, items, total: Number(total) || 0 };
    const row = await request(`/tablesdb/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(ordersTableId)}/rows`, {
      method: 'POST', body: { rowId: `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, data: { payload: text(payload) } }
    });
    return { ...payload, id: row.$id };
  }
  async function upsertProducts(products, onProgress) {
    const list = Array.isArray(products) ? products : [];
    const tablePath = `/tablesdb/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(productsTableId)}/rows`;
    const singlePath = product => `${tablePath}/${encodeURIComponent(safeRowId(product.id))}`;
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    let completed = 0;
    for (let start = 0; start < list.length; start += 50) {
      const chunk = list.slice(start, start + 50);
      try {
        // Bulk REST uses raw row objects with $id plus column values.
        const rows = chunk.map(product => ({ $id: safeRowId(product.id), payload: text(product) }));
        await request(tablePath, { method: 'PUT', body: { rows } });
        completed += chunk.length;
        onProgress?.(completed, list.length, chunk[chunk.length - 1]);
      } catch (bulkError) {
        // If a deployment disallows browser bulk writes, fall back to the
        // normal upsert endpoint and pace requests under the free-plan limit.
        for (const product of chunk) {
          let attempts = 0;
          while (true) {
            try {
              await request(singlePath(product), { method: 'PUT', body: { data: { payload: text(product) } } });
              break;
            } catch (error) {
              if (Number(error?.code) !== 429 || attempts >= 5) throw error;
              attempts += 1;
              await pause(attempts * 2500);
            }
          }
          completed += 1;
          onProgress?.(completed, list.length, product);
          await pause(600);
        }
      }
    }
  }
  async function deleteProduct(id) {
    return request(`/tablesdb/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(productsTableId)}/rows/${encodeURIComponent(safeRowId(id))}`, { method: 'DELETE' });
  }
  async function saveSettings(data) {
    return request(`/tablesdb/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(settingsTableId)}/rows/site`, { method: 'PUT', body: { data: { payload: text(data) } } });
  }
  async function loadOrders() {
    return (await listAll(ordersTableId)).map(fromOrder).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }
  async function updateOrder(id, status) {
    const rowId = safeRowId(id);
    const row = await request(`/tablesdb/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(ordersTableId)}/rows/${encodeURIComponent(rowId)}`);
    const payload = json(row?.payload, {});
    payload.status = status;
    return request(`/tablesdb/${encodeURIComponent(databaseId)}/tables/${encodeURIComponent(ordersTableId)}/rows/${encodeURIComponent(rowId)}`, { method: 'PATCH', body: { data: { payload: text(payload) } } });
  }
  async function upload(file, folder) {
    ensure();
    const fileId = `f-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`.slice(0, 36);
    const form = new FormData();
    form.append('fileId', fileId);
    form.append('file', file);
    form.append('permissions[]', 'read("any")');
    const uploaded = await request(`/storage/buckets/${encodeURIComponent(bucketId)}/files`, { method: 'POST', body: form });
    return `${endpoint}/storage/buckets/${encodeURIComponent(bucketId)}/files/${encodeURIComponent(uploaded.$id)}/view?project=${encodeURIComponent(projectId)}`;
  }
  async function login(email, password) {
    return request('/account/sessions/email', { method: 'POST', body: { email, password } });
  }
  async function verifyAdmin() { return request('/account'); }
  async function logout() { try { await request('/account/sessions/current', { method: 'DELETE' }); } catch (_) {} }

  window.CloudAPI = { configured, loadProducts, loadSettings, submitOrder, login, logout, verifyAdmin, upsertProducts, deleteProduct, saveSettings, loadOrders, updateOrder, upload };
})();

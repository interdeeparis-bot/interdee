(function () {
  const config = window.APPWRITE_CONFIG || {};
  const sdk = window.Appwrite;
  const endpoint = String(config.endpoint || 'https://cloud.appwrite.io/v1').replace(/\/$/, '');
  const projectId = String(config.projectId || '').trim();
  const databaseId = String(config.databaseId || 'interdee');
  const productsTableId = String(config.productsTableId || config.productsCollectionId || 'products');
  const settingsTableId = String(config.settingsTableId || config.settingsCollectionId || 'settings');
  const ordersTableId = String(config.ordersTableId || config.ordersCollectionId || 'orders');
  const bucketId = String(config.bucketId || 'product-media');
  const configured = Boolean(sdk && sdk.TablesDB && endpoint && projectId && projectId !== 'YOUR_PROJECT_ID');

  let client;
  let account;
  let tablesDB;
  let storage;
  if (configured) {
    client = new sdk.Client().setEndpoint(endpoint).setProject(projectId);
    account = new sdk.Account(client);
    tablesDB = new sdk.TablesDB(client);
    storage = new sdk.Storage(client);
  }

  const json = (value, fallback) => {
    if (value === undefined || value === null || value === '') return fallback;
    try { return typeof value === 'string' ? JSON.parse(value) : value; } catch (_) { return fallback; }
  };
  const text = value => typeof value === 'string' ? value : JSON.stringify(value ?? '');
  const ensure = () => { if (!configured) throw new Error('Appwrite 尚未配置，请先填写项目 ID。'); };
  const query = (limit, offset) => [sdk.Query.limit(limit), sdk.Query.offset(offset)];

  async function listAll(tableId) {
    ensure();
    const rows = [];
    let offset = 0;
    const limit = 100;
    while (true) {
      const page = await tablesDB.listRows({ databaseId, tableId, queries: query(limit, offset) });
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

  const safeRowId = value => {
    const candidate = String(value || '').trim().replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 36);
    return candidate || `p-${Date.now()}`;
  };

  async function upsertRow(tableId, id, data) {
    ensure();
    return tablesDB.upsertRow({ databaseId, tableId, rowId: safeRowId(id), data });
  }

  async function loadProducts() {
    return (await listAll(productsTableId)).map(fromProduct).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
  }
  async function loadSettings() {
    ensure();
    try {
      const row = await tablesDB.getRow({ databaseId, tableId: settingsTableId, rowId: 'site' });
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
    const row = await tablesDB.createRow({ databaseId, tableId: ordersTableId, rowId: sdk.ID.unique(), data: { payload: text(payload) } });
    return { ...payload, id: row.$id };
  }
  async function upsertProducts(products) {
    for (const product of products || []) await upsertRow(productsTableId, product.id, { payload: text(product) });
  }
  async function deleteProduct(id) { ensure(); return tablesDB.deleteRow({ databaseId, tableId: productsTableId, rowId: safeRowId(id) }); }
  async function saveSettings(data) { return upsertRow(settingsTableId, 'site', { payload: text(data) }); }
  async function loadOrders() { return (await listAll(ordersTableId)).map(fromOrder).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))); }
  async function updateOrder(id, status) {
    ensure();
    const rowId = safeRowId(id);
    const row = await tablesDB.getRow({ databaseId, tableId: ordersTableId, rowId });
    const payload = json(row?.payload, {});
    payload.status = status;
    return tablesDB.updateRow({ databaseId, tableId: ordersTableId, rowId, data: { payload: text(payload) } });
  }
  async function upload(file, folder) {
    ensure();
    if (!storage) throw new Error('Appwrite Storage 尚未加载');
    const fileId = sdk.ID.unique();
    const permissions = [sdk.Permission.read(sdk.Role.any())];
    const uploaded = await storage.createFile({ bucketId, fileId, file, permissions, folder: folder || undefined });
    return `${endpoint}/storage/buckets/${bucketId}/files/${uploaded.$id}/view?project=${encodeURIComponent(projectId)}`;
  }
  async function login(email, password) { ensure(); return account.createEmailPasswordSession({ email, password }); }
  async function verifyAdmin() { ensure(); return account.get(); }
  async function logout() { if (!account) return; try { await account.deleteSession('current'); } catch (_) {} }

  window.CloudAPI = { configured, loadProducts, loadSettings, submitOrder, login, logout, verifyAdmin, upsertProducts, deleteProduct, saveSettings, loadOrders, updateOrder, upload };
})();


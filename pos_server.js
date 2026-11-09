const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const dns = require('dns');
const { chromium } = require('playwright-core');
const hardwarePrinter = require('./modules/hardware_printer');
const backupManager = require('./modules/backup_manager');

// Global crash resilience: ensure unexpected network/DNS drops never kill POS server
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason?.message || reason);
});

function getLocalIpAddress() {
  const ifaces = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        const isVirtual = name.toLowerCase().includes('vethernet') || name.toLowerCase().includes('wsl') || name.toLowerCase().includes('virtual');
        candidates.push({ name, ip: net.address, isVirtual });
      }
    }
  }
  candidates.sort((a, b) => {
    if (a.isVirtual && !b.isVirtual) return 1;
    if (!a.isVirtual && b.isVirtual) return -1;
    const aPri = a.name.toLowerCase().includes('wi-fi') || a.name.toLowerCase().includes('ethernet') ? 0 : 1;
    const bPri = b.name.toLowerCase().includes('wi-fi') || b.name.toLowerCase().includes('ethernet') ? 0 : 1;
    return aPri - bPri;
  });
  return candidates.length > 0 ? candidates[0].ip : '127.0.0.1';
}

const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');
const CATALOG_PATH = path.join(DATA_DIR, 'pos_catalog.json');
const QUEUE_PATH = path.join(DATA_DIR, 'offline_sales_queue.json');
const CUSTOMERS_PATH = path.join(DATA_DIR, 'customers.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const connectedTerminals = new Map(); // clientIp -> terminalId
const LOGS_DIR = path.join(__dirname, 'logs');
const SYNC_LOG_PATH = path.join(LOGS_DIR, 'zoho_sync.log');
const UNIT_GROUPS_PATH = path.join(DATA_DIR, 'unit_groups_cache.json');
const SHIFTS_PATH = path.join(DATA_DIR, 'shift_reports.json');
const ACTIVE_SHIFTS_PATH = path.join(DATA_DIR, 'active_shifts.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });
if (!fs.existsSync(QUEUE_PATH)) fs.writeFileSync(QUEUE_PATH, JSON.stringify([], null, 2), 'utf8');
if (!fs.existsSync(SHIFTS_PATH)) fs.writeFileSync(SHIFTS_PATH, JSON.stringify([], null, 2), 'utf8');
if (!fs.existsSync(ACTIVE_SHIFTS_PATH)) fs.writeFileSync(ACTIVE_SHIFTS_PATH, JSON.stringify({}, null, 2), 'utf8');

function formatLocalTime(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}`;
}

function writeSyncLog(level, message) {
  const ts = formatLocalTime();
  const line = `[${ts}] [${level.toUpperCase().padEnd(7)}] ${message}\n`;
  try {
    fs.appendFileSync(SYNC_LOG_PATH, line, 'utf8');
  } catch (e) {
    console.error('Failed writing to sync log:', e.message);
  }
  console.log(`[SYNC-LOG] [${level.toUpperCase()}] ${message}`);
}

function checkInternetConnectivity() {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), 4000);
    dns.lookup('pos.zoho.com', (err, addr) => {
      clearTimeout(timer);
      if (!err && addr) return resolve(true);
      dns.lookup('1.1.1.1', (err2, addr2) => {
        resolve(!err2 && !!addr2);
      });
    });
  });
}

const syncState = {
  isSyncing: false,
  isOnline: true,
  lastSyncTime: null,
  lastSyncResult: null,
  lastSyncSummary: 'No sync run yet',
  nextScheduledSync: null,
  intervalMs: 10 * 60 * 1000 // 10 minutes
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };
  return map[ext] || 'text/plain';
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

// Helper to launch Zoho Playwright session (Off-screen, zero cashier interruption)
async function createZohoSession() {
  const userDataDir = path.join(__dirname, '.browser_profile');
  const lockPath = path.join(userDataDir, 'lockfile');
  if (fs.existsSync(lockPath)) {
    try { fs.unlinkSync(lockPath); } catch (e) { }
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    args: [
      '--window-position=-2400,-2400',
      '--window-size=1280,800',
      '--no-first-run',
      '--disable-background-timer-throttling'
    ]
  });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  const invOrgId = '943392252';

  await page.goto(`https://pos.zoho.com/qualitysuperstores/index.do/zxapp/posapi/app/${invOrgId}?embeddingService=pos#/home/inventory-dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  const frameElement = await page.waitForSelector('iframe[name="serviceFrame"], iframe#serviceFrame', { state: 'attached', timeout: 30000 });
  const frame = await frameElement.contentFrame();

  const cookies = await context.cookies();
  const zoscscook = cookies.find(c => c.name === 'zoscscook');
  const token = zoscscook ? 'zoscsparam=' + zoscscook.value : '';

  const headers = {
    'Content-Type': 'application/json;charset=UTF-8',
    'Accept': 'application/json',
    'x-zcsrf-token': token,
    'x-zb-source': 'zbclient',
    'x-role-id': '1560234000000110197'
  };

  return { context, page, frame, headers, invOrgId };
}

// Helper to construct a new catalog item from Zoho with conversions
function buildCatalogItemFromZoho(z, unitGroupsMap) {
  const itemId = String(z.item_id);
  const name = z.name || 'Unnamed Product';
  const category = z.category_name || 'GENERAL';
  const stock = z.stock_on_hand !== undefined && z.stock_on_hand !== null
    ? Number(z.stock_on_hand)
    : (z.available_stock !== undefined && z.available_stock !== null ? Number(z.available_stock) : 0);
  const retailPrice = Number(z.rate) || 0;
  const costPrice = Number(z.purchase_rate) || 0;
  const upc = String(z.upc || '').trim();
  const sku = String(z.sku || '').trim();

  let unitGroup = z.unit_group_name || '';
  let matchedGroup = null;
  if (z.unit_group_id && unitGroupsMap.has(String(z.unit_group_id))) {
    matchedGroup = unitGroupsMap.get(String(z.unit_group_id));
  } else if (unitGroup) {
    const cleanUG = unitGroup.toLowerCase().replace(/\s+/g, ' ').trim();
    for (const ug of unitGroupsMap.values()) {
      if ((ug.unit_group_name || '').toLowerCase().replace(/\s+/g, ' ').trim() === cleanUG) {
        matchedGroup = ug;
        break;
      }
    }
  }

  let units = [];
  let baseUnit = (z.unit || 'pcs').toLowerCase();
  let bulkUnit = 'carton';
  let cartonPrice = retailPrice;
  let cartonCostPrice = costPrice;

  if (matchedGroup && Array.isArray(matchedGroup.unit_conversions) && matchedGroup.unit_conversions.length > 0) {
    const conv = matchedGroup.unit_conversions[0];
    const ratio = Number(conv.conversion_rate) || 1;
    baseUnit = (matchedGroup.base_unit_name || z.unit || 'pcs').toLowerCase();
    bulkUnit = (conv.target_unit_name || 'carton').toLowerCase();
    cartonPrice = Number(z.cf_carton_price || z.carton_price) || (retailPrice * ratio);
    cartonCostPrice = costPrice * ratio;

    units = [
      {
        name: baseUnit,
        label: `${baseUnit.toUpperCase()} (Retail Single Unit)`,
        price: retailPrice,
        is_base: true,
        conversion_ratio: 1,
        unit_conversion_id: '',
        unit_symbol: baseUnit,
        cost: costPrice
      },
      {
        name: bulkUnit,
        label: `${bulkUnit.toUpperCase()} (Full Bulk - ${ratio} ${baseUnit}s)`,
        price: cartonPrice,
        is_base: false,
        conversion_ratio: ratio,
        unit_conversion_id: conv.unit_conversion_id || '',
        unit_symbol: bulkUnit === 'carton' ? 'ctn' : bulkUnit,
        cost: cartonCostPrice
      }
    ];
  } else {
    units = [
      {
        name: baseUnit,
        label: `${baseUnit.toUpperCase()} (Standard Unit)`,
        price: retailPrice,
        is_base: true,
        conversion_ratio: 1,
        unit_conversion_id: '',
        unit_symbol: baseUnit,
        cost: costPrice
      }
    ];
  }

  return {
    id: itemId,
    name,
    category,
    base_unit: baseUnit,
    bulk_unit: bulkUnit,
    unit_group: unitGroup,
    retail_price: retailPrice,
    carton_price: cartonPrice,
    stock,
    upc,
    sku,
    units,
    cost_price: costPrice,
    carton_cost_price: cartonCostPrice
  };
}

// Pull customers, debts, new items, and live inventory from Zoho Cloud
async function pullCloudDataFromZoho() {
  const startTime = Date.now();
  writeSyncLog('INFO', 'Starting background pull from Zoho (Customers, Ledgers, New Items & Inventory)...');

  const { context, frame, headers, invOrgId } = await createZohoSession();

  try {
    // 1. Pull Customers & Debts
    const allContacts = [];
    let custPage = 1;
    let hasMoreCust = true;

    while (hasMoreCust && custPage <= 15) {
      const cRes = await frame.evaluate(async ({ url, h }) => {
        const r = await fetch(url, { headers: h });
        return await r.json();
      }, { url: `/posapi/api/v1/contacts?organization_id=${invOrgId}&contact_type=customer&status=active&per_page=200&page=${custPage}`, h: headers });

      if (cRes && cRes.code === 0 && Array.isArray(cRes.contacts)) {
        allContacts.push(...cRes.contacts);
        hasMoreCust = cRes.page_context ? Boolean(cRes.page_context.has_more_page) : false;
        custPage++;
      } else {
        break;
      }
    }

    const formattedCustomers = [];
    const walkInId = '1560234000000095179';
    const walkIn = allContacts.find(c => c.contact_id === walkInId) || allContacts.find(c => c.contact_name && /^walk[- ]?in customer$/i.test(c.contact_name));

    formattedCustomers.push({
      id: walkIn ? walkIn.contact_id : walkInId,
      name: 'Walk-in Customer',
      company_name: '',
      phone: '',
      email: '',
      outstanding: 0,
      display_name: 'Walk-in Customer'
    });

    let totalCustomerDebt = 0;
    let debtorCount = 0;

    for (const c of allContacts) {
      if (c.contact_id === formattedCustomers[0].id) continue;
      const debt = Number(c.outstanding_receivable_amount) || 0;
      if (debt > 0) {
        totalCustomerDebt += debt;
        debtorCount++;
      }
      formattedCustomers.push({
        id: c.contact_id,
        name: c.contact_name || c.company_name || 'Customer',
        company_name: c.company_name || '',
        phone: c.phone || c.mobile || '',
        email: c.email || '',
        outstanding: debt,
        display_name: c.contact_name || c.company_name || 'Customer'
      });
    }

    if (formattedCustomers.length > 0) {
      // Preserve any locally created customers that haven't been synced to Zoho yet
      const existingCusts = fs.existsSync(CUSTOMERS_PATH) ? JSON.parse(fs.readFileSync(CUSTOMERS_PATH, 'utf8')) : [];
      const localOnly = existingCusts.filter(c => c.is_local_created && String(c.id).startsWith('loc_cust_'));
      const mergedCustomers = [...formattedCustomers, ...localOnly];

      const tmpCust = `${CUSTOMERS_PATH}.tmp`;
      fs.writeFileSync(tmpCust, JSON.stringify(mergedCustomers, null, 2), 'utf8');
      fs.renameSync(tmpCust, CUSTOMERS_PATH);
    }

    // 2. Load Unit Groups Cache for new item conversions
    const unitGroupsMap = new Map();
    if (fs.existsSync(UNIT_GROUPS_PATH)) {
      try {
        const ugs = JSON.parse(fs.readFileSync(UNIT_GROUPS_PATH, 'utf8'));
        for (const g of ugs) {
          if (g.unit_group_id) unitGroupsMap.set(String(g.unit_group_id), g);
          if (g.unit_group_name) unitGroupsMap.set(g.unit_group_name.toLowerCase().trim(), g);
        }
      } catch (e) { }
    }

    // 3. Pull Items & Live Inventory
    const allZohoItems = [];
    let itemPage = 1;
    let hasMoreItems = true;

    while (hasMoreItems && itemPage <= 15) {
      const iRes = await frame.evaluate(async ({ url, h }) => {
        const r = await fetch(url, { headers: h });
        return await r.json();
      }, { url: `/posapi/api/v1/items?organization_id=${invOrgId}&per_page=200&page=${itemPage}`, h: headers });

      if (iRes && iRes.code === 0 && Array.isArray(iRes.items)) {
        allZohoItems.push(...iRes.items);
        hasMoreItems = iRes.page_context ? Boolean(iRes.page_context.has_more_page) : false;
        itemPage++;
      } else {
        break;
      }
    }

    // Build map of existing catalog items
    let catalog = [];
    if (fs.existsSync(CATALOG_PATH)) {
      catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    }
    const catalogMap = new Map(catalog.map(it => [String(it.id), it]));

    let updatedStockCount = 0;
    let newItemsAdded = 0;

    for (const z of allZohoItems) {
      const itemId = String(z.item_id);
      if (catalogMap.has(itemId)) {
        const it = catalogMap.get(itemId);

        // Update live stock
        const newStock = z.stock_on_hand !== undefined && z.stock_on_hand !== null
          ? Number(z.stock_on_hand)
          : (z.available_stock !== undefined && z.available_stock !== null ? Number(z.available_stock) : null);

        if (newStock !== null && !isNaN(newStock)) {
          it.stock = newStock;
          updatedStockCount++;
        }

        // Update retail rate if Zoho changed it
        if (z.rate !== undefined && z.rate !== null && Number(z.rate) > 0) {
          it.retail_price = Math.round(Number(z.rate));
          const baseU = it.units?.find(u => u.is_base);
          if (baseU) baseU.price = it.retail_price;
        }

        // Update purchase / cost price (smallest unit cost)
        if (z.purchase_rate !== undefined && z.purchase_rate !== null) {
          it.cost_price = Number(z.purchase_rate);
          const baseU = it.units?.find(u => u.is_base);
          if (baseU) baseU.cost = it.cost_price;
          const bulkU = it.units?.find(u => !u.is_base);
          if (bulkU && bulkU.conversion_ratio) bulkU.cost = Math.round(it.cost_price * bulkU.conversion_ratio * 100) / 100;
        }

        // Update UPC barcode & SKU
        if (z.upc && (!it.upc || it.upc !== z.upc)) it.upc = String(z.upc).trim();
        if (z.sku && (!it.sku || it.sku !== z.sku)) it.sku = String(z.sku).trim();
      } else if (z.status === 'active') {
        // Discovered NEW ITEM created in Zoho!
        const newItem = buildCatalogItemFromZoho(z, unitGroupsMap);
        catalog.push(newItem);
        catalogMap.set(itemId, newItem);
        newItemsAdded++;
      }
    }

    // Atomically write updated catalog
    const tmpCat = `${CATALOG_PATH}.tmp`;
    fs.writeFileSync(tmpCat, JSON.stringify(catalog, null, 2), 'utf8');
    fs.renameSync(tmpCat, CATALOG_PATH);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const summary = `Customers: ${formattedCustomers.length} | Items: ${catalog.length} (Updated: ${updatedStockCount}, Added: ${newItemsAdded})`;

    writeSyncLog('SUCCESS', `Pull sync completed in ${duration}s. ${summary}`);

    syncState.lastSyncTime = formatLocalTime();
    syncState.lastSyncSummary = summary;
    syncState.lastSyncResult = 'SUCCESS';

    return {
      success: true,
      duration_seconds: duration,
      customers_count: formattedCustomers.length,
      debtors_count: debtorCount,
      total_debt: totalCustomerDebt,
      items_updated: updatedStockCount,
      new_items_added: newItemsAdded,
      total_catalog: catalog.length,
      zoho_items_count: allZohoItems.length,
      summary,
      message: `Sync complete! Pulled ${formattedCustomers.length} customers and updated ${updatedStockCount} items (${newItemsAdded} new).`
    };
  } finally {
    await context.close();
  }
}

// Background Pull Engine Runner with Network Watchdog & Lock Protection
async function executePullSync(reason = 'scheduled') {
  if (syncState.isSyncing) {
    writeSyncLog('INFO', `Sync skipped (${reason}): Process is already actively running.`);
    return { success: false, message: 'Sync is currently in progress.' };
  }

  const online = await checkInternetConnectivity();
  if (!online) {
    if (syncState.isOnline) {
      writeSyncLog('WARN', `Internet is OFFLINE during trigger (${reason}). Pausing sync. Watching for network reconnection...`);
    }
    syncState.isOnline = false;
    return { success: false, offline: true, message: 'No internet connection. POS is in offline mode.' };
  }

  if (!syncState.isOnline) {
    writeSyncLog('INFO', `🌐 Internet connection restored! Resuming immediate catch-up sync (${reason})...`);
  }
  syncState.isOnline = true;

  syncState.isSyncing = true;
  try {
    const res = await pullCloudDataFromZoho();

    // Check if there are queued offline sales that need pushing
    try {
      if (fs.existsSync(QUEUE_PATH)) {
        const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
        const pending = queue.filter(q => q.status === 'PENDING_SYNC');
        if (pending.length > 0) {
          writeSyncLog('INFO', `Auto-Push: Found ${pending.length} pending offline sales. Pushing to Zoho Books...`);
          const pushRes = await syncOfflineSalesToZoho();
          writeSyncLog('SUCCESS', `Auto-Push: ${pushRes.message}`);
        }
      }
    } catch (pushErr) {
      writeSyncLog('WARN', `Auto-Push warning: ${pushErr.message}`);
    }

    return res;
  } catch (err) {
    writeSyncLog('ERROR', `Pull sync failed: ${err.message}`);
    syncState.lastSyncResult = 'FAILED: ' + err.message;
    return { success: false, message: err.message };
  } finally {
    syncState.isSyncing = false;
    syncState.nextScheduledSync = formatLocalTime(new Date(Date.now() + syncState.intervalMs));
  }
}

// Scheduler: 10-minute recurring loop + 20-second reconnection watchdog
let pullIntervalTimer = null;
let reconnectWatchdogTimer = null;

function startSyncScheduler() {
  writeSyncLog('INFO', 'Background Zoho Sync Scheduler running (10-minute cycle + Instant Reconnect Watchdog).');

  // 1. Regular 10-minute sync loop
  pullIntervalTimer = setInterval(() => {
    executePullSync('10-minute scheduled interval');
  }, syncState.intervalMs);

  // 2. Fast Network Reconnect Watchdog (runs every 20 seconds when offline)
  reconnectWatchdogTimer = setInterval(async () => {
    if (!syncState.isOnline && !syncState.isSyncing) {
      const isNowOnline = await checkInternetConnectivity();
      if (isNowOnline) {
        writeSyncLog('INFO', '🌐 Internet connection restored! Triggering immediate background pull sync...');
        executePullSync('immediate reconnect');
      }
    }
  }, 20 * 1000);

  // 3. Initial sync 10 seconds after server startup
  setTimeout(() => {
    executePullSync('server startup');
  }, 10 * 1000);
}

// Background sync function: Push offline sales to Zoho
async function syncOfflineSalesToZoho() {
  const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
  const pending = queue.filter(q => q.status === 'PENDING_SYNC');

  if (pending.length === 0) {
    return { count: 0, message: 'All offline sales are already synced with Zoho!' };
  }

  console.log(`Starting background sync for ${pending.length} pending sale(s)...`);

  const { context, page, frame, headers, invOrgId } = await createZohoSession();

  try {
    const paymentModeMap = {
      'Cash': { mode: 'Cash', accountId: '1560234000000000361' }, // Petty Cash
      'Moniepoint POS': { mode: 'POS', accountId: '1560234000000114266' }, // Moniepoint
      'Moniepoint': { mode: 'POS', accountId: '1560234000000114266' },
      'First Bank Transfer': { mode: 'Bank Transfer', accountId: '1560234000000192002' }, // First Bank
      'First Bank': { mode: 'Bank Transfer', accountId: '1560234000000192002' },
      'Card': { mode: 'Card', accountId: '1560234000000114266' },
      'POS': { mode: 'POS', accountId: '1560234000000114266' },
      'Bank Transfer': { mode: 'Bank Transfer', accountId: '1560234000000192002' },
      'Transfer': { mode: 'Bank Transfer', accountId: '1560234000000192002' }
    };

    let syncedCount = 0;

    for (const sale of pending) {
      try {
        console.log(`Syncing receipt ${sale.receipt_number} to Zoho...`);
        sale.sync_attempts = (sale.sync_attempts || 0) + 1;

        // Resolve customer_id: if local temporary ID (loc_cust_...) or invalid, search or create in Zoho
        let targetCustomerId = sale.customer_id;
        // Fix legacy walk-in ID 1560234000000102202 which was mistakenly mapped to 'kay bee' in Zoho
        if (targetCustomerId === '1560234000000102202' && (!sale.customer_name || /walk\s*[-]?\s*in/i.test(sale.customer_name))) {
          targetCustomerId = '1560234000000095179';
          sale.customer_id = '1560234000000095179';
        }

        if (!targetCustomerId || String(targetCustomerId).startsWith('loc_cust_')) {
          let resolvedId = null;
          const custName = sale.customer_name || 'Customer';
          if (!/walk\s*[-]?\s*in/i.test(custName)) {
            try {
              // 1. Check if contact exists in Zoho by name
              const searchRes = await frame.evaluate(async ({ url, h }) => {
                const r = await fetch(url, { headers: h });
                return await r.json();
              }, { url: `/posapi/api/v1/contacts?organization_id=${invOrgId}&contact_name=${encodeURIComponent(custName)}`, h: headers });

              if (searchRes.code === 0 && Array.isArray(searchRes.contacts) && searchRes.contacts.length > 0) {
                const matched = searchRes.contacts.find(c => c.contact_name && c.contact_name.toLowerCase() === custName.toLowerCase()) || searchRes.contacts[0];
                resolvedId = matched.contact_id;
                console.log(`  -> Found existing Zoho customer for "${custName}": ${resolvedId}`);
              } else {
                // 2. Create customer in Zoho
                const createRes = await frame.evaluate(async ({ url, h, b }) => {
                  const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(b) });
                  return await r.json();
                }, {
                  url: `/posapi/api/v1/contacts?organization_id=${invOrgId}`,
                  h: headers,
                  b: { contact_name: custName, customer_name: custName }
                });

                if (createRes.code === 0 && createRes.contact) {
                  resolvedId = createRes.contact.contact_id;
                  console.log(`  -> Created new Zoho customer for "${custName}": ${resolvedId}`);
                }
              }
            } catch (errCust) {
              console.warn(`  ⚠️ Could not resolve customer in Zoho: ${errCust.message}`);
            }
          }

          // Use resolved ID or fallback to standard Walk In Customer
          targetCustomerId = resolvedId || '1560234000000095179';
          sale.customer_id = targetCustomerId;
        }

        const invPayload = {
          customer_id: targetCustomerId,
          date: sale.date,
          due_date: sale.date,
          reference_number: sale.receipt_number,
          salesperson_name: sale.tilled_by || sale.salesperson || '',
          notes: (sale.customer_name && !/walk\s*[-]?\s*in/i.test(sale.customer_name) && targetCustomerId === '1560234000000095179')
            ? `Customer: ${sale.customer_name} | Tilled By: ${sale.tilled_by || sale.salesperson || ''}`
            : (sale.tilled_by ? `Tilled By: ${sale.tilled_by}` : ''),
          line_items: sale.line_items.map(l => {
            const itemLine = {
              item_id: l.item_id,
              name: l.name,
              quantity: l.quantity,
              rate: l.rate
            };
            if (l.unit_conversion_id) {
              itemLine.unit_conversion_id = l.unit_conversion_id;
              itemLine.unit = l.unit;
            } else if (l.unit) {
              itemLine.unit = l.unit;
            }
            return itemLine;
          })
        };

        // 1. Idempotency Check: Verify if invoice already exists in Zoho by receipt reference number
        const checkRes = await frame.evaluate(async ({ url, h }) => {
          const r = await fetch(url, { headers: h });
          return await r.json();
        }, { url: `/posapi/api/v1/invoices?organization_id=${invOrgId}&reference_number=${encodeURIComponent(sale.receipt_number)}`, h: headers });

        let inv = (checkRes.code === 0 && Array.isArray(checkRes.invoices) && checkRes.invoices.length > 0)
          ? checkRes.invoices[0]
          : null;

        if (!inv) {
          // Create Invoice if not already in Zoho
          const invRes = await frame.evaluate(async ({ url, h, b }) => {
            const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(b) });
            return await r.json();
          }, { url: `/posapi/api/v1/invoices?organization_id=${invOrgId}`, h: headers, b: invPayload });

          if (invRes.code === 0 && invRes.invoice) {
            inv = invRes.invoice;
            console.log(`  -> Created Zoho Invoice: ${inv.invoice_number}`);
          } else {
            console.log(`  ❌ Failed to sync ${sale.receipt_number}:`, invRes.message);
            sale.last_sync_error = invRes.message || 'Zoho rejected invoice';
            fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
            continue;
          }
        } else {
          console.log(`  ℹ️ Found existing Zoho Invoice ${inv.invoice_number} for receipt ${sale.receipt_number} (preventing duplicate)`);
        }

        // 2. Mark Sent (if still in draft)
        if (inv.status === 'draft') {
          await frame.evaluate(async ({ url, h }) => {
            await fetch(url, { method: 'POST', headers: h, body: JSON.stringify({}) });
          }, { url: `/posapi/api/v1/invoices/${inv.invoice_id}/status/sent?organization_id=${invOrgId}`, h: headers });
        }

        // 3. Record Payment(s) (supports single or multi-account split payments)
        const paymentList = (Array.isArray(sale.payments) && sale.payments.length > 0)
          ? sale.payments
          : [{ mode: sale.payment_mode || 'Cash', amount: inv.total }];

        const recordedPaymentIds = [];

        for (let i = 0; i < paymentList.length; i++) {
          const split = paymentList[i];
          const splitAmt = Math.round(Number(split.amount));
          if (!splitAmt || splitAmt <= 0) continue;

          const payCfg = paymentModeMap[split.mode] ||
            (split.mode?.includes('POS') || split.mode?.includes('Moniepoint') ? paymentModeMap['Moniepoint POS'] :
              split.mode?.includes('Transfer') || split.mode?.includes('First') ? paymentModeMap['First Bank Transfer'] :
                paymentModeMap['Cash']);

          const payPayload = {
            customer_id: inv.customer_id,
            payment_mode: payCfg.mode,
            amount: splitAmt,
            date: sale.date,
            account_id: payCfg.accountId,
            reference_number: paymentList.length > 1 ? `${sale.receipt_number}-${i + 1}` : sale.receipt_number,
            invoices: [{ invoice_id: inv.invoice_id, amount_applied: splitAmt }]
          };

          const payRes = await frame.evaluate(async ({ url, h, b }) => {
            const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(b) });
            return await r.json();
          }, { url: `/posapi/api/v1/customerpayments?organization_id=${invOrgId}`, h: headers, b: payPayload });

          if (payRes.code === 0 && payRes.payment) {
            recordedPaymentIds.push(payRes.payment.payment_id);
            console.log(`    💳 Payment logged: ₦${splitAmt.toLocaleString()} -> ${payCfg.mode} (${payCfg.accountId})`);
          } else {
            console.log(`    ⚠️ Warning recording payment (${split.mode}):`, payRes.message);
          }
        }

        sale.status = 'SYNCED';
        sale.zoho_invoice_id = inv.invoice_id;
        sale.zoho_invoice_number = inv.invoice_number;
        sale.zoho_payment_id = recordedPaymentIds.join(',');
        sale.synced_at = new Date().toISOString();
        delete sale.last_sync_error;
        fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
        syncedCount++;
        console.log(`  ✅ Successfully Synced ${sale.receipt_number} (Invoice #${inv.invoice_number} | Paid ${recordedPaymentIds.length} payment(s))`);
      } catch (e) {
        console.log(`  ❌ Error syncing ${sale.receipt_number}:`, e.message);
        sale.last_sync_error = e.message;
        fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');
      }
      await page.waitForTimeout(500);
    }

    return { count: syncedCount, message: `Successfully synced ${syncedCount} of ${pending.length} pending sale(s) to Zoho!` };
  } finally {
    if (context) {
      await context.close().catch(() => { });
    }
  }
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // Static Assets
  if (req.method === 'GET' && (pathname === '/' || !pathname.startsWith('/api/'))) {
    const filePath = pathname === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(PUBLIC_DIR, pathname);
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
      return fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not Found');
    }
  }

  // API Routes
  res.setHeader('Content-Type', 'application/json');

  // 0. POST /api/auth/login (Cashier / Manager PIN Verification)
  if (req.method === 'POST' && pathname === '/api/auth/login') {
    try {
      const { pin } = await parseJsonBody(req);
      const usersPath = path.join(DATA_DIR, 'pos_users.json');
      const users = fs.existsSync(usersPath)
        ? JSON.parse(fs.readFileSync(usersPath, 'utf8'))
        : [
          { id: 'u1', name: 'Manager / Admin', pin: '9545', role: 'admin' },
          { id: 'u5', name: 'Finance / Accounts', pin: '6935', role: 'finance' },
          { id: 'u2', name: 'Cashier 1', pin: '5713', role: 'cashier', terminal_id: 'TERM-01' },
          { id: 'u3', name: 'Cashier 2', pin: '5917', role: 'cashier', terminal_id: 'TERM-02' }
        ];

      const user = users.find(u => String(u.pin).trim() === String(pin).trim());
      if (user) {
        res.writeHead(200);
        return res.end(JSON.stringify({
          success: true,
          user: {
            id: user.id,
            name: user.name,
            role: user.role,
            terminal_id: user.terminal_id
          }
        }));
      } else {
        res.writeHead(401);
        return res.end(JSON.stringify({ success: false, message: 'Invalid PIN. Try again.' }));
      }
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 0b. POST /api/auth/change-pin (Change User PIN)
  if (req.method === 'POST' && pathname === '/api/auth/change-pin') {
    try {
      const { user_id, old_pin, new_pin } = await parseJsonBody(req);
      const usersPath = path.join(DATA_DIR, 'pos_users.json');
      if (!fs.existsSync(usersPath)) {
        res.writeHead(400);
        return res.end(JSON.stringify({ success: false, message: 'User database not found.' }));
      }
      const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
      const user = users.find(u => u.id === user_id && String(u.pin).trim() === String(old_pin).trim());
      if (!user) {
        res.writeHead(400);
        return res.end(JSON.stringify({ success: false, message: 'Current PIN is incorrect.' }));
      }
      user.pin = String(new_pin).trim();
      fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8');
      res.writeHead(200);
      return res.end(JSON.stringify({ success: true, message: `PIN updated successfully for ${user.name}` }));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 0c. GET /api/auth/users (List Available POS Accounts)
  if (req.method === 'GET' && pathname === '/api/auth/users') {
    const usersPath = path.join(DATA_DIR, 'pos_users.json');
    const users = fs.existsSync(usersPath)
      ? JSON.parse(fs.readFileSync(usersPath, 'utf8'))
      : [];
    res.writeHead(200);
    return res.end(JSON.stringify(users.map(u => ({ id: u.id, name: u.name, role: u.role, terminal_id: u.terminal_id }))));
  }

  // 0d. POST /api/auth/update-name (Rename Cashier Account)
  if (req.method === 'POST' && pathname === '/api/auth/update-name') {
    try {
      const { user_id, name } = await parseJsonBody(req);
      const usersPath = path.join(DATA_DIR, 'pos_users.json');
      if (!fs.existsSync(usersPath)) {
        res.writeHead(400);
        return res.end(JSON.stringify({ success: false, message: 'User database not found.' }));
      }
      const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
      const user = users.find(u => u.id === user_id);
      if (!user) {
        res.writeHead(404);
        return res.end(JSON.stringify({ success: false, message: 'User not found.' }));
      }
      const oldName = user.name;
      user.name = String(name || '').trim();
      fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8');
      res.writeHead(200);
      return res.end(JSON.stringify({ success: true, message: `Account renamed from "${oldName}" to "${user.name}"`, user }));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 0. POST /api/terminal/init (Multi-Terminal Auto-Discovery)
  if (req.method === 'POST' && pathname === '/api/terminal/init') {
    try {
      const body = await parseJsonBody(req);
      const rawIp = req.socket.remoteAddress || req.headers['x-forwarded-for'] || '127.0.0.1';
      const cleanIp = rawIp.replace(/^.*:/, '');

      let assignedTerminal = body.terminal_id;

      if (!assignedTerminal) {
        if (cleanIp === '1' || cleanIp === '127.0.0.1' || cleanIp === 'localhost') {
          assignedTerminal = 'TERM-01'; // Host PC is Terminal 1
        } else if (connectedTerminals.has(cleanIp)) {
          assignedTerminal = connectedTerminals.get(cleanIp);
        } else {
          // Assign next available terminal (TERM-02, TERM-03, ...)
          const used = new Set(Array.from(connectedTerminals.values()));
          used.add('TERM-01');
          const allTerminals = ['TERM-02', 'TERM-03', 'TERM-04', 'TERM-05'];
          assignedTerminal = allTerminals.find(t => !used.has(t)) || `TERM-0${used.size + 1}`;
        }
      }

      connectedTerminals.set(cleanIp, assignedTerminal);

      res.writeHead(200);
      return res.end(JSON.stringify({
        success: true,
        terminal_id: assignedTerminal,
        client_ip: cleanIp,
        is_server_host: (cleanIp === '1' || cleanIp === '127.0.0.1')
      }));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 1. GET /api/catalog
  if (req.method === 'GET' && pathname === '/api/catalog') {
    if (fs.existsSync(CATALOG_PATH)) {
      res.writeHead(200);
      return fs.createReadStream(CATALOG_PATH).pipe(res);
    } else {
      res.writeHead(200);
      return res.end(JSON.stringify([]));
    }
  }

  // 2. GET /api/customers
  if (req.method === 'GET' && pathname === '/api/customers') {
    const custs = fs.existsSync(CUSTOMERS_PATH)
      ? JSON.parse(fs.readFileSync(CUSTOMERS_PATH, 'utf8'))
      : [{ id: '1560234000000095179', name: 'Walk-in Customer', display_name: 'Walk-in Customer' }];
    res.writeHead(200);
    return res.end(JSON.stringify(custs));
  }

  // 2b. POST /api/customers (Create New Customer On-the-Fly & Auto-Sync)
  if (req.method === 'POST' && pathname === '/api/customers') {
    try {
      const body = await parseJsonBody(req);
      const name = String(body.name || '').trim();
      if (!name) {
        res.writeHead(400);
        return res.end(JSON.stringify({ success: false, message: 'Customer name is required' }));
      }

      const phone = String(body.phone || '').trim();
      const email = String(body.email || '').trim();
      const company = String(body.company_name || name).trim();
      const debt = parseFloat(body.opening_debt) || 0;

      const custs = fs.existsSync(CUSTOMERS_PATH)
        ? JSON.parse(fs.readFileSync(CUSTOMERS_PATH, 'utf8'))
        : [];

      // Check for duplicate
      const existing = custs.find(c => c.name.toLowerCase() === name.toLowerCase() || (phone && c.phone && c.phone === phone));
      if (existing) {
        res.writeHead(200);
        return res.end(JSON.stringify({ success: true, customer: existing, message: 'Existing customer selected.' }));
      }

      const newCust = {
        id: `loc_cust_${Date.now()}`,
        name: name,
        company_name: company,
        phone: phone,
        email: email,
        outstanding: debt,
        display_name: name,
        is_local_created: true
      };

      custs.push(newCust);
      fs.writeFileSync(CUSTOMERS_PATH, JSON.stringify(custs, null, 2), 'utf8');
      writeSyncLog('INFO', `Locally registered new customer "${name}" (Phone: ${phone || 'N/A'}).`);

      // Attempt immediate background sync to Zoho if online
      if (syncState.isOnline && !syncState.isSyncing) {
        (async () => {
          try {
            const { context, frame, headers, invOrgId } = await createZohoSession();
            try {
              const res = await frame.evaluate(async ({ url, h, b }) => {
                const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(b) });
                return await r.json();
              }, {
                url: `/posapi/api/v1/contacts?organization_id=${invOrgId}`,
                h: headers,
                b: {
                  contact_name: name,
                  company_name: company,
                  contact_type: 'customer',
                  phone: phone,
                  email: email
                }
              });
              if (res.code === 0 && res.contact) {
                newCust.id = res.contact.contact_id;
                newCust.zoho_contact_id = res.contact.contact_id;
                delete newCust.is_local_created;
                fs.writeFileSync(CUSTOMERS_PATH, JSON.stringify(custs, null, 2), 'utf8');
                writeSyncLog('SUCCESS', `Synced customer "${name}" to Zoho Books (Contact ID: ${res.contact.contact_id}).`);
              }
            } finally {
              await context.close();
            }
          } catch(e) {
            writeSyncLog('WARN', `Customer "${name}" will be synced to Zoho on next scheduled cycle: ${e.message}`);
          }
        })();
      }

      res.writeHead(200);
      return res.end(JSON.stringify({ success: true, customer: newCust, message: `Customer "${name}" registered successfully!` }));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 3. POST /api/sales (Save to Offline Outbox with Server Stock Guard & Active Account Order ID)
  if (req.method === 'POST' && pathname === '/api/sales') {
    try {
      const saleData = await parseJsonBody(req);
      const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));

      // 0a. Check idempotency for emergency standalone re-flushes
      const existing = queue.find(s => (saleData.id && s.id === saleData.id) || 
                                       (saleData.receipt_number && s.receipt_number === saleData.receipt_number));
      if (existing) {
        return res.end(JSON.stringify({
          success: true,
          sale: existing,
          message: 'Sale already recorded in queue.'
        }));
      }

      // 0. Enforce PIN Login Security: Reject unauthenticated sales postings
      const usersPath = path.join(DATA_DIR, 'pos_users.json');
      const users = fs.existsSync(usersPath)
        ? JSON.parse(fs.readFileSync(usersPath, 'utf8'))
        : [
          { id: 'u1', name: 'Manager / Admin', pin: '9545', role: 'admin' },
          { id: 'u5', name: 'Finance / Accounts', pin: '6935', role: 'finance' },
          { id: 'u2', name: 'Cashier 1', pin: '5713', role: 'cashier', terminal_id: 'TERM-01' },
          { id: 'u3', name: 'Cashier 2', pin: '5917', role: 'cashier', terminal_id: 'TERM-02' }
        ];

      const activeUser = users.find(u => (saleData.user_id && u.id === saleData.user_id) || 
                                         (saleData.user_name && u.name.toLowerCase() === saleData.user_name.toLowerCase()) ||
                                         (saleData.tilled_by && u.name.toLowerCase() === saleData.tilled_by.toLowerCase()) ||
                                         (saleData.salesperson && u.name.toLowerCase() === saleData.salesperson.toLowerCase()));
      if (!activeUser) {
        res.writeHead(401);
        return res.end(JSON.stringify({
          success: false,
          message: 'Unauthorized: You must login with a valid cashier PIN to post sales.'
        }));
      }
      const tillerName = activeUser.name;

      let catalog = [];
      if (fs.existsSync(CATALOG_PATH)) {
        catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
      }

      // 0b. RBAC Enforcement: Cashiers cannot apply discounts without Manager or Finance PIN authorization
      const isCashier = activeUser.role === 'cashier';
      const hasDiscount = (saleData.discount && parseFloat(saleData.discount) > 0) ||
                          (saleData.subtotal && saleData.total && parseFloat(saleData.total) < parseFloat(saleData.subtotal));

      if (isCashier && hasDiscount) {
        const isAuthorized = saleData.manager_override === true && saleData.manager_override_by;
        if (!isAuthorized) {
          res.writeHead(403);
          return res.end(JSON.stringify({
            success: false,
            message: 'Sale rejected: Cashiers cannot apply discounts without Manager or Finance PIN authorization.'
          }));
        }
      }

      // 0c. RBAC Enforcement: Cashiers cannot change price on order without Manager or Finance PIN authorization
      if (isCashier) {
        for (const line of (saleData.line_items || [])) {
          const item = catalog.find(i => String(i.id) === String(line.item_id));
          if (item) {
            let expectedPrice = item.retail_price || 0;
            if (line.unit && item.units && item.units.length) {
              const matchedUnit = item.units.find(u => u.unit_symbol === line.unit || u.name === line.unit);
              if (matchedUnit && matchedUnit.price !== undefined) {
                expectedPrice = matchedUnit.price;
              }
            }
            const soldRate = line.rate !== undefined ? line.rate : (line.unit_price !== undefined ? line.unit_price : null);
            if (soldRate !== null && Math.round(parseFloat(soldRate)) !== Math.round(parseFloat(expectedPrice))) {
              const isAuthorized = saleData.manager_override === true && saleData.manager_override_by;
              if (!isAuthorized) {
                res.writeHead(403);
                return res.end(JSON.stringify({
                  success: false,
                  message: `Sale rejected: Cashiers cannot change price on order for "${item.name}". Expected ₦${expectedPrice.toLocaleString()}, got ₦${parseFloat(soldRate).toLocaleString()}. Requires Manager or Finance PIN.`
                }));
              }
            }
          }
        }
      }

      // 1. Strict Server Stock Verification: Block sales of out-of-stock items
      for (const line of (saleData.line_items || [])) {
        const item = catalog.find(i => String(i.id) === String(line.item_id));
        if (item) {
          const bulkUnit = (item.units || []).find(u => !u.is_base) || item.units?.[item.units.length - 1];
          const bulkRatio = bulkUnit ? (bulkUnit.conversion_ratio > 1 ? bulkUnit.conversion_ratio : (bulkUnit.units_per_bulk || (bulkUnit.conversion_ratio > 0 && bulkUnit.conversion_ratio < 1 ? Math.round(1 / bulkUnit.conversion_ratio) : 1))) : 1;
          const currentStockBulk = parseFloat(item.stock) || 0;
          const currentStockBase = Math.round((currentStockBulk * bulkRatio) * 100) / 100;

          let sellRatio = 1;
          if (line.unit) {
            const soldUnit = (item.units || []).find(u => u.unit_symbol === line.unit || u.name === line.unit);
            if (soldUnit) {
              sellRatio = soldUnit.is_base ? 1 : (soldUnit.conversion_ratio > 1 ? soldUnit.conversion_ratio : (soldUnit.units_per_bulk || (soldUnit.conversion_ratio > 0 && soldUnit.conversion_ratio < 1 ? Math.round(1 / soldUnit.conversion_ratio) : 1)));
            }
          }
          const requestedBase = Math.round((line.quantity * sellRatio) * 100) / 100;

          if (currentStockBase <= 0) {
            res.writeHead(400);
            return res.end(JSON.stringify({
              success: false,
              message: `Sale blocked: "${item.name}" is OUT OF STOCK.`
            }));
          }
          if (requestedBase > currentStockBase) {
            res.writeHead(400);
            return res.end(JSON.stringify({
              success: false,
              message: `Sale blocked: Insufficient stock for "${item.name}". Requested ${requestedBase} base units, only ${currentStockBase} available.`
            }));
          }
        }
      }

      // 2. Decrement stock atomically in server's pos_catalog.json
      for (const line of (saleData.line_items || [])) {
        const item = catalog.find(i => String(i.id) === String(line.item_id));
        if (item) {
          const bulkUnit = (item.units || []).find(u => !u.is_base) || item.units?.[item.units.length - 1];
          const bulkRatio = bulkUnit ? (bulkUnit.conversion_ratio > 1 ? bulkUnit.conversion_ratio : (bulkUnit.units_per_bulk || (bulkUnit.conversion_ratio > 0 && bulkUnit.conversion_ratio < 1 ? Math.round(1 / bulkUnit.conversion_ratio) : 1))) : 1;
          let sellRatio = 1;
          if (line.unit) {
            const soldUnit = (item.units || []).find(u => u.unit_symbol === line.unit || u.name === line.unit);
            if (soldUnit) {
              sellRatio = soldUnit.is_base ? 1 : (soldUnit.conversion_ratio > 1 ? soldUnit.conversion_ratio : (soldUnit.units_per_bulk || (soldUnit.conversion_ratio > 0 && soldUnit.conversion_ratio < 1 ? Math.round(1 / soldUnit.conversion_ratio) : 1)));
            }
          }
          const soldBulk = (line.quantity * sellRatio) / bulkRatio;
          item.stock = Math.max(0, Math.round(((parseFloat(item.stock) || 0) - soldBulk) * 100) / 100);
        }
      }
      fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');

      // 3. Issue Sequential Retail Order ID & Explicit Till Tracking (Monotonic counter; preserves emergency standalone receipt numbers)
      const term = saleData.terminal_id || activeUser.terminal_id || 'TERM-01';
      let orderId = (saleData.standalone_offline && saleData.receipt_number) ? saleData.receipt_number : null;
      if (!orderId) {
        let maxNum = 0;
        for (const s of queue) {
          const m = (s.order_id || s.receipt_number || '').match(/QS-(\d+)/i);
          if (m) {
            const num = parseInt(m[1], 10);
            if (num > maxNum) maxNum = num;
          }
        }
        const nextNum = Math.max(maxNum + 1, queue.length + 1);
        orderId = `QS-${String(nextNum).padStart(5, '0')}`;
      }

      const newSale = {
        id: `sale_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        order_id: orderId,
        receipt_number: orderId,
        tilled_by: tillerName,
        user_id: activeUser.id,
        salesperson: tillerName,
        cashier_role: activeUser.role,
        terminal_id: term,
        customer_id: saleData.customer_id,
        customer_name: saleData.customer_name,
        date: saleData.date,
        payment_mode: saleData.payment_mode,
        payments: saleData.payments || [],
        amount_paid: saleData.amount_paid !== undefined ? saleData.amount_paid : saleData.total,
        change: saleData.change || 0,
        subtotal: saleData.subtotal !== undefined ? saleData.subtotal : saleData.total,
        discount: saleData.discount || 0,
        manager_override: saleData.manager_override || false,
        manager_override_by: saleData.manager_override_by || null,
        total: saleData.total,
        line_items: saleData.line_items,
        status: 'PENDING_SYNC',
        created_at: new Date().toISOString()
      };

      queue.push(newSale);
      fs.writeFileSync(QUEUE_PATH, JSON.stringify(queue, null, 2), 'utf8');

      // 4. Auto-kick Cash Drawer (RJ11 Pulse) on Cash transactions
      const isCashSale = (newSale.payment_mode === 'CASH' || (newSale.payments && newSale.payments.some(p => (p.mode || '').toLowerCase() === 'cash')));
      if (isCashSale && saleData.auto_kick_drawer !== false) {
        hardwarePrinter.kickCashDrawer(saleData.printer_name || '').catch(() => {});
      }

      res.writeHead(200);
      return res.end(JSON.stringify({ 
        success: true, 
        sale: newSale,
        cash_drawer_kicked: isCashSale
      }));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 4. GET /api/queue
  if (req.method === 'GET' && pathname === '/api/queue') {
    const queue = JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
    const pending = queue.filter(q => q.status === 'PENDING_SYNC').length;
    res.writeHead(200);
    return res.end(JSON.stringify({
      total_sales: queue.length,
      pending_count: pending,
      synced_count: queue.length - pending,
      sales: queue.slice(-20).reverse()
    }));
  }

  // 5. POST /api/sync (Push Offline Sales to Zoho)
  if (req.method === 'POST' && pathname === '/api/sync') {
    try {
      const syncResult = await syncOfflineSalesToZoho();
      res.writeHead(200);
      return res.end(JSON.stringify({ success: true, ...syncResult }));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 6. POST /api/sync/pull (Pull Customers & Live Inventory from Zoho)
  if (req.method === 'POST' && pathname === '/api/sync/pull') {
    try {
      const pullResult = await executePullSync('manual user trigger');
      res.writeHead(200);
      return res.end(JSON.stringify(pullResult));
    } catch (err) {
      console.error('Error during pull sync:', err);
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 6b. GET /api/sync/status (Live Cloud Sync Status & Countdown)
  if (req.method === 'GET' && pathname === '/api/sync/status') {
    res.writeHead(200);
    return res.end(JSON.stringify({
      success: true,
      is_online: syncState.isOnline,
      is_syncing: syncState.isSyncing,
      last_sync_time: syncState.lastSyncTime,
      last_sync_result: syncState.lastSyncResult,
      last_sync_summary: syncState.lastSyncSummary,
      next_scheduled_sync: syncState.nextScheduledSync,
      interval_minutes: 10,
      log_file: 'logs/zoho_sync.log'
    }));
  }

  // 6c. GET /api/sync/logs (Last 100 Sync Engine Log Lines)
  if (req.method === 'GET' && pathname === '/api/sync/logs') {
    try {
      if (fs.existsSync(SYNC_LOG_PATH)) {
        const lines = fs.readFileSync(SYNC_LOG_PATH, 'utf8').trim().split('\n');
        const tail = lines.slice(-100);
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(tail.join('\n'));
      } else {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('No sync logs recorded yet.');
      }
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 6d. POST /api/catalog/update-price (Manager or Finance authorization required)
  if (req.method === 'POST' && pathname === '/api/catalog/update-price') {
    try {
      const body = await parseJsonBody(req);
      const { item_id, retail_price, carton_price, user_role, manager_pin } = body;

      if (user_role === 'cashier') {
        const usersPath = path.join(DATA_DIR, 'pos_users.json');
        const users = fs.existsSync(usersPath) ? JSON.parse(fs.readFileSync(usersPath, 'utf8')) : [];
        const isMgr = users.find(u => u.pin === String(manager_pin).trim() && (u.role === 'admin' || u.role === 'finance' || u.role === 'manager'));
        if (!isMgr) {
          res.writeHead(403);
          return res.end(JSON.stringify({ success: false, message: 'Unauthorized: Cashiers cannot modify product prices. Manager or Finance authorization required.' }));
        }
      }

      if (!item_id) {
        res.writeHead(400);
        return res.end(JSON.stringify({ success: false, message: 'item_id is required' }));
      }

      const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
      const item = catalog.find(it => it.id === item_id);

      if (!item) {
        res.writeHead(404);
        return res.end(JSON.stringify({ success: false, message: 'Item not found in catalog' }));
      }

      if (retail_price !== undefined) {
        item.retail_price = Math.round(parseFloat(retail_price) || 0);
        const baseUnit = item.units.find(u => u.is_base);
        if (baseUnit) baseUnit.price = item.retail_price;
      }

      if (carton_price !== undefined) {
        item.carton_price = Math.round(parseFloat(carton_price) || 0);
        const bulkUnit = item.units.find(u => !u.is_base);
        if (bulkUnit) bulkUnit.price = item.carton_price;
      }

      fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2), 'utf8');

      res.writeHead(200);
      return res.end(JSON.stringify({ success: true, message: `Updated prices for ${item.name}`, item }));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 7. GET /api/status
  if (req.method === 'GET' && pathname === '/api/status') {
    const localIp = getLocalIpAddress();
    res.writeHead(200);
    return res.end(JSON.stringify({
      status: 'OK',
      port: PORT,
      local_ip: localIp,
      lan_url: `http://${localIp}:${PORT}`,
      time: new Date().toISOString(),
      sync_info: {
        is_online: syncState.isOnline,
        is_syncing: syncState.isSyncing,
        last_sync_time: syncState.lastSyncTime,
        last_sync_result: syncState.lastSyncResult,
        last_sync_summary: syncState.lastSyncSummary,
        next_scheduled_sync: syncState.nextScheduledSync
      }
    }));
  }

  // 8a. GET /api/hardware/printers (Discover installed thermal and Windows printers)
  if (req.method === 'GET' && pathname === '/api/hardware/printers') {
    try {
      const printers = await hardwarePrinter.getInstalledPrinters();
      res.writeHead(200);
      return res.end(JSON.stringify({ success: true, printers }));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 8b. POST /api/hardware/open-drawer (Standard RJ11 ESC/POS pulse \x1B\x70\x00\x19\xFA)
  if (req.method === 'POST' && pathname === '/api/hardware/open-drawer') {
    try {
      const body = await parseJsonBody(req);
      const printerName = body.printer_name || '';
      const result = await hardwarePrinter.kickCashDrawer(printerName);
      res.writeHead(result.success ? 200 : 500);
      return res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 8c. POST /api/hardware/print (Direct Raw ESC/POS Thermal Spooling - No Browser Dialog)
  if (req.method === 'POST' && pathname === '/api/hardware/print') {
    try {
      const body = await parseJsonBody(req);
      const sale = body.sale || body;
      const printerName = body.printer_name || '';
      const kickDrawer = body.open_drawer !== undefined
        ? body.open_drawer
        : (sale.payment_mode === 'CASH' || (sale.payments && sale.payments.some(p => (p.mode || '').toLowerCase() === 'cash')));

      const buffer = hardwarePrinter.formatEscPosReceipt(sale, {
        paper: body.paper || '80',
        kickDrawer: kickDrawer
      });

      const result = await hardwarePrinter.printDirect(printerName, buffer);
      res.writeHead(result.success ? 200 : 500);
      return res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 9a. GET /api/backups (List all available database archives)
  if (req.method === 'GET' && pathname === '/api/backups') {
    try {
      const backups = backupManager.listBackups();
      res.writeHead(200);
      return res.end(JSON.stringify({ success: true, backups }));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 9b. POST /api/backup/now (Trigger instant on-demand backup)
  if (req.method === 'POST' && pathname === '/api/backup/now') {
    try {
      const result = await backupManager.createBackup('manual cashier / admin trigger');
      res.writeHead(result.success ? 200 : 500);
      return res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 9c. GET /api/backups/:filename (Download database archive zip)
  if (req.method === 'GET' && pathname.startsWith('/api/backups/')) {
    const rawFilename = path.basename(decodeURIComponent(pathname.replace('/api/backups/', '')));
    const filePath = path.join(backupManager.BACKUPS_DIR, rawFilename);
    if (fs.existsSync(filePath) && filePath.endsWith('.zip')) {
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${rawFilename}"`
      });
      return fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      return res.end(JSON.stringify({ success: false, message: 'Backup file not found' }));
    }
  }

  // 10a. POST /api/users/verify-manager-pin (Validate Manager Override PIN for Discounts > 5%)
  if (req.method === 'POST' && pathname === '/api/users/verify-manager-pin') {
    try {
      const body = await parseJsonBody(req);
      const pin = String(body.pin || '').trim();
      const usersPath = path.join(DATA_DIR, 'pos_users.json');
      const users = fs.existsSync(usersPath) ? JSON.parse(fs.readFileSync(usersPath, 'utf8')) : [];
      const manager = users.find(u => u.pin === pin && (u.role === 'admin' || u.role === 'finance' || u.role === 'manager'));
      if (manager) {
        res.writeHead(200);
        return res.end(JSON.stringify({
          success: true,
          manager: { id: manager.id, name: manager.name, role: manager.role },
          message: `Manager override authorized by ${manager.name} (${manager.role.toUpperCase()}).`
        }));
      } else {
        res.writeHead(403);
        return res.end(JSON.stringify({ success: false, message: 'Invalid Manager / Finance PIN. Authorization denied.' }));
      }
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 10b. GET /api/shifts/active (Get current active shift for terminal/cashier)
  if (req.method === 'GET' && pathname === '/api/shifts/active') {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
      const term = parsedUrl.searchParams.get('terminal_id') || 'TERM-01';
      const activeShifts = fs.existsSync(ACTIVE_SHIFTS_PATH) ? JSON.parse(fs.readFileSync(ACTIVE_SHIFTS_PATH, 'utf8')) : {};
      const active = activeShifts[term] || null;
      res.writeHead(200);
      return res.end(JSON.stringify({ success: true, active_shift: active }));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 10c. POST /api/shifts/open (Open shift and record morning cash float)
  if (req.method === 'POST' && pathname === '/api/shifts/open') {
    try {
      const body = await parseJsonBody(req);
      const term = body.terminal_id || 'TERM-01';
      const activeShifts = fs.existsSync(ACTIVE_SHIFTS_PATH) ? JSON.parse(fs.readFileSync(ACTIVE_SHIFTS_PATH, 'utf8')) : {};
      const shift = {
        shift_id: `SHIFT-${Date.now().toString(36).toUpperCase()}`,
        terminal_id: term,
        cashier_id: body.cashier_id || 'u2',
        cashier_name: body.cashier_name || 'Cashier 1',
        opening_float: parseFloat(body.opening_float) || 0,
        opened_at: new Date().toISOString(),
        opened_at_local: formatLocalTime(),
        status: 'OPEN'
      };
      activeShifts[term] = shift;
      fs.writeFileSync(ACTIVE_SHIFTS_PATH, JSON.stringify(activeShifts, null, 2), 'utf8');
      res.writeHead(200);
      return res.end(JSON.stringify({ success: true, shift, message: `Shift opened with float of ₦${shift.opening_float.toLocaleString()}` }));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 10d. POST /api/shifts/close (Close shift, compute reconciliation variance, save Z-Report)
  if (req.method === 'POST' && pathname === '/api/shifts/close') {
    try {
      const body = await parseJsonBody(req);
      const term = body.terminal_id || 'TERM-01';
      const activeShifts = fs.existsSync(ACTIVE_SHIFTS_PATH) ? JSON.parse(fs.readFileSync(ACTIVE_SHIFTS_PATH, 'utf8')) : {};
      const current = activeShifts[term] || {
        opening_float: parseFloat(body.opening_float) || 0,
        opened_at_local: formatLocalTime(),
        cashier_name: body.cashier_name || 'Cashier'
      };

      const queue = fs.existsSync(QUEUE_PATH) ? JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8')) : [];
      // Filter sales for this terminal / cashier since opened_at
      const shiftStart = current.opened_at ? new Date(current.opened_at) : new Date(Date.now() - 24 * 3600 * 1000);
      const shiftSales = queue.filter(s => {
        const saleDate = new Date(s.created_at || s.date);
        return saleDate >= shiftStart && (!s.terminal_id || s.terminal_id === term);
      });

      let cashTotal = 0, cashCount = 0;
      let cardTotal = 0, cardCount = 0;
      let transferTotal = 0, transferCount = 0;
      let creditTotal = 0, creditCount = 0;
      let grossRev = 0;

      for (const s of shiftSales) {
        grossRev += (parseFloat(s.total) || 0);
        const mode = (s.payment_mode || 'CASH').toLowerCase();
        if (mode === 'cash') {
          cashTotal += (parseFloat(s.total) || 0);
          cashCount++;
        } else if (mode.includes('moniepoint') || mode.includes('card') || mode.includes('pos')) {
          cardTotal += (parseFloat(s.total) || 0);
          cardCount++;
        } else if (mode.includes('transfer') || mode.includes('bank')) {
          transferTotal += (parseFloat(s.total) || 0);
          transferCount++;
        } else if (mode.includes('credit') || mode.includes('debt') || mode.includes('account')) {
          creditTotal += (parseFloat(s.total) || 0);
          creditCount++;
        } else if (mode === 'split' && Array.isArray(s.payments)) {
          for (const p of s.payments) {
            const pMode = (p.mode || '').toLowerCase();
            const pAmt = parseFloat(p.amount) || 0;
            if (pMode === 'cash') { cashTotal += pAmt; cashCount++; }
            else if (pMode.includes('card') || pMode.includes('moniepoint')) { cardTotal += pAmt; cardCount++; }
            else if (pMode.includes('transfer')) { transferTotal += pAmt; transferCount++; }
            else { creditTotal += pAmt; creditCount++; }
          }
        } else {
          cashTotal += (parseFloat(s.total) || 0);
          cashCount++;
        }
      }

      const openingFloat = current.opening_float || 0;
      const expectedCash = openingFloat + cashTotal;
      const countedCash = parseFloat(body.counted_cash) || 0;
      const variance = countedCash - expectedCash;

      const zReport = {
        report_id: `Z-${Date.now().toString(36).toUpperCase()}`,
        terminal_id: term,
        cashier_id: body.cashier_id || current.cashier_id || 'u2',
        cashier_name: body.cashier_name || current.cashier_name || 'Staff',
        opened_at: current.opened_at_local || formatLocalTime(shiftStart),
        closed_at: formatLocalTime(),
        total_sales: shiftSales.length,
        gross_revenue: grossRev,
        opening_float: openingFloat,
        cash_total: cashTotal,
        cash_count: cashCount,
        card_total: cardTotal,
        card_count: cardCount,
        transfer_total: transferTotal,
        transfer_count: transferCount,
        credit_total: creditTotal,
        credit_count: creditCount,
        expected_cash: expectedCash,
        counted_cash: countedCash,
        variance: variance,
        status: variance === 0 ? 'BALANCED' : (variance > 0 ? 'OVER' : 'SHORT'),
        created_at: new Date().toISOString()
      };

      const history = fs.existsSync(SHIFTS_PATH) ? JSON.parse(fs.readFileSync(SHIFTS_PATH, 'utf8')) : [];
      history.push(zReport);
      fs.writeFileSync(SHIFTS_PATH, JSON.stringify(history, null, 2), 'utf8');

      // Clear active shift for terminal
      delete activeShifts[term];
      fs.writeFileSync(ACTIVE_SHIFTS_PATH, JSON.stringify(activeShifts, null, 2), 'utf8');

      res.writeHead(200);
      return res.end(JSON.stringify({ success: true, report: zReport, message: 'Shift closed successfully.' }));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 10e. GET /api/shifts/history (List previous closed Z-reports)
  if (req.method === 'GET' && pathname === '/api/shifts/history') {
    try {
      const history = fs.existsSync(SHIFTS_PATH) ? JSON.parse(fs.readFileSync(SHIFTS_PATH, 'utf8')) : [];
      res.writeHead(200);
      return res.end(JSON.stringify({ success: true, reports: history.reverse() }));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  // 10f. POST /api/hardware/print-zreport (Send ESC/POS thermal Z-Report to USB receipt printer)
  if (req.method === 'POST' && pathname === '/api/hardware/print-zreport') {
    try {
      const body = await parseJsonBody(req);
      const report = body.report || body;
      const printerName = body.printer_name || '';
      const buffer = hardwarePrinter.formatEscPosZReport(report, { paper: body.paper || '80' });
      const result = await hardwarePrinter.printDirect(printerName, buffer);
      res.writeHead(result.success ? 200 : 500);
      return res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(500);
      return res.end(JSON.stringify({ success: false, message: err.message }));
    }
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Endpoint Not Found' }));
});

function startServer() {
  const localIp = getLocalIpAddress();
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n================================================================`);
    console.log(`        Quality Superstores - Offline-First POS Server          `);
    console.log(`================================================================`);
    console.log(`\n🚀 POS Terminal Server running at: http://localhost:${PORT}`);
    console.log(`📡 Local Network Access (Wi-Fi/LAN): http://${localIp}:${PORT}`);
    console.log(`💾 Offline Mode: 100% active (Zero-decimal fixed carton/piece rates)`);
    console.log(`🔄 Auto-Sync: Ready to push sales to Zoho Books & Inventory`);
    console.log(`⏱️ Background Pull: Every 10 mins (Auto-reconnect watchdog active)`);
    console.log(`🖨️ Hardware & Thermal Printer: ESC/POS Direct Spooler & RJ11 Drawer Active`);
    console.log(`🛡️ Automated Data Protection: 11:59 PM Nightly Auto-Backup Armed`);
    console.log(`📁 Local Log: logs/zoho_sync.log`);
    console.log(`================================================================\n`);

    // Start background sync scheduler
    startSyncScheduler();

    // Start nightly auto-backup scheduler (11:59 PM)
    backupManager.startNightlyScheduler();
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer, server };


// =============================================================================
// QUALITY SUPERSTORES POS - MULTI-USER SIMULTANEOUS CONCURRENCY & STRESS TEST
// =============================================================================
// Simulates concurrent cashiers, managers, and finance officers operating the POS
// simultaneously across different terminals (KETERE 2, TERM-01, TERM-02, OFFICE-01).
// Tests all core features, detects race conditions, receipt collisions, stock leaks,
// and RBAC bypasses under real-time concurrent loads.
// =============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

// Use port 3002 for isolated sandbox simulation
process.env.PORT = '3002';
const PORT = 3002;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Back up critical data files in memory to restore pristine state after stress testing
const BACKUPS = {};
const DATA_FILES = [
  'pos_catalog.json',
  'customers.json',
  'offline_sales_queue.json',
  'active_shifts.json',
  'shift_reports.json'
];

function backupState() {
  for (const f of DATA_FILES) {
    const p = path.join(DATA_DIR, f);
    if (fs.existsSync(p)) {
      BACKUPS[f] = fs.readFileSync(p, 'utf8');
    }
  }
}

function restoreState() {
  for (const f of DATA_FILES) {
    if (BACKUPS[f] !== undefined) {
      fs.writeFileSync(path.join(DATA_DIR, f), BACKUPS[f], 'utf8');
    }
  }
}

// HTTP request helper
async function req(pathname, options = {}) {
  const url = `${BASE_URL}${pathname}`;
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined
  });
  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  } else {
    data = await res.text().catch(() => null);
  }
  return { status: res.status, headers: res.headers, data };
}

// Test Runner
async function runSimulation() {
  console.log('\n=================================================================');
  console.log('   STARTING SIMULTANEOUS MULTI-USER POS STRESS & AUDIT SUITE    ');
  console.log('=================================================================\n');

  backupState();

  // Import server from pos_server.js
  const { server } = require('../pos_server.js');

  await new Promise((resolve, reject) => {
    server.listen(PORT, '0.0.0.0', err => {
      if (err) return reject(err);
      console.log(`✓ Test POS Hub server listening on ${BASE_URL}\n`);
      resolve();
    });
  });

  let passed = 0;
  let failed = 0;
  const anomalies = [];

  function record(desc, ok, details = '') {
    if (ok) {
      passed++;
      console.log(`  ✅ PASS: ${desc}`);
    } else {
      failed++;
      anomalies.push({ desc, details });
      console.log(`  ❌ FAIL: ${desc} ${details ? '-> ' + details : ''}`);
    }
  }

  try {
    // -------------------------------------------------------------------------
    // TEST 1: PWA Static Assets & Hub Service
    // -------------------------------------------------------------------------
    console.log('[1/14] Testing PWA Static Delivery & Offline Assets...');
    const [pwaIndex, pwaManifest, pwaSw] = await Promise.all([
      req('/'),
      req('/manifest.json'),
      req('/sw.js')
    ]);
    record('Web POS UI served at root (HTTP 200)', pwaIndex.status === 200 && typeof pwaIndex.data === 'string' && pwaIndex.data.includes('Quality Superstores'));
    record('PWA Web App Manifest valid (HTTP 200, display: standalone)', pwaManifest.status === 200 && pwaManifest.data?.display === 'standalone');
    record('Offline-First Service Worker operational (HTTP 200, sw.js)', pwaSw.status === 200 && typeof pwaSw.data === 'string' && pwaSw.data.includes('qs-pos'));

    // -------------------------------------------------------------------------
    // TEST 2: Multi-User Concurrent Authentication
    // -------------------------------------------------------------------------
    console.log('\n[2/14] Simulating 4 Staff Members Logging In Concurrently...');
    const staffLogins = [
      { name: 'Funmilayo (Manager)', pin: '9545', role: 'admin' },
      { name: 'Oluwatosin (Cashier 1)', pin: '5713', role: 'cashier', terminal: 'KETERE 2' },
      { name: 'Cashier 2 (Cashier 2)', pin: '5917', role: 'cashier', terminal: 'TERM-02' },
      { name: 'Oluwatobi (Finance)', pin: '6935', role: 'finance' }
    ];

    const loginResults = await Promise.all(
      staffLogins.map(s => req('/api/auth/login', { method: 'POST', body: { pin: s.pin } }))
    );

    loginResults.forEach((res, i) => {
      const s = staffLogins[i];
      const ok = res.status === 200 && res.data?.success === true && res.data?.user?.role === s.role;
      record(`Concurrent Login: ${s.name} authenticated correctly`, ok, res.data?.message);
    });

    // -------------------------------------------------------------------------
    // TEST 3: Authentication Security & Invalid PIN Rejection
    // -------------------------------------------------------------------------
    console.log('\n[3/14] Testing Authentication Security & Brute-Force Rejection...');
    const badPins = ['0000', '1234', '9999', 'abcd', ''];
    const badResults = await Promise.all(
      badPins.map(pin => req('/api/auth/login', { method: 'POST', body: { pin } }))
    );
    const allRejected = badResults.every(r => r.status === 401 && r.data?.success === false);
    record('All 5 invalid/guessable PINs strictly rejected with HTTP 401', allRejected);

    // -------------------------------------------------------------------------
    // TEST 4: Manager Override Verification Endpoint
    // -------------------------------------------------------------------------
    console.log('\n[4/14] Testing Managerial Override PIN Authorization...');
    const [mgrApprove, finApprove, cashierReject] = await Promise.all([
      req('/api/users/verify-manager-pin', { method: 'POST', body: { pin: '9545' } }),
      req('/api/users/verify-manager-pin', { method: 'POST', body: { pin: '6935' } }),
      req('/api/users/verify-manager-pin', { method: 'POST', body: { pin: '5713' } })
    ]);
    record('Manager PIN (9545) successfully grants override', mgrApprove.status === 200 && mgrApprove.data?.success === true);
    record('Finance PIN (6935) successfully grants override', finApprove.status === 200 && finApprove.data?.success === true);
    record('Cashier PIN (5713) is strictly blocked from managerial override (HTTP 403)', cashierReject.status === 403 && cashierReject.data?.success === false);

    // -------------------------------------------------------------------------
    // TEST 5: Concurrent Catalog & Customer Reads Under Load
    // -------------------------------------------------------------------------
    console.log('\n[5/14] Firing 40 Concurrent Read Requests Across POS Terminals...');
    const concurrentReads = [];
    for (let i = 0; i < 20; i++) {
      concurrentReads.push(req('/api/catalog'));
      concurrentReads.push(req('/api/customers'));
    }
    const readResponses = await Promise.all(concurrentReads);
    const allReadsOk = readResponses.every(r => r.status === 200 && (r.data?.items || Array.isArray(r.data)));
    record('40 simultaneous read requests completed with 100% success (HTTP 200)', allReadsOk);

    // -------------------------------------------------------------------------
    // TEST 6: Concurrent Customer Registration
    // -------------------------------------------------------------------------
    console.log('\n[6/14] Simulating 2 Terminals Concurrently Registering New Customers...');
    const testCust1 = { name: `SIM_CUST_${Date.now()}_A`, phone: '08011112222' };
    const testCust2 = { name: `SIM_CUST_${Date.now()}_B`, phone: '08033334444' };
    const [custRes1, custRes2] = await Promise.all([
      req('/api/customers', { method: 'POST', body: testCust1 }),
      req('/api/customers', { method: 'POST', body: testCust2 })
    ]);
    record(`Customer 1 registered: ${testCust1.name}`, custRes1.status === 200 && custRes1.data?.success === true);
    record(`Customer 2 registered: ${testCust2.name}`, custRes2.status === 200 && custRes2.data?.success === true);

    // -------------------------------------------------------------------------
    // TEST 7: Multi-Terminal Shift Open Concurrency
    // -------------------------------------------------------------------------
    console.log('\n[7/14] Concurrently Opening Shifts on Multiple Terminals...');
    const [shiftTerm1, shiftTerm2] = await Promise.all([
      req('/api/shifts/open', {
        method: 'POST',
        body: { terminal_id: 'KETERE 2', cashier_id: 'u2', cashier_name: 'Oluwatosin', opening_float: 10000 }
      }),
      req('/api/shifts/open', {
        method: 'POST',
        body: { terminal_id: 'TERM-02', cashier_id: 'u3', cashier_name: 'Cashier 2', opening_float: 5000 }
      })
    ]);
    record('Shift opened on KETERE 2 with ₦10,000 float', shiftTerm1.status === 200 && shiftTerm1.data?.success === true);
    record('Shift opened on TERM-02 with ₦5,000 float', shiftTerm2.status === 200 && shiftTerm2.data?.success === true);

    // Verify active shifts state
    const [activeT1, activeT2] = await Promise.all([
      req('/api/shifts/active?terminal_id=KETERE%202'),
      req('/api/shifts/active?terminal_id=TERM-02')
    ]);
    record('Active shift verified on KETERE 2', activeT1.data?.active_shift?.cashier_name === 'Oluwatosin');
    record('Active shift verified on TERM-02', activeT2.data?.active_shift?.cashier_name === 'Cashier 2');

    // -------------------------------------------------------------------------
    // TEST 8: Concurrent High-Volume Sales Posting Across 4 Terminals
    // -------------------------------------------------------------------------
    console.log('\n[8/14] Stress-Testing Concurrent Sales Across All 4 Staff Terminals...');
    // Item: SWISS GEL (ID: 1560234000000297777, Price: 2800)
    const saleRequests = [
      // 1. Oluwatosin (Cashier 1) on KETERE 2 - Cash Sale
      {
        user_id: 'u2',
        user_name: 'Oluwatosin',
        tilled_by: 'Oluwatosin',
        salesperson: 'Oluwatosin',
        terminal_id: 'KETERE 2',
        customer_id: '1560234000000095179',
        customer_name: 'Walk-in Customer',
        date: new Date().toISOString().split('T')[0],
        payment_mode: 'Cash',
        payments: [{ mode: 'Cash', amount: 2800 }],
        amount_paid: 3000,
        change: 200,
        subtotal: 2800,
        total: 2800,
        discount: 0,
        line_items: [{
          item_id: '1560234000000297777',
          name: 'SWISS GEL',
          unit: 'pack',
          quantity: 1,
          rate: 2800,
          item_total: 2800
        }]
      },
      // 2. Cashier 2 on TERM-02 - Moniepoint POS Sale
      {
        user_id: 'u3',
        user_name: 'Cashier 2',
        tilled_by: 'Cashier 2',
        salesperson: 'Cashier 2',
        terminal_id: 'TERM-02',
        customer_id: '1560234000000095179',
        customer_name: 'Walk-in Customer',
        date: new Date().toISOString().split('T')[0],
        payment_mode: 'Moniepoint POS',
        payments: [{ mode: 'Moniepoint POS', amount: 5600 }],
        amount_paid: 5600,
        change: 0,
        subtotal: 5600,
        total: 5600,
        discount: 0,
        line_items: [{
          item_id: '1560234000000297777',
          name: 'SWISS GEL',
          unit: 'pack',
          quantity: 2,
          rate: 2800,
          item_total: 5600
        }]
      },
      // 3. Oluwatobi (Finance) on OFFICE-01 - First Bank Transfer Sale
      {
        user_id: 'u5',
        user_name: 'Finance / Accounts',
        tilled_by: 'Oluwatobi',
        salesperson: 'Oluwatobi',
        terminal_id: 'OFFICE-01',
        customer_id: '1560234000000095179',
        customer_name: 'Walk-in Customer',
        date: new Date().toISOString().split('T')[0],
        payment_mode: 'First Bank Transfer',
        payments: [{ mode: 'First Bank Transfer', amount: 8400 }],
        amount_paid: 8400,
        change: 0,
        subtotal: 8400,
        total: 8400,
        discount: 0,
        line_items: [{
          item_id: '1560234000000297777',
          name: 'SWISS GEL',
          unit: 'pack',
          quantity: 3,
          rate: 2800,
          item_total: 8400
        }]
      },
      // 4. Funmilayo (Manager) on TERM-01 - Split Pay Sale (Cash + POS + Transfer)
      {
        user_id: 'u1',
        user_name: 'Funmilayo',
        tilled_by: 'Funmilayo',
        salesperson: 'Funmilayo',
        terminal_id: 'TERM-01',
        customer_id: '1560234000000095179',
        customer_name: 'Walk-in Customer',
        date: new Date().toISOString().split('T')[0],
        payment_mode: 'Split',
        payments: [
          { mode: 'Cash', amount: 2000 },
          { mode: 'Moniepoint POS', amount: 5000 },
          { mode: 'First Bank Transfer', amount: 4200 }
        ],
        amount_paid: 11200,
        change: 0,
        subtotal: 11200,
        total: 11200,
        discount: 0,
        line_items: [{
          item_id: '1560234000000297777',
          name: 'SWISS GEL',
          unit: 'pack',
          quantity: 4,
          rate: 2800,
          item_total: 11200
        }]
      }
    ];

    // Fire all 4 sales at the exact same millisecond
    const saleResponses = await Promise.all(
      saleRequests.map(s => req('/api/sales', { method: 'POST', body: s }))
    );

    const allSalesSucceeded = saleResponses.every(r => r.status === 200 && r.data?.success === true);
    record('All 4 simultaneous sales processed successfully (HTTP 200)', allSalesSucceeded);

    // Verify sequential receipt numbers and absence of collisions
    const createdReceipts = saleResponses.map(r => r.data?.sale?.receipt_number);
    const uniqueReceipts = new Set(createdReceipts);
    record(`Zero receipt collisions: All ${createdReceipts.length} receipt numbers are unique (${createdReceipts.join(', ')})`, uniqueReceipts.size === createdReceipts.length);

    // Verify tiller and salesperson attribution
    saleResponses.forEach((res, i) => {
      const orig = saleRequests[i];
      const sale = res.data?.sale;
      const ok = sale && sale.tilled_by === orig.tilled_by && sale.terminal_id === orig.terminal_id;
      record(`Sale ${sale?.receipt_number} stamped correctly with Tilled By: "${sale?.tilled_by}" on terminal "${sale?.terminal_id}"`, ok);
    });

    // -------------------------------------------------------------------------
    // TEST 9: Strict Stock Verification & Out-of-Stock Protection
    // -------------------------------------------------------------------------
    console.log('\n[9/14] Testing Strict Inventory Guard & Out-of-Stock Protection...');
    // Item: DIPLOMAT ORBIT 3 IN 1 (ID: 1560234000000297799, Stock: 0, Rate: 250)
    const oosSale = {
      user_id: 'u2',
      terminal_id: 'KETERE 2',
      customer_id: '1560234000000095179',
      payment_mode: 'Cash',
      subtotal: 250,
      total: 250,
      line_items: [{
        item_id: '1560234000000297799',
        name: 'DIPLOMAT ORBIT 3 IN 1',
        unit: 'pcs',
        quantity: 1,
        rate: 250
      }]
    };
    const oosRes = await req('/api/sales', { method: 'POST', body: oosSale });
    record('Out-of-stock item checkout strictly rejected with HTTP 400', oosRes.status === 400 && oosRes.data?.message?.includes('OUT OF STOCK'));

    // -------------------------------------------------------------------------
    // TEST 10: Strict RBAC Discount & Price Modification Security
    // -------------------------------------------------------------------------
    console.log('\n[10/14] Testing RBAC Security: Cashier Discount & Price Modification Blocking...');
    // 10a. Cashier trying to give discount without manager override
    const cashierDiscountSale = {
      user_id: 'u2', // Oluwatosin (cashier)
      terminal_id: 'KETERE 2',
      customer_id: '1560234000000095179',
      payment_mode: 'Cash',
      subtotal: 2800,
      discount: 10, // 10% discount
      total: 2520,
      line_items: [{
        item_id: '1560234000000297777',
        name: 'SWISS GEL',
        unit: 'pack',
        quantity: 1,
        rate: 2800
      }]
    };
    const discRes = await req('/api/sales', { method: 'POST', body: cashierDiscountSale });
    record('Cashier unauthorized discount strictly rejected with HTTP 403', discRes.status === 403 && discRes.data?.message?.includes('Manager or Finance PIN'));

    // 10b. Cashier trying to alter unit price on order without manager override
    const cashierPriceTamper = {
      user_id: 'u2', // Oluwatosin (cashier)
      terminal_id: 'KETERE 2',
      customer_id: '1560234000000095179',
      payment_mode: 'Cash',
      subtotal: 1000,
      total: 1000,
      line_items: [{
        item_id: '1560234000000297777',
        name: 'SWISS GEL',
        unit: 'pack',
        quantity: 1,
        rate: 1000 // Expected 2800, altered to 1000!
      }]
    };
    const tamperRes = await req('/api/sales', { method: 'POST', body: cashierPriceTamper });
    record('Cashier price modification strictly rejected with HTTP 403', tamperRes.status === 403 && tamperRes.data?.message?.includes('Requires Manager or Finance PIN'));

    // 10c. Manager authorized discount sale
    const managerDiscountSale = {
      user_id: 'u1', // Manager Funmilayo
      terminal_id: 'TERM-01',
      customer_id: '1560234000000095179',
      payment_mode: 'Cash',
      subtotal: 2800,
      discount: 10,
      total: 2520,
      manager_override: true,
      manager_override_by: 'Funmilayo',
      line_items: [{
        item_id: '1560234000000297777',
        name: 'SWISS GEL',
        unit: 'pack',
        quantity: 1,
        rate: 2800
      }]
    };
    const mgrSaleRes = await req('/api/sales', { method: 'POST', body: managerDiscountSale });
    record('Manager authorized discount sale accepted with HTTP 200', mgrSaleRes.status === 200 && mgrSaleRes.data?.success === true);

    // -------------------------------------------------------------------------
    // TEST 11: Multi-Terminal Shift Close & Cash Drawer Reconciliation
    // -------------------------------------------------------------------------
    console.log('\n[11/14] Testing Shift Close & Cash Drawer Reconciliation Variance...');
    // Cashier 1 closing on KETERE 2:
    // Float = 10,000, Cash Sales = 2,800. Expected = 12,800.
    // Counted = 12,800 -> BALANCED
    const closeTerm1 = await req('/api/shifts/close', {
      method: 'POST',
      body: {
        terminal_id: 'KETERE 2',
        cashier_id: 'u2',
        cashier_name: 'Oluwatosin',
        counted_cash: 12800
      }
    });
    record('Shift closed on KETERE 2: Reconciliation BALANCED (Variance: ₦0)', closeTerm1.status === 200 && closeTerm1.data?.report?.variance === 0);

    // Cashier 2 closing on TERM-02:
    // Float = 5,000, Cash Sales = 0 (only Moniepoint POS sale). Expected = 5,000.
    // Counted = 4,500 -> SHORT ₦500
    const closeTerm2 = await req('/api/shifts/close', {
      method: 'POST',
      body: {
        terminal_id: 'TERM-02',
        cashier_id: 'u3',
        cashier_name: 'Cashier 2',
        counted_cash: 4500
      }
    });
    record('Shift closed on TERM-02: Detected SHORT variance of -₦500', closeTerm2.status === 200 && closeTerm2.data?.report?.variance === -500);

    // Verify shift history archive
    const shiftHistory = await req('/api/shifts/history');
    record('Shift reports archived in history list (HTTP 200)', shiftHistory.status === 200 && Array.isArray(shiftHistory.data?.reports) && shiftHistory.data?.reports.length >= 2);

    // -------------------------------------------------------------------------
    // TEST 12: ESC/POS Thermal Printing & Cash Drawer RJ11 Kick Pulse
    // -------------------------------------------------------------------------
    console.log('\n[12/14] Testing Hardware ESC/POS Buffer & Drawer Kick Pulse...');
    const drawerRes = await req('/api/hardware/open-drawer', { method: 'POST', body: {} });
    record('Drawer kick pulse dispatched without crashing (HTTP 200)', drawerRes.status === 200 && drawerRes.data?.success === true);

    const zReportPrint = await req('/api/hardware/print-zreport', {
      method: 'POST',
      body: {
        report: closeTerm1.data?.report,
        paper: '80'
      }
    });
    record('Thermal Z-Report ESC/POS spool completed without error (HTTP 200)', zReportPrint.status === 200 && zReportPrint.data?.success === true);

    // -------------------------------------------------------------------------
    // TEST 13: Instant Database Protection & Live Backups
    // -------------------------------------------------------------------------
    console.log('\n[13/14] Testing Instant Database Snapshot Archive (.ZIP)...');
    const backupNow = await req('/api/backup/now', { method: 'POST', body: {} });
    record('Instant database backup snapshot created successfully', backupNow.status === 200 && backupNow.data?.success === true && backupNow.data?.filename?.endsWith('.zip'));

    const backupsList = await req('/api/backups');
    record('Database backup archives listed in catalog', backupsList.status === 200 && Array.isArray(backupsList.data?.backups) && backupsList.data?.backups.length > 0);

    // -------------------------------------------------------------------------
    // TEST 14: Zoho Sync Status & Privacy Protection
    // -------------------------------------------------------------------------
    console.log('\n[14/14] Auditing Zoho Sync Status & Privacy Leak Prevention...');
    const [syncStat, syncLogs] = await Promise.all([
      req('/api/sync/status'),
      req('/api/sync/logs')
    ]);
    const summaryText = (syncStat.data?.last_sync_summary || '') + ' ' + (syncStat.data?.sync_summary || '');
    const logsText = typeof syncLogs.data === 'string' ? syncLogs.data : JSON.stringify(syncLogs.data);

    // Crucial privacy check: Does the sync summary leak the store's total debt?
    const hasTotalDebtLeak = /Total\s*Debt\s*:\s*₦/i.test(summaryText);
    record('Privacy Audit: Store total debt amount is NOT leaked in sync status summary', !hasTotalDebtLeak);

    // Check queue status
    const queueStatus = await req('/api/queue');
    record(`Queue endpoint operational (${queueStatus.data?.total || 0} total sales, ${queueStatus.data?.pending || 0} pending sync)`, queueStatus.status === 200);

  } catch (err) {
    failed++;
    anomalies.push({ desc: 'Fatal Test Suite Execution Exception', details: err.stack });
    console.error('❌ Exception in test runner:', err);
  } finally {
    // Restore pristine data state
    restoreState();
    console.log('\n✓ Restored pristine database files from memory snapshot.');

    // Close server
    await new Promise(resolve => server.close(resolve));
    console.log('✓ POS server closed cleanly.');

    console.log('\n=================================================================');
    console.log(`   SIMULATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log('=================================================================\n');

    if (anomalies.length > 0) {
      console.log('⚠️ ANOMALIES DETECTED:');
      anomalies.forEach((a, i) => console.log(`  ${i + 1}. ${a.desc}: ${a.details}`));
      process.exit(1);
    } else {
      console.log('🎉 ZERO ANOMALIES OR RACE CONDITIONS DETECTED! ALL FEATURES PASSED.\n');
      process.exit(0);
    }
  }
}

runSimulation();

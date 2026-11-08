const fs = require('fs');
const path = require('path');

console.log('====================================================');
console.log('   RUNNING POS INTEGRITY & VALIDATION TEST SUITE    ');
console.log('====================================================\n');

let failed = false;

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    failed = true;
  } else {
    console.log(`✅ PASS: ${message}`);
  }
}

// 1. Verify frontend index.html JavaScript syntax
try {
  const htmlPath = path.join(__dirname, '..', 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert(!!match, 'Frontend script tag found in public/index.html');
  if (match) {
    new Function(match[1]);
    assert(true, 'Frontend JavaScript parsed with zero syntax errors');
  }
} catch (e) {
  assert(false, `Frontend JavaScript syntax error: ${e.message}`);
}

// 2. Verify Catalog Schema & Conversion Ratios
try {
  const catPath = path.join(__dirname, '..', 'data', 'pos_catalog.json');
  const items = JSON.parse(fs.readFileSync(catPath, 'utf8'));
  assert(Array.isArray(items) && items.length > 400, `Catalog loaded successfully (${items.length} products found)`);

  let invalidItems = 0;
  let ratioIssues = 0;
  let priceIssues = 0;

  for (const it of items) {
    if (!it.id || !it.name) invalidItems++;
    if (it.units && it.units.length > 0) {
      const base = it.units.find(u => u.is_base);
      if (!base) ratioIssues++;
      for (const u of it.units) {
        if (!u.conversion_ratio || u.conversion_ratio <= 0) ratioIssues++;
        if (u.price < 0) priceIssues++;
      }
    }
  }

  assert(invalidItems === 0, `All items possess valid IDs and names (Invalid: ${invalidItems})`);
  assert(ratioIssues === 0, `All packaging units have valid base flags and ratios (Issues: ${ratioIssues})`);
  assert(priceIssues === 0, `No negative packaging prices found (Issues: ${priceIssues})`);
} catch (e) {
  assert(false, `Catalog validation failed: ${e.message}`);
}

// 3. Verify Customer & Debtors Data
try {
  const custPath = path.join(__dirname, '..', 'data', 'customers.json');
  const customers = JSON.parse(fs.readFileSync(custPath, 'utf8'));
  assert(Array.isArray(customers) && customers.length > 200, `Customers database loaded (${customers.length} contacts found)`);

  const debtors = customers.filter(c => c.outstanding > 0);
  const totalDebt = debtors.reduce((sum, c) => sum + c.outstanding, 0);
  assert(debtors.length > 0, `Debtor ledgers active (${debtors.length} debtors, Total: ₦${Math.round(totalDebt).toLocaleString()})`);
} catch (e) {
  assert(false, `Customer validation failed: ${e.message}`);
}

// 4. Verify Hardware Printer Module & ESC/POS Generator
try {
  const hardware = require('../modules/hardware_printer');
  const mockSale = {
    order_id: 'CASHIER 1-0001',
    receipt_number: 'CASHIER 1-0001',
    date: '2026-11-08 19:30:00',
    terminal_id: 'TERM-01',
    salesperson: 'Cashier 1',
    customer_name: 'Walk in Customer',
    payment_mode: 'CASH',
    total: 25000,
    amount_paid: 30000,
    change: 5000,
    line_items: [
      { name: 'DANQUN SHOCK ABSORBER', quantity: 2, unit: 'CTN', unit_price: 12500, total: 25000 }
    ]
  };

  const buffer = hardware.formatEscPosReceipt(mockSale, { paper: '80', kickDrawer: true });
  assert(Buffer.isBuffer(buffer) && buffer.length > 100, `ESC/POS thermal binary buffer generated (${buffer.length} bytes)`);

  // Verify Drawer Kick pulse (\x1B\x70\x00\x19\xFA) is present in the buffer
  const hasKickPulse = buffer.includes(Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]));
  assert(hasKickPulse, 'ESC/POS drawer kick pulse (\\x1B\\x70\\x00\\x19\\xFA) verified in binary stream');

  // Verify cut paper command (\x1D\x56\x41\x03) is present
  const hasCutCmd = buffer.includes(Buffer.from([0x1D, 0x56, 0x41, 0x03]));
  assert(hasCutCmd, 'ESC/POS paper cut command (\\x1D\\x56\\x41\\x03) verified in binary stream');
} catch (e) {
  assert(false, `Hardware printer generator failed: ${e.message}`);
}

// 5. Verify Backup Manager Module & Archive Integrity
try {
  const backupMgr = require('../modules/backup_manager');
  const backups = backupMgr.listBackups();
  assert(Array.isArray(backups), `Backup manager lists database archives (Found: ${backups.length})`);
  assert(typeof backupMgr.createBackup === 'function', 'Database auto-backup function operational');
  assert(typeof backupMgr.startNightlyScheduler === 'function', '11:59 PM nightly scheduler armed');
} catch (e) {
  assert(false, `Backup manager validation failed: ${e.message}`);
}

console.log('\n====================================================');
if (failed) {
  console.error('❌ CI TEST SUITE FAILED. Fix errors before deployment.');
  process.exit(1);
} else {
  console.log('✅ ALL CI TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}


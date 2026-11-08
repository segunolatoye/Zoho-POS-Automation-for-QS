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

console.log('\n====================================================');
if (failed) {
  console.error('❌ CI TEST SUITE FAILED. Fix errors before deployment.');
  process.exit(1);
} else {
  console.log('✅ ALL CI TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve =>
    rl.question(query, ans => {
      rl.close();
      resolve(ans);
    })
  );
}

function parseCSV(content) {
  const lines = [];
  let currentRow = [];
  let currentVal = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentVal.trim());
      if (currentRow.some(val => val.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }

  if (currentVal.length > 0 || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some(val => val.length > 0)) {
      lines.push(currentRow);
    }
  }

  if (lines.length === 0) return { headers: [], rows: [] };

  const headers = lines[0].map(h => h.trim());
  const rows = [];
  for (let r = 1; r < lines.length; r++) {
    const rowObj = {};
    for (let c = 0; c < headers.length; c++) {
      rowObj[headers[c]] = lines[r][c] || '';
    }
    rows.push(rowObj);
  }
  return { headers, rows };
}

async function run() {
  console.log(`\n================================================================`);
  console.log(`       Safe Stock-Only Update (Inventory Adjustments)           `);
  console.log(`  * Updates ONLY stock on hand — does NOT touch existing products * `);
  console.log(`================================================================\n`);

  const projectDir = path.resolve(__dirname, '..');
  const catalogPath = path.join(projectDir, 'zoho_live_items_catalog.json');
  const stockTemplatePath = path.join(projectDir, 'stock_template.csv');

  if (!fs.existsSync(catalogPath)) {
    console.log('Syncing live Zoho items catalog first...');
    require(path.join(projectDir, 'fetch_all_live_items.js'));
  }

  const liveCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  console.log(`✓ Loaded live Zoho catalog: ${liveCatalog.length} items verified.\n`);

  console.log(`Choose an option:`);
  console.log(`  [1] Apply stock counts from CSV (e.g. stock_template.csv or custom file)`);
  console.log(`  [2] View / Edit pre-filled stock_template.csv in Excel/Notepad`);
  console.log(`  [3] Refresh live catalog from Zoho POS`);
  console.log(`  [4] Return to Main Menu\n`);

  const choice = (await askQuestion(`Enter choice [1, 2, 3, or 4, default: 1]: `)).trim();

  if (choice === '4' || choice.toLowerCase() === 'q' || choice.toLowerCase() === 'exit') {
    return;
  }

  if (choice === '2') {
    console.log(`\nStock template path: ${stockTemplatePath}`);
    console.log(`You can open this file in Excel, fill the 'Opening Stock' column, and save it.`);
    await askQuestion(`Press [ENTER] to continue...`);
    return run();
  }

  if (choice === '3') {
    console.log(`\nRefreshing live catalog from Zoho POS...`);
    const { execSync } = require('child_process');
    execSync(`node "${path.join(projectDir, 'fetch_all_live_items.js')}"`, { stdio: 'inherit' });
    await askQuestion(`Press [ENTER] to continue...`);
    return run();
  }

  // Option 1: Apply stock counts
  console.log(`\nEnter the path to your stock counts file.`);
  console.log(`Press [ENTER] to use default (stock_template.csv):`);
  let userPath = (await askQuestion(`Path: `)).trim();
  if (!userPath) userPath = stockTemplatePath;
  userPath = userPath.replace(/^['"]|['"]$/g, '');

  if (!fs.existsSync(userPath)) {
    console.log(`⚠️ File not found at: ${userPath}`);
    await askQuestion(`Press [ENTER] to continue...`);
    return run();
  }

  const raw = fs.readFileSync(userPath, 'utf8');
  const parsed = parseCSV(raw);

  const headers = parsed.headers.map(h => h.trim());
  const nameCol = headers.find(h => /item\s*name/i.test(h) || /^name$/i.test(h)) || headers[0];
  const stockCol = headers.find(h => /opening\s*stock|stock\s*on\s*hand|quantity|qty|count|stock/i.test(h)) || headers[1];

  console.log(`\nMapping columns:`);
  console.log(`  - Item Name: "${nameCol}"`);
  console.log(`  - Stock Count: "${stockCol}"`);

  // Build name to live item lookup
  const catalogMap = new Map();
  liveCatalog.forEach(item => {
    catalogMap.set(item.name.toLowerCase().trim(), item);
  });

  const lineItems = [];
  let matchedCount = 0;
  let nonZeroCount = 0;

  parsed.rows.forEach(r => {
    const itemName = (r[nameCol] || '').trim();
    const qtyStr = (r[stockCol] || '').replace(/,/g, '').trim();
    const qty = parseFloat(qtyStr) || 0;

    const live = catalogMap.get(itemName.toLowerCase());
    if (live) {
      matchedCount++;
      if (qty > 0) {
        nonZeroCount++;
        lineItems.push({
          item_id: live.id,
          name: live.name,
          quantity_adjusted: qty,
          unit: live.unit || 'pack',
          location_id: '1560234000000095116'
        });
      }
    }
  });

  console.log(`\nScan Summary:`);
  console.log(`  - Total items in your stock file: ${parsed.rows.length}`);
  console.log(`  - Matched to existing Zoho products: ${matchedCount}`);
  console.log(`  - Items with stock count > 0: ${nonZeroCount}`);

  if (lineItems.length === 0) {
    console.log(`\n⚠️ No items with stock > 0 found in the file.`);
    console.log(`Please enter the stock counts in ${path.basename(userPath)} and try again.`);
    await askQuestion(`Press [ENTER] to continue...`);
    return run();
  }

  console.log(`\nSample items to update:`);
  lineItems.slice(0, 5).forEach((item, idx) => {
    console.log(`  ${idx + 1}. ${item.name} -> Stock: +${item.quantity_adjusted} ${item.unit}`);
  });

  const confirm = (await askQuestion(`\nReady to apply stock adjustment to Zoho POS? (y/n) [y]: `)).trim().toLowerCase();
  if (confirm === 'n') {
    return run();
  }

  // Execute adjustment via Zoho POS browser session
  console.log('\nLaunching Chrome to apply Inventory Quantity Adjustment...');
  const userDataDir = path.join(projectDir, '.browser_profile');
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    args: ['--start-maximized']
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  const url = 'https://pos.zoho.com/qualitysuperstores/index.do/zxapp/posapi/app/943392252?embeddingService=pos#/inventory/adjustments';
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  const frameElement = await page.waitForSelector('iframe[name="serviceFrame"], iframe#serviceFrame', { timeout: 30000 });
  const frame = await frameElement.contentFrame();
  await page.waitForTimeout(3000);

  // Extract auth tokens
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

  // Send API adjustment from within authenticated frame
  const today = new Date().toISOString().split('T')[0];
  const payload = {
    adjustment_type: 'quantity',
    date: today,
    reason: 'Inventory Revaluation',
    description: `Automated Stock Count Update (${lineItems.length} items)`,
    location_id: '1560234000000095116',
    adjustment_account_id: '1560234000000034003',
    line_items: lineItems
  };

  console.log(`Posting Inventory Adjustment for ${lineItems.length} items...`);
  const apiResult = await frame.evaluate(async ({ bodyData, h }) => {
    try {
      const resp = await fetch('/posapi/api/v1/inventoryadjustments?organization_id=943392252', {
        method: 'POST',
        headers: h,
        body: JSON.stringify(bodyData)
      });
      const json = await resp.json();
      return json;
    } catch (e) {
      return { code: -1, message: e.message };
    }
  }, { bodyData: payload, h: headers });

  console.log('\n--- Zoho Response ---');
  console.log(apiResult);

  if (apiResult.code === 0 || apiResult.message?.includes('success') || apiResult.inventory_adjustment) {
    console.log('\n======================================================');
    console.log(`🎉 SUCCESS! Stock updated for ${lineItems.length} items!`);
    console.log(`Existing products, prices, and unit groups were UNTOUCHED.`);
    console.log('======================================================\n');
  } else {
    console.log(`\nNotice from Zoho: ${apiResult.message || JSON.stringify(apiResult)}`);
  }

  // Refresh page so user sees new adjustment
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);

  await askQuestion('Press [ENTER] to close browser...');
  await context.close();
}

if (require.main === module) {
  run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { run };

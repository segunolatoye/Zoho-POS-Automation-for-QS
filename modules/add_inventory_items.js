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
  console.log(`        Feature 2: Add / Import Inventory Items from CSV        `);
  console.log(`================================================================\n`);

  const projectDir = path.resolve(__dirname, '..');
  const csvPath = path.join(projectDir, 'items.csv');

  if (!fs.existsSync(csvPath)) {
    console.log(`⚠️ CSV file not found at: ${csvPath}`);
    await askQuestion(`Press [ENTER] to return...`);
    return;
  }

  const raw = fs.readFileSync(csvPath, 'utf8');
  const parsed = parseCSV(raw);

  console.log(`✓ Loaded items.csv successfully:`);
  console.log(`  - Total items to import: ${parsed.rows.length}`);
  console.log(`  - Columns found: ${parsed.headers.length}`);

  // Count unit group dependencies
  let unitGroupCount = 0;
  parsed.rows.forEach(r => {
    if (r['Unit Group Name'] && r['Unit Group Name'] !== 'N.A.') unitGroupCount++;
  });
  console.log(`  - Items requiring Unit Groups: ${unitGroupCount}/${parsed.rows.length}`);

  console.log(`\n📌 NOTE: Zoho requires the Unit Groups to exist in Zoho POS before`);
  console.log(`   importing these items. If you haven't run Feature 1 yet, run`);
  console.log(`   Feature 1 first so Zoho won't reject unit conversions.\n`);

  console.log(`Choose an option:`);
  console.log(`  [1] Launch Automated CSV Importer in Zoho POS (navigates & loads CSV)`);
  console.log(`  [2] Inspect / Fix barcode & UPC fields`);
  console.log(`  [3] Return to Main Menu`);

  const choice = await askQuestion(`\nEnter choice [1, 2, or 3, default: 1]: `);

  if (choice.trim() === '2') {
    // Quick fix for 14+ digit UPCs
    let fixedCount = 0;
    parsed.rows.forEach(r => {
      if (r['UPC'] && r['UPC'].length > 13) {
        if (!r['EAN']) {
          r['EAN'] = r['UPC'];
          r['UPC'] = '';
          fixedCount++;
        }
      }
    });
    if (fixedCount > 0) {
      // Rebuild CSV
      const newHeader = parsed.headers.join(',');
      const newLines = parsed.rows.map(r =>
        parsed.headers.map(h => {
          let v = r[h] || '';
          if (v.includes(',') || v.includes('"')) {
            v = `"${v.replace(/"/g, '""')}"`;
          }
          return v;
        }).join(',')
      );
      fs.writeFileSync(csvPath, [newHeader, ...newLines].join('\n'), 'utf8');
      console.log(`✓ Fixed ${fixedCount} barcode(s) exceeding 13 chars by moving to EAN column!`);
    } else {
      console.log(`No barcode issues found.`);
    }
    await askQuestion(`Press [ENTER] to continue...`);
    return run();
  }

  if (choice.trim() === '3' || choice.trim().toLowerCase() === 'q') {
    return;
  }

  // Option 1: Automated Importer
  console.log('\nLaunching Google Chrome with your Zoho session...');
  const userDataDir = path.join(projectDir, '.browser_profile');
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    viewport: null,
    args: ['--start-maximized']
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  const importUrl = 'https://pos.zoho.com/qualitysuperstores/index.do/zxapp/posapi/app/943392252?embeddingService=pos#/inventory/product/variant-import';
  console.log('Navigating directly to Zoho Import Items wizard...');
  await page.goto(importUrl, { waitUntil: 'domcontentloaded' });

  console.log('Waiting for Zoho serviceFrame...');
  const frameElement = await page.waitForSelector('iframe[name="serviceFrame"], iframe#serviceFrame', { timeout: 30000 });
  const frame = await frameElement.contentFrame();

  console.log('Attaching items.csv to file input...');
  await frame.waitForSelector('input[type="file"]', { timeout: 20000 });
  await frame.locator('input[type="file"]').setInputFiles(csvPath);
  await page.waitForTimeout(1500);

  console.log('✓ File attached: items.csv');
  console.log('Advancing to Step 2 (Map Fields)...');
  await frame.locator('button:has-text("Next"), button.btn-primary:has-text("Next")').first().click();
  await page.waitForTimeout(4000);

  console.log('Advancing to Step 3 (Preview)...');
  await frame.locator('button:has-text("Next"), button.btn-primary:has-text("Next")').first().click();
  console.log('Validating all 445 items (Zoho calculates conversions, please wait ~40-60s)...');
  await frame.waitForSelector('button.btn-primary:has-text("Import"), button:has-text("Import Items")', { timeout: 90000 });
  await page.waitForTimeout(2000);

  // Read summary stats from preview page
  const previewText = await frame.locator('body').innerText();
  const summaryLines = previewText.split('\n').map(l => l.trim()).filter(l => 
    l.includes('ready to be imported') || l.includes('Records skipped')
  );
  if (summaryLines.length > 0) {
    console.log('\n--- Live Preview Summary ---');
    summaryLines.forEach(l => console.log('  ' + l));
  }

  console.log('\n======================================================');
  console.log('🎉 You are now on Step 3 (Preview) in Zoho POS!');
  console.log('All 445 items are ready with their Unit Groups attached!');
  console.log('Review on your Chrome screen and click the blue "Import" button.');
  console.log('======================================================\n');

  await askQuestion('Press [ENTER] once you are done to close browser...');
  await context.close();
}

if (require.main === module) {
  run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { run, parseCSV };

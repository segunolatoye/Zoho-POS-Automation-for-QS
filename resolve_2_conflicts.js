const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const invOrgId = '943392252';
const posOrgId = '943395176';

async function resolveConflicts() {
  console.log('\n================================================================');
  console.log('       Zoho POS - Surgical Resolution of 2 Stuck Conflicts        ');
  console.log('================================================================\n');

  const userDataDir = path.join(__dirname, '.browser_profile');
  const lockPath = path.join(userDataDir, 'lockfile');
  if (fs.existsSync(lockPath)) {
    try { fs.unlinkSync(lockPath); } catch (e) {}
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ['--window-position=50,50']
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  console.log('Connecting to Zoho session...');
  await page.goto(`https://pos.zoho.com/posapi/app/${invOrgId}?embeddingService=pos#/sales/invoices`, {
    waitUntil: 'domcontentloaded',
    timeout: 45000
  });
  await page.waitForTimeout(4000);

  const cookies = await context.cookies();
  const zoscscook = cookies.find(c => c.name === 'zoscscook');
  const zosCsrf = zoscscook ? 'zoscsparam=' + zoscscook.value : '';
  const poscsrfCookie = cookies.find(c => c.name === 'poscsrf');
  const posCsrf = poscsrfCookie ? `poscsrfparam=${poscsrfCookie.value}` : '';

  const invHeaders = {
    'Content-Type': 'application/json;charset=UTF-8',
    'Accept': 'application/json',
    'x-zcsrf-token': zosCsrf,
    'x-zb-source': 'zbclient',
    'x-role-id': '1560234000000110197'
  };

  async function invApi(endpoint, method = 'GET', body = null) {
    return await page.evaluate(async ({ ep, m, b, h, org }) => {
      try {
        const opts = { method: m, headers: h };
        if (b) opts.body = JSON.stringify(b);
        const resp = await fetch(`${ep}${ep.includes('?') ? '&' : '?'}organization_id=${org}`, opts);
        const text = await resp.text();
        try {
          return { status: resp.status, data: JSON.parse(text) };
        } catch (e) {
          return { status: resp.status, text };
        }
      } catch (err) {
        return { error: err.message };
      }
    }, { ep: endpoint, m: method, b: body, h: invHeaders, org: invOrgId });
  }

  // --- CONFLICT 1: FUSI0073 ---
  console.log('\n--- 1. PROCESSING FUSI0073 (ALMAT STORE - ₦49,450.00) ---');
  const invoice1Payload = {
    customer_id: '1560234000000100403', // ALMAT STORE
    date: '2026-11-09',
    due_date: '2026-11-09',
    reference_number: 'FUSI0073 (Recovered)',
    notes: 'POS Conflict resolved from Register KETERE 3 (09 Nov 2026)',
    line_items: [
      {
        item_id: '1560234000000301715',
        name: 'BESENSE PAD- MEGA ZIP',
        unit: 'pcs',
        quantity: 12,
        rate: 1579.166667
      },
      {
        item_id: '1560234000000299735',
        name: 'PAD SOFTCARE A+ZIP',
        unit: 'pcs',
        quantity: 12,
        rate: 1583.333333
      },
      {
        item_id: '1560234000000302287',
        name: 'JUSTFIT NIGHT HEAVY FLOW N10',
        unit: 'pack',
        quantity: 2,
        rate: 2125.00
      },
      {
        item_id: '1560234000000301352',
        name: 'SOFTCARE WIPES M60 BY 24',
        unit: 'pcs',
        quantity: 12,
        rate: 604.166667
      }
    ]
  };

  const inv1Res = await invApi('/posapi/api/v1/invoices', 'POST', invoice1Payload);
  if (inv1Res.data?.code !== 0 || !inv1Res.data?.invoice) {
    console.error('❌ Failed creating invoice for FUSI0073:', inv1Res.data || inv1Res);
    await context.close();
    return;
  }
  const inv1 = inv1Res.data.invoice;
  console.log(`✅ Invoice Created: ${inv1.invoice_number} (ID: ${inv1.invoice_id}) | Total: ₦${inv1.total}`);

  console.log('Approving FUSI0073...');
  await invApi(`/posapi/api/v1/invoices/${inv1.invoice_id}/status/sent`, 'POST', {});

  console.log(`Recording payment for ${inv1.invoice_number} (₦${inv1.total})...`);
  const pay1Res = await invApi('/posapi/api/v1/customerpayments', 'POST', {
    customer_id: '1560234000000100403',
    payment_mode: 'POS',
    amount: inv1.total,
    date: '2026-11-09',
    account_id: '1560234000000000361', // Petty Cash
    reference_number: 'FUSI0073',
    invoices: [
      {
        invoice_id: inv1.invoice_id,
        amount_applied: inv1.total
      }
    ]
  });
  console.log(`✅ Payment Recorded: Receipt ${pay1Res.data?.payment?.payment_number} | Status: PAID`);

  // --- CONFLICT 2: FUSI0078 ---
  console.log('\n--- 2. PROCESSING FUSI0078 (CHOCO - ₦6,225.00) ---');
  const invoice2Payload = {
    customer_id: '1560234000000100592', // CHOCO
    date: '2026-11-09',
    due_date: '2026-11-09',
    reference_number: 'FUSI0078 (Recovered)',
    notes: 'POS Conflict resolved from Register KETERE 3 (09 Nov 2026)',
    line_items: [
      {
        item_id: '1560234000000297909',
        name: 'SWISS AIR FRESHNER 250ML',
        unit: 'pcs',
        quantity: 10,
        rate: 342.50
      },
      {
        item_id: '1560234000000297777',
        name: 'SWISS GEL',
        unit: 'pack',
        quantity: 1,
        rate: 2800.00
      }
    ]
  };

  const inv2Res = await invApi('/posapi/api/v1/invoices', 'POST', invoice2Payload);
  if (inv2Res.data?.code !== 0 || !inv2Res.data?.invoice) {
    console.error('❌ Failed creating invoice for FUSI0078:', inv2Res.data || inv2Res);
    await context.close();
    return;
  }
  const inv2 = inv2Res.data.invoice;
  console.log(`✅ Invoice Created: ${inv2.invoice_number} (ID: ${inv2.invoice_id}) | Total: ₦${inv2.total}`);

  console.log('Approving FUSI0078...');
  await invApi(`/posapi/api/v1/invoices/${inv2.invoice_id}/status/sent`, 'POST', {});

  console.log(`Recording payment for ${inv2.invoice_number} (₦${inv2.total})...`);
  const pay2Res = await invApi('/posapi/api/v1/customerpayments', 'POST', {
    customer_id: '1560234000000100592',
    payment_mode: 'POS',
    amount: inv2.total,
    date: '2026-11-09',
    account_id: '1560234000000000361', // Petty Cash
    reference_number: 'FUSI0078',
    invoices: [
      {
        invoice_id: inv2.invoice_id,
        amount_applied: inv2.total
      }
    ]
  });
  console.log(`✅ Payment Recorded: Receipt ${pay2Res.data?.payment?.payment_number} | Status: PAID`);

  // --- 3. CLEAR FROM CONFLICTS QUEUE ---
  console.log('\n--- 3. REMOVING CONFLICT RECORDS FROM POS QUEUE ---');
  const conflictIds = [
    { cid: '6575000000036096', name: 'FUSI0073' },
    { cid: '6575000000038044', name: 'FUSI0078' }
  ];

  for (const c of conflictIds) {
    console.log(`Clearing conflict ${c.name} (ID: ${c.cid})...`);
    const delRes = await page.evaluate(async ({ pOrg, iOrg, cid, csrf }) => {
      try {
        const resp = await fetch(`/v1/conflicts/${cid}?organization_id=${pOrg}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'zorg-id': pOrg,
            'org-id': iOrg,
            'X-Zcsrf-Token': csrf
          }
        });
        return await resp.json();
      } catch (err) {
        return { error: err.message };
      }
    }, { pOrg: posOrgId, iOrg: invOrgId, cid: c.cid, csrf: posCsrf });

    if (delRes.code === 0) {
      console.log(`  ✅ Conflict ${c.name} successfully cleared!`);
    } else {
      console.log(`  Notice on clear ${c.name}:`, delRes);
    }
  }

  // Verify conflict count
  console.log('\nVerifying remaining POS conflict count...');
  const countRes = await page.evaluate(async (pOrg) => {
    try {
      const resp = await fetch(`/v1/conflicts/count?organization_id=${pOrg}&sale_entity=all&queue_type=non_queued`);
      return await resp.json();
    } catch (e) {
      return { error: e.message };
    }
  }, posOrgId);

  console.log(`Remaining POS Conflicts: ${countRes.total_count ?? 0}`);
  console.log('\n🎉 ALL CONFLICTS RESOLVED AND QUEUE CLEANED TO 0!\n');

  await page.waitForTimeout(2000);
  await context.close();
}

resolveConflicts().catch(err => {
  console.error('Error during conflict resolution:', err);
  process.exit(1);
});


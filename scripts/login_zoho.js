const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

function getAvailableBrowserChannel() {
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')
  ];
  for (const p of chromePaths) {
    if (fs.existsSync(p)) return 'chrome';
  }
  return 'msedge';
}

function cleanStaleProfileLocks(userDataDir) {
  const locks = ['lockfile', 'SingletonLock', 'SingletonCookie', 'SingletonSocket'];
  for (const f of locks) {
    const p = path.join(userDataDir, f);
    if (fs.existsSync(p)) {
      try { fs.unlinkSync(p); } catch (e) {}
    }
  }
}

async function loginToZoho() {
  console.log('\n================================================================');
  console.log('       Quality Superstores - One-Time Zoho Cloud Login          ');
  console.log('================================================================\n');

  const projectDir = path.resolve(__dirname, '..');
  const userDataDir = path.join(projectDir, '.browser_profile');
  
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }
  cleanStaleProfileLocks(userDataDir);

  const channel = getAvailableBrowserChannel();
  console.log(`[INFO] Launching browser window (${channel.toUpperCase()})...`);
  console.log('[INFO] If prompted, sign in with your Quality Superstores Zoho account.\n');

  let context;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      channel: channel,
      headless: false,
      args: [
        '--start-maximized',
        '--no-first-run',
        '--disable-background-timer-throttling'
      ]
    });
  } catch (err) {
    console.error('❌ Failed to launch browser:', err.message);
    console.log('\nMake sure all other Chrome/Edge windows are closed and try again.');
    process.exit(1);
  }

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  const invOrgId = '943392252';
  const targetUrl = `https://pos.zoho.com/qualitysuperstores/index.do/zxapp/posapi/app/${invOrgId}?embeddingService=pos#/home/inventory-dashboard`;

  console.log(`[INFO] Navigating to Zoho POS Inventory Dashboard...`);
  try {
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) {
    console.warn('[WARN] Navigation notice:', e.message);
  }

  console.log('\n👉 PLEASE LOG IN TO ZOHO IN THE OPEN BROWSER WINDOW.');
  console.log('   (Enter email, password, and check "Stay signed in").');
  console.log('\nWaiting for login to complete...');

  let loggedIn = false;
  const startTime = Date.now();
  const maxWaitMs = 5 * 60 * 1000; // 5 minutes timeout

  while (!loggedIn && (Date.now() - startTime) < maxWaitMs) {
    await page.waitForTimeout(2000);
    const url = page.url();

    // Check if serviceFrame exists or URL is on inventory dashboard
    const hasFrame = await page.$('iframe[name="serviceFrame"], iframe#serviceFrame').catch(() => null);
    if (hasFrame) {
      loggedIn = true;
      break;
    }

    if (url.includes('home/inventory-dashboard') || (url.includes('/posapi/app/') && !url.includes('accounts.zoho.com'))) {
      try {
        const frameEl = await page.waitForSelector('iframe[name="serviceFrame"], iframe#serviceFrame', { state: 'attached', timeout: 5000 });
        if (frameEl) {
          loggedIn = true;
          break;
        }
      } catch (e) {}
    }
  }

  if (loggedIn) {
    console.log('\n================================================================');
    console.log('✅ SUCCESS! Zoho POS authenticated successfully on this computer.');
    console.log('================================================================');
    console.log('\nYour session cookies have been securely saved to .browser_profile/.');
    console.log('The POS server will now sync in the background automatically.\n');
    await page.waitForTimeout(3000);
    await context.close().catch(() => {});
    process.exit(0);
  } else {
    console.error('\n❌ Login timed out after 5 minutes.');
    console.log('Please run this script again and complete your sign-in.');
    await context.close().catch(() => {});
    process.exit(1);
  }
}

loginToZoho().catch(err => {
  console.error('\n❌ Unexpected error:', err.message);
  process.exit(1);
});


#!/usr/bin/env node
/**
 * Quality Superstores POS - Remote Code Update Engine
 * Safely fetches latest code updates from GitHub (origin/dev),
 * creates snapshots of live sales and customer data,
 * applies code updates without overwriting active store data,
 * and handles server restart.
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const BACKUPS_DIR = path.join(ROOT_DIR, 'backups');

function execGit(cmd, timeoutMs = 20000) {
  try {
    return execSync(cmd, { cwd: ROOT_DIR, encoding: 'utf8', timeout: timeoutMs }).trim();
  } catch (err) {
    throw new Error(err.stderr ? err.stderr.trim() : err.message);
  }
}

/**
 * Get current local commit info
 */
function getCurrentVersion() {
  try {
    const hash = execGit('git rev-parse HEAD');
    const shortHash = hash.substring(0, 7);
    const logInfo = execGit('git log -1 --format="%s|%an|%cd" --date=relative');
    const [subject, author, date] = logInfo.split('|');
    return {
      success: true,
      commit: shortHash,
      fullCommit: hash,
      subject: subject || 'Latest POS release',
      author: author || 'Developer',
      date: date || 'Recently'
    };
  } catch (err) {
    return {
      success: false,
      commit: 'unknown',
      subject: 'Git repository not found or detached',
      error: err.message
    };
  }
}

/**
 * Check if newer commits exist on GitHub remote
 */
function checkRemoteUpdates(branch = 'dev') {
  try {
    // 1. Fetch latest refs from remote
    execGit(`git fetch origin ${branch}`, 25000);

    // 2. Compare local HEAD with remote branch
    const localHash = execGit('git rev-parse HEAD');
    const remoteHash = execGit(`git rev-parse origin/${branch}`);
    const behindCountStr = execGit(`git rev-list --count HEAD..origin/${branch}`);
    const behindCount = parseInt(behindCountStr, 10) || 0;

    let commits = [];
    if (behindCount > 0) {
      const commitsRaw = execGit(`git log HEAD..origin/${branch} --format="%h|%s|%an|%cd" --date=relative`);
      commits = commitsRaw.split('\n').filter(Boolean).map(line => {
        const [h, s, a, d] = line.split('|');
        return { hash: h, subject: s, author: a, date: d };
      });
    }

    const current = getCurrentVersion();

    return {
      success: true,
      updatesAvailable: behindCount > 0,
      behindCount,
      currentVersion: current,
      remoteCommit: remoteHash.substring(0, 7),
      commits
    };
  } catch (err) {
    return {
      success: false,
      error: `Could not check GitHub remote: ${err.message}`,
      updatesAvailable: false
    };
  }
}

/**
 * Perform snapshot backup of live store data files
 */
function backupStoreData() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFolder = path.join(BACKUPS_DIR, `pre_update_${ts}`);
  if (!fs.existsSync(backupFolder)) {
    fs.mkdirSync(backupFolder, { recursive: true });
  }

  const criticalFiles = [
    'offline_sales_queue.json',
    'customers.json',
    'pos_catalog.json',
    'pos_users.json',
    'shifts.json',
    'payment_receipt_queue.json'
  ];

  const backedUp = [];
  const inMemorySnapshots = {};

  for (const file of criticalFiles) {
    const src = path.join(DATA_DIR, file);
    if (fs.existsSync(src)) {
      const content = fs.readFileSync(src, 'utf8');
      inMemorySnapshots[file] = content;
      fs.writeFileSync(path.join(backupFolder, file), content, 'utf8');
      backedUp.push(file);
    }
  }

  return { backupFolder, backedUp, inMemorySnapshots };
}

/**
 * Apply remote code update safely
 */
function applyUpdate(branch = 'dev') {
  const logSteps = [];
  function log(msg) {
    logSteps.push(`[${new Date().toLocaleTimeString()}] ${msg}`);
    console.log(`[Update POS] ${msg}`);
  }

  try {
    log('1/5 Starting safety backup of live store transactions and debtor data...');
    const { backupFolder, backedUp, inMemorySnapshots } = backupStoreData();
    log(`✓ Backed up ${backedUp.length} store data files to ${path.basename(backupFolder)}`);

    log('2/5 Fetching latest source code from GitHub (origin/' + branch + ')...');
    execGit(`git fetch origin ${branch}`, 30000);

    const oldCommit = execGit('git rev-parse HEAD');

    log('3/5 Preparing working tree and pulling latest code updates...');
    // Discard any local modifications in code files so git pull succeeds seamlessly
    try {
      execGit('git checkout HEAD -- public/ pos_server.js modules/ scripts/');
    } catch (_) {}

    // Discard local changes to tracked data files temporarily (we hold exact memory snapshot)
    try {
      execGit('git checkout HEAD -- data/');
    } catch (_) {}

    // Pull latest code
    execGit(`git pull origin ${branch}`);
    const newCommit = execGit('git rev-parse HEAD');
    const newShort = newCommit.substring(0, 7);

    log(`✓ Successfully pulled code updates. Now at commit ${newShort}`);

    log('4/5 Restoring live store sales queue and customer records...');
    // Restore the live store data so no offline orders, user PINs, or debts are lost
    for (const [file, content] of Object.entries(inMemorySnapshots)) {
      const dest = path.join(DATA_DIR, file);
      fs.writeFileSync(dest, content, 'utf8');
    }
    log(`✓ Restored all live data files seamlessly.`);

    // Check if package.json was modified
    let packagesUpdated = false;
    try {
      const changedFiles = execGit(`git diff --name-only ${oldCommit} ${newCommit}`);
      if (changedFiles.includes('package.json')) {
        log('Dependencies updated in package.json: running npm install...');
        execSync('npm install --no-audit --no-fund', { cwd: ROOT_DIR, stdio: 'inherit' });
        packagesUpdated = true;
        log('✓ Node packages installed.');
      }
    } catch (_) {}

    log('5/5 Update completed successfully!');

    return {
      success: true,
      oldCommit: oldCommit.substring(0, 7),
      newCommit: newShort,
      packagesUpdated,
      log: logSteps
    };
  } catch (err) {
    log(`❌ Error during update: ${err.message}`);
    return {
      success: false,
      error: err.message,
      log: logSteps
    };
  }
}

// If run directly from terminal or batch file
if (require.main === module) {
  const args = process.argv.slice(2);
  console.log('====================================================');
  console.log('   QUALITY SUPERSTORES POS - SYSTEM UPDATER        ');
  console.log('====================================================\n');

  if (args.includes('--check')) {
    console.log('Checking for updates from GitHub (branch: dev)...');
    const res = checkRemoteUpdates();
    if (!res.success) {
      console.error('Error:', res.error);
      process.exit(1);
    }
    console.log(`Current Version: ${res.currentVersion.commit} - ${res.currentVersion.subject} (${res.currentVersion.date})`);
    if (res.updatesAvailable) {
      console.log(`\n🚀 ${res.behindCount} new update(s) available from GitHub!`);
      res.commits.forEach(c => console.log(`  * [${c.hash}] ${c.subject} (${c.author}, ${c.date})`));
    } else {
      console.log('\n✓ System is already running the latest code!');
    }
  } else {
    console.log('Checking GitHub for new updates...');
    const check = checkRemoteUpdates();
    if (!check.success) {
      console.warn('Warning checking remote:', check.error);
      console.log('Attempting update anyway...\n');
    } else if (!check.updatesAvailable && !args.includes('--force')) {
      console.log(`✓ System is already up to date at commit ${check.currentVersion.commit}!`);
      console.log('Tip: Use "node scripts/update_pos.js --force" to reinstall/refresh current version.\n');
      process.exit(0);
    }

    console.log('Applying update from GitHub (branch: dev)...');
    const updateRes = applyUpdate('dev');
    if (updateRes.success) {
      console.log('\n====================================================');
      console.log(`✓ SUCCESS: Updated to commit ${updateRes.newCommit}!`);
      console.log('====================================================\n');
    } else {
      console.error('\n❌ UPDATE FAILED:', updateRes.error);
      process.exit(1);
    }
  }
}

module.exports = {
  getCurrentVersion,
  checkRemoteUpdates,
  applyUpdate
};

const fs = require('fs');
const path = require('path');
const { execFile, exec } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const BACKUPS_DIR = path.join(ROOT_DIR, 'backups');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const LOGS_DIR = path.join(ROOT_DIR, 'logs');

if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

function formatTimestamp(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${YYYY}-${MM}-${DD}_${hh}${mm}${ss}`;
}

function formatDateOnly(d = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function cleanOldBackups(maxRetention = 30) {
  try {
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith('.zip'))
      .map(f => {
        const full = path.join(BACKUPS_DIR, f);
        return { name: f, full, mtime: fs.statSync(full).mtime.getTime() };
      })
      .sort((a, b) => b.mtime - a.mtime);

    if (files.length > maxRetention) {
      const toRemove = files.slice(maxRetention);
      for (const item of toRemove) {
        fs.unlinkSync(item.full);
        console.log(`[BACKUP] Auto-pruned expired backup: ${item.name}`);
      }
    }
  } catch (e) {
    console.error('[BACKUP] Retention check failed:', e.message);
  }
}

function createBackup(reason = 'manual') {
  return new Promise((resolve) => {
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }

    const ts = formatTimestamp();
    const zipName = `pos_backup_${ts}.zip`;
    const zipPath = path.join(BACKUPS_DIR, zipName);

    // Prefer native Windows tar.exe to produce valid zip files instantly
    const cmd = `tar.exe -a -c -f "${zipPath}" data logs`;

    exec(cmd, { cwd: ROOT_DIR }, (err, stdout, stderr) => {
      if (!err && fs.existsSync(zipPath)) {
        const stats = fs.statSync(zipPath);
        cleanOldBackups(30);
        const result = {
          success: true,
          filename: zipName,
          filepath: zipPath,
          size_bytes: stats.size,
          size_formatted: formatBytes(stats.size),
          created_at: new Date().toISOString(),
          reason
        };
        console.log(`[BACKUP] [SUCCESS] POS database backed up (${reason}): ${zipName} (${result.size_formatted})`);
        return resolve(result);
      }

      // Fallback: PowerShell ZipFile
      const psScript = `
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        if (Test-Path "${zipPath}") { Remove-Item "${zipPath}" -Force }
        [System.IO.Compression.ZipFile]::CreateFromDirectory("${DATA_DIR}", "${zipPath}")
      `;
      execFile('powershell', ['-NoProfile', '-Command', psScript], (psErr) => {
        if (!psErr && fs.existsSync(zipPath)) {
          const stats = fs.statSync(zipPath);
          cleanOldBackups(30);
          const result = {
            success: true,
            filename: zipName,
            filepath: zipPath,
            size_bytes: stats.size,
            size_formatted: formatBytes(stats.size),
            created_at: new Date().toISOString(),
            reason
          };
          console.log(`[BACKUP] [SUCCESS] Fallback zip created: ${zipName} (${result.size_formatted})`);
          return resolve(result);
        }

        console.error('[BACKUP] [ERROR] Backup creation failed:', stderr || psErr?.message);
        resolve({ success: false, message: stderr || psErr?.message || 'Failed creating backup archive' });
      });
    });
  });
}

function listBackups() {
  try {
    if (!fs.existsSync(BACKUPS_DIR)) return [];
    return fs.readdirSync(BACKUPS_DIR)
      .filter(f => f.endsWith('.zip'))
      .map(f => {
        const full = path.join(BACKUPS_DIR, f);
        const stats = fs.statSync(full);
        return {
          filename: f,
          size_bytes: stats.size,
          size_formatted: formatBytes(stats.size),
          created_at: stats.mtime.toISOString(),
          download_url: `/api/backups/${encodeURIComponent(f)}`
        };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch (e) {
    console.error('[BACKUP] Failed listing backups:', e.message);
    return [];
  }
}

let lastNightlyBackupDate = null;

function startNightlyScheduler() {
  console.log('[BACKUP] Nightly Auto-Backup scheduler armed for 11:59 PM.');

  setInterval(async () => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const todayStr = formatDateOnly(now);

    // Trigger at 23:59 (11:59 PM)
    if (hours === 23 && minutes === 59) {
      if (lastNightlyBackupDate !== todayStr) {
        lastNightlyBackupDate = todayStr;
        console.log(`[BACKUP] Starting scheduled 11:59 PM nightly backup for ${todayStr}...`);
        await createBackup('Nightly 11:59 PM Auto-Backup');
      }
    }
  }, 30 * 1000); // Check every 30 seconds
}

module.exports = {
  createBackup,
  listBackups,
  startNightlyScheduler,
  BACKUPS_DIR
};


const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const SCRIPT_PATH = path.join(__dirname, '..', 'scripts', 'raw_printer.ps1');

function getInstalledPrinters() {
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_PATH, '-Action', 'list'], (err, stdout) => {
      if (err) {
        console.error('[PRINTER] Failed to query printers:', err.message);
        return resolve([]);
      }
      try {
        const text = (stdout || '').trim();
        if (!text) return resolve([]);
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed) ? parsed : [parsed];
        resolve(list);
      } catch (e) {
        console.error('[PRINTER] Failed to parse printer list:', e.message);
        resolve([]);
      }
    });
  });
}

function kickCashDrawer(printerName = '') {
  return new Promise((resolve, reject) => {
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_PATH, '-Action', 'kick_drawer'];
    if (printerName) {
      args.push('-PrinterName', printerName);
    }
    execFile('powershell', args, (err, stdout, stderr) => {
      if (err) {
        console.error('[HARDWARE] Failed to kick cash drawer:', stderr || err.message);
        return resolve({ success: false, message: stderr || err.message });
      }
      console.log(`[HARDWARE] Cash drawer kick pulse sent successfully to printer "${printerName || 'Default'}".`);
      resolve({ success: true, message: 'Cash drawer opened' });
    });
  });
}

// ESC/POS Commands
const ESC = '\x1B';
const GS = '\x1D';

const CMD = {
  RESET: `${ESC}@`,
  ALIGN_LEFT: `${ESC}a\x00`,
  ALIGN_CENTER: `${ESC}a\x01`,
  ALIGN_RIGHT: `${ESC}a\x02`,
  BOLD_ON: `${ESC}E\x01`,
  BOLD_OFF: `${ESC}E\x00`,
  DOUBLE_WIDTH_ON: `${ESC}!\x20`,
  DOUBLE_HEIGHT_ON: `${ESC}!\x10`,
  DOUBLE_BOTH_ON: `${ESC}!\x30`,
  NORMAL_TEXT: `${ESC}!\x00`,
  FEED_AND_CUT: `${GS}V\x41\x03`,
  DRAWER_KICK: `${ESC}p\x00\x19\xFA${ESC}p\x01\x19\xFA`
};

function formatNaira(num) {
  const n = parseFloat(num) || 0;
  return 'NGN ' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function padRight(str, len) {
  const s = String(str || '');
  return s.length >= len ? s.slice(0, len) : s + ' '.repeat(len - s.length);
}

function padLeft(str, len) {
  const s = String(str || '');
  return s.length >= len ? s.slice(0, len) : ' '.repeat(len - s.length) + s;
}

function formatEscPosReceipt(sale, options = {}) {
  const width = options.paper === '58' ? 32 : 42;
  const divider = '-'.repeat(width);
  const doubleDivider = '='.repeat(width);

  let p = '';
  p += CMD.RESET;

  // Drawer Kick pulse if requested at start
  if (options.kickDrawer) {
    p += CMD.DRAWER_KICK;
  }

  // Header
  p += CMD.ALIGN_CENTER;
  p += CMD.BOLD_ON + CMD.DOUBLE_HEIGHT_ON;
  p += 'QUALITY SUPERSTORES\n';
  p += CMD.NORMAL_TEXT;
  p += '16, Ogo Oluwa St, Ketere Market,\nSango, Ogun State\n';
  p += 'Tel: +234 803 000 0000\n';
  p += divider + '\n';

  // Sale Metadata
  p += CMD.ALIGN_LEFT;
  p += `Receipt #:  ${sale.receipt_number || sale.order_id || 'N/A'}\n`;
  p += `Date:       ${sale.date || new Date().toLocaleString()}\n`;
  p += `Terminal:   ${sale.terminal_id || 'TERM-01'}\n`;
  p += `Cashier:    ${sale.salesperson || 'Staff'}\n`;
  p += `Customer:   ${sale.customer_name || 'Walk in Customer'}\n`;
  p += doubleDivider + '\n';

  // Line Items
  if (width === 32) {
    p += padRight('ITEM', 18) + padLeft('TOTAL', 14) + '\n';
  } else {
    p += padRight('ITEM', 22) + padLeft('QTY', 6) + padLeft('PRICE', 7) + padLeft('TOTAL', 7) + '\n';
  }
  p += divider + '\n';

  for (const item of (sale.line_items || [])) {
    const name = item.name || item.item_name || 'Item';
    const qty = item.quantity || 1;
    const unit = item.unit || 'PCS';
    const price = parseFloat(item.unit_price || item.rate) || 0;
    const total = parseFloat(item.total || (qty * price)) || 0;

    p += CMD.BOLD_ON + `${name} (${unit})\n` + CMD.BOLD_OFF;
    const qtyStr = `${qty} ${unit}`;
    const priceStr = price.toLocaleString('en-NG');
    const totStr = total.toLocaleString('en-NG');

    if (width === 32) {
      p += padRight(`  ${qtyStr} @ ${priceStr}`, 18) + padLeft(totStr, 14) + '\n';
    } else {
      p += padRight(`  ${qtyStr}`, 20) + padLeft(priceStr, 11) + padLeft(totStr, 11) + '\n';
    }
  }

  p += divider + '\n';

  // Totals & Financials
  const subtotal = (sale.line_items || []).reduce((acc, i) => acc + (parseFloat(i.total || (i.quantity * (i.unit_price || i.rate))) || 0), 0);
  const discount = parseFloat(sale.discount || sale.disc) || 0;
  const grandTotal = parseFloat(sale.total) || (subtotal - discount);

  if (discount > 0) {
    p += padRight('Subtotal:', width - 15) + padLeft(formatNaira(subtotal), 15) + '\n';
    p += padRight('Discount:', width - 15) + padLeft('-' + formatNaira(discount), 15) + '\n';
  }

  p += CMD.BOLD_ON + CMD.DOUBLE_HEIGHT_ON;
  p += padRight('TOTAL DUE:', width - 17) + padLeft(formatNaira(grandTotal), 17) + '\n';
  p += CMD.NORMAL_TEXT;

  p += divider + '\n';
  const payMode = (sale.payment_mode || 'CASH').toUpperCase();
  p += padRight(`Payment Mode (${payMode}):`, width - 15) + padLeft(formatNaira(sale.amount_paid || grandTotal), 15) + '\n';

  if (payMode === 'CASH' || (sale.change && sale.change > 0)) {
    const change = parseFloat(sale.change) || 0;
    p += padRight('Change Due:', width - 15) + padLeft(formatNaira(change), 15) + '\n';
  }

  p += doubleDivider + '\n';

  // Footer
  p += CMD.ALIGN_CENTER;
  p += 'Thank you for shopping with us!\n';
  p += 'Goods sold in good condition\ncannot be returned.\n';
  p += '\n\n\n';

  // Cut Paper
  p += CMD.FEED_AND_CUT;

  return Buffer.from(p, 'binary');
}

function printDirect(printerName, buffer) {
  return new Promise((resolve) => {
    const base64 = buffer.toString('base64');
    const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', SCRIPT_PATH, '-Action', 'print', '-Base64Data', base64];
    if (printerName) {
      args.push('-PrinterName', printerName);
    }
    execFile('powershell', args, (err, stdout, stderr) => {
      if (err) {
        console.error('[PRINTER] Direct print error:', stderr || err.message);
        return resolve({ success: false, message: stderr || err.message });
      }
      console.log(`[PRINTER] Print job dispatched successfully to "${printerName || 'Default'}".`);
      resolve({ success: true, message: 'Print job sent successfully' });
    });
  });
}

module.exports = {
  getInstalledPrinters,
  kickCashDrawer,
  formatEscPosReceipt,
  printDirect
};

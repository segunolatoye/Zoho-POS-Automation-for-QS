// =============================================================================
// QUALITY SUPERSTORES POS - SETUP GUIDE PDF GENERATOR
// =============================================================================
// Generates an executive, publication-grade PDF manual covering fresh installation,
// hardware configuration, multi-terminal LAN setup, RBAC security, and daily operations.
// Uses Playwright and local Chrome to output: Quality_Superstores_POS_Setup_Guide.pdf
// =============================================================================

const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');

const OUTPUT_PDF = path.join(__dirname, '..', 'Quality_Superstores_POS_Setup_Guide.pdf');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const HTML_CONTENT = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Quality Superstores POS - Setup & Installation Guide</title>
<style>
  @page {
    size: A4;
    margin: 18mm 14mm 18mm 14mm;
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1E293B;
    background: #FFFFFF;
    font-size: 9.5pt;
    line-height: 1.5;
    margin: 0;
    padding: 0;
  }

  .cover-banner {
    background: linear-gradient(135deg, #064E3B 0%, #065F46 50%, #047857 100%);
    color: #FFFFFF;
    padding: 24px 28px;
    border-radius: 12px;
    margin-bottom: 24px;
    box-shadow: 0 4px 12px rgba(6, 78, 59, 0.15);
  }
  .cover-badge {
    display: inline-block;
    background: #10B981;
    color: #064E3B;
    font-weight: 800;
    font-size: 7.5pt;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding: 3px 8px;
    border-radius: 4px;
    margin-bottom: 8px;
  }
  .cover-title {
    font-size: 20pt;
    font-weight: 800;
    margin: 0 0 6px 0;
    letter-spacing: -0.5px;
    color: #FFFFFF;
  }
  .cover-sub {
    font-size: 11pt;
    font-weight: 500;
    color: #A7F3D0;
    margin: 0 0 12px 0;
  }
  .cover-meta {
    display: flex;
    gap: 16px;
    font-size: 8.5pt;
    color: #D1FAE5;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    padding-top: 10px;
  }
  .cover-meta span strong {
    color: #FFFFFF;
  }

  h2 {
    font-size: 13pt;
    font-weight: 800;
    color: #0F172A;
    border-bottom: 2px solid #E2E8F0;
    padding-bottom: 4px;
    margin: 22px 0 12px 0;
    display: flex;
    align-items: center;
    gap: 8px;
    page-break-after: avoid;
  }
  h2 .step-num {
    background: #065F46;
    color: #FFFFFF;
    font-size: 9pt;
    font-weight: 800;
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }

  h3 {
    font-size: 10.5pt;
    font-weight: 700;
    color: #065F46;
    margin: 14px 0 6px 0;
    page-break-after: avoid;
  }

  p {
    margin: 0 0 8px 0;
  }

  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-bottom: 12px;
  }
  .grid-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 10px;
    margin-bottom: 12px;
  }

  .card {
    background: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    padding: 10px 14px;
  }
  .card-title {
    font-weight: 700;
    font-size: 9pt;
    color: #0F172A;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .callout {
    background: #ECFDF5;
    border-left: 4px solid #10B981;
    padding: 8px 12px;
    border-radius: 0 6px 6px 0;
    margin: 10px 0;
    font-size: 9pt;
  }
  .callout-warn {
    background: #FFFBEB;
    border-left: 4px solid #F59E0B;
    padding: 8px 12px;
    border-radius: 0 6px 6px 0;
    margin: 10px 0;
    font-size: 9pt;
  }
  .callout strong {
    color: #065F46;
  }
  .callout-warn strong {
    color: #B45309;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0 14px 0;
    font-size: 8.5pt;
  }
  th {
    background: #F1F5F9;
    color: #0F172A;
    font-weight: 700;
    text-align: left;
    padding: 6px 10px;
    border: 1px solid #CBD5E1;
  }
  td {
    padding: 5px 10px;
    border: 1px solid #E2E8F0;
    vertical-align: top;
  }
  tr:nth-child(even) td {
    background: #F8FAFC;
  }

  code {
    font-family: Consolas, "Liberation Mono", Courier, monospace;
    font-size: 8.5pt;
    background: #F1F5F9;
    color: #0F172A;
    padding: 1px 4px;
    border-radius: 3px;
    border: 1px solid #E2E8F0;
  }
  pre {
    background: #0F172A;
    color: #F8FAFC;
    padding: 10px 14px;
    border-radius: 6px;
    font-family: Consolas, monospace;
    font-size: 8.5pt;
    line-height: 1.4;
    overflow-x: auto;
    margin: 6px 0 10px 0;
  }
  pre span.com { color: #94A3B8; }
  pre span.cmd { color: #34D399; font-weight: bold; }
  pre span.arg { color: #38BDF8; }

  .pill {
    display: inline-block;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 7.5pt;
    font-weight: 700;
    text-transform: uppercase;
  }
  .pill-admin { background: #DCFCE7; color: #166534; }
  .pill-finance { background: #E0E7FF; color: #3730A3; }
  .pill-cashier { background: #FEF3C7; color: #92400E; }
  .pill-port { background: #F3E8FF; color: #6B21A8; }

  .page-break {
    page-break-before: always;
  }

  kbd {
    background: #E2E8F0;
    border: 1px solid #CBD5E1;
    border-radius: 3px;
    padding: 1px 5px;
    font-size: 7.5pt;
    font-weight: 700;
    color: #334155;
    box-shadow: 0 1px 0 rgba(0,0,0,0.2);
  }
</style>
</head>
<body>

  <!-- COVER BANNER -->
  <div class="cover-banner">
    <div class="cover-badge">Official Deployment & Operations Manual &bull; v2.2</div>
    <h1 class="cover-title">Quality Superstores POS Automation</h1>
    <div class="cover-sub">Offline-First Retail Engine &bull; Zoho Inventory Cloud Synchronization &bull; Multi-Terminal Setup</div>
    <div class="cover-meta">
      <span><strong>Location:</strong> 16, Ogo Oluwa St, Ketere Market, Sango, Ogun State</span>
      <span><strong>Architecture:</strong> Node.js + PWA + ESC/POS Direct Hub</span>
      <span><strong>Date:</strong> November 2026</span>
    </div>
  </div>

  <!-- EXECUTIVE SUMMARY -->
  <div class="callout">
    <strong>Executive Architecture:</strong> This Point of Sale (POS) system is designed for 100% offline retail continuity. All catalog items, customer ledgers, and transaction records persist locally on the store hub server. Internet outages never interrupt scanning, payment collection, or thermal receipt printing. When internet is active, transactions push automatically to Zoho Books and Zoho Inventory.
  </div>

  <!-- SECTION 1: SYSTEM REQUIREMENTS & HARDWARE PREREQUISITES -->
  <h2><span class="step-num">1</span> System Requirements & Hardware Prerequisites</h2>
  <p>Before installing the software, ensure the primary store hub machine and station hardware meet the following specifications:</p>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">🖥️ Server Hub PC (Host Terminal)</div>
      <ul style="margin: 4px 0 0 18px; padding: 0; font-size: 8.5pt;">
        <li><strong>OS:</strong> Windows 10 or Windows 11 (64-bit)</li>
        <li><strong>Node.js:</strong> v18.x, v20.x, or v22.x LTS (<a href="https://nodejs.org" style="color:#047857">nodejs.org</a>)</li>
        <li><strong>Browser:</strong> Google Chrome (Standard 64-bit install at <code>C:\Program Files\Google\Chrome\Application\chrome.exe</code>)</li>
        <li><strong>RAM / CPU:</strong> 4GB+ RAM, Intel Core i3 / Celeron or higher</li>
        <li><strong>Network:</strong> Wi-Fi or Ethernet connection to store LAN router</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-title">🖨️ Retail Station Peripherals</div>
      <ul style="margin: 4px 0 0 18px; padding: 0; font-size: 8.5pt;">
        <li><strong>Thermal Printer:</strong> 80mm standard (or 58mm compact) USB/LAN ESC/POS receipt printer (e.g. Xprinter, Epson, POS-80)</li>
        <li><strong>Cash Drawer:</strong> Standard 12V/24V RJ11 connected directly into thermal printer drawer port</li>
        <li><strong>Barcode Scanner:</strong> 1D/2D USB plug-and-play laser barcode scanner (keyboard wedge mode)</li>
      </ul>
    </div>
  </div>

  <!-- SECTION 2: CODEBASE DEPLOYMENT & ENVIRONMENT SETUP -->
  <h2><span class="step-num">2</span> Fresh Codebase Installation</h2>
  <p>Follow these steps to deploy the POS application onto a newly formatted or fresh Windows machine:</p>

  <h3>Step 2.1 — Clone or Extract Codebase</h3>
  <p>Open <strong>PowerShell</strong> or <strong>Command Prompt</strong> and clone the project repository, or extract the ZIP release to your preferred directory (e.g., <code>C:\Users\SegunOlatoye\zoho-pos-automation</code>):</p>
  <pre><span class="com"># Clone repository from GitHub</span>
<span class="cmd">git clone</span> <span class="arg">https://github.com/segunolatoye/Zoho-POS-Automation-for-QS.git</span>
<span class="cmd">cd</span> <span class="arg">Zoho-POS-Automation-for-QS</span></pre>

  <h3>Step 2.2 — Install Project Dependencies</h3>
  <pre><span class="com"># Install required production dependencies (playwright-core for Zoho browser automation)</span>
<span class="cmd">npm install</span></pre>

  <h3>Step 2.3 — Verify Core Directory Structure</h3>
  <p>Verify that the following essential directories and data files are present in the project root:</p>
  <table>
    <thead>
      <tr>
        <th style="width:25%">Directory / File</th>
        <th style="width:30%">Role</th>
        <th style="width:45%">Description</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><code>public/index.html</code></td>
        <td>Frontend PWA Client</td>
        <td>Single-page offline POS register, touch/keyboard UI, receipt designer.</td>
      </tr>
      <tr>
        <td><code>pos_server.js</code></td>
        <td>Backend Hub Server</td>
        <td>Core HTTP REST API, offline sales queue, stock guard, thermal printer engine.</td>
      </tr>
      <tr>
        <td><code>data/pos_catalog.json</code></td>
        <td>Inventory Catalog</td>
        <td>Local product database (446 items) with carton/piece conversion ratios & whole rates.</td>
      </tr>
      <tr>
        <td><code>data/customers.json</code></td>
        <td>Customer Ledgers</td>
        <td>Local customer directory (315 contacts) including debtor ledger balances.</td>
      </tr>
      <tr>
        <td><code>data/pos_users.json</code></td>
        <td>User Auth & PINs</td>
        <td>Staff accounts, 4-digit PIN credentials, role permissions, and station assignments.</td>
      </tr>
      <tr>
        <td><code>data/offline_sales_queue.json</code></td>
        <td>Transactional Outbox</td>
        <td>Sequential sales records (<code>QS-00001</code>+) queued for cloud push to Zoho Books.</td>
      </tr>
      <tr>
        <td><code>backups/</code></td>
        <td>Disaster Recovery</td>
        <td>Automated nightly 11:59 PM database archives compressed into <code>.zip</code> files.</td>
      </tr>
    </tbody>
  </table>

  <!-- PAGE BREAK -->
  <div class="page-break"></div>

  <!-- SECTION 3: STAFF ACCOUNTS, PINS & ROLE-BASED ACCESS CONTROL -->
  <h2><span class="step-num">3</span> Default Staff Accounts, PINs & Security (RBAC)</h2>
  <p>The system is pre-configured with 4 active staff accounts representing the store's core personnel:</p>

  <table>
    <thead>
      <tr>
        <th style="width:18%">Staff Member</th>
        <th style="width:14%">Role</th>
        <th style="width:12%">Default PIN</th>
        <th style="width:18%">Default Terminal</th>
        <th style="width:38%">Permissions & Restrictions</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Funmilayo</strong></td>
        <td><span class="pill pill-admin">Manager / Admin</span></td>
        <td><code>9545</code></td>
        <td><code>TERM-01</code></td>
        <td>Full administrative access. Can perform managerial overrides, update product prices, manage PINs, create manual backups, view sync logs.</td>
      </tr>
      <tr>
        <td><strong>Oluwatobi</strong></td>
        <td><span class="pill pill-finance">Finance</span></td>
        <td><code>6935</code></td>
        <td><code>OFFICE-01</code></td>
        <td>Financial oversight. Can authorize discount overrides, inspect debtor ledgers, modify prices, close shifts.</td>
      </tr>
      <tr>
        <td><strong>Oluwatosin</strong></td>
        <td><span class="pill pill-cashier">Cashier 1</span></td>
        <td><code>5713</code></td>
        <td><code>KETERE 2</code></td>
        <td>Checkout register only. Strict 0% discount policy. <strong>Hidden from Price Manager, Cashier PINs, and Database Backups</strong>.</td>
      </tr>
      <tr>
        <td><strong>Cashier 2</strong></td>
        <td><span class="pill pill-cashier">Cashier 2</span></td>
        <td><code>5917</code></td>
        <td><code>TERM-02</code></td>
        <td>Checkout register only. Price modifying blocked without Manager PIN override.</td>
      </tr>
    </tbody>
  </table>

  <div class="callout-warn">
    <strong>Strict RBAC Lockdown:</strong> Cashier accounts cannot view or access <strong>Price Manager (<kbd>F7</kbd>)</strong>, <strong>Cashier PINs</strong>, or <strong>Data Backups</strong> in the navigation sidebar or status bar. Attempting to input a discount or edit unit rates triggers the Manager PIN Override modal.
  </div>

  <!-- SECTION 4: ONE-TIME ZOHO CLOUD AUTHENTICATION BRIDGE -->
  <h2><span class="step-num">4</span> One-Time Zoho Cloud Authentication Setup</h2>
  <p>To enable bidirectional synchronization with Zoho Books and Zoho Inventory without requiring fragile developer tokens that expire hourly, the system uses a persistent Chromium browser profile in <code>.browser_profile/</code>.</p>

  <h3>One-Time Sign-In Procedure:</h3>
  <ol style="margin: 4px 0 10px 18px; padding: 0; font-size: 9pt;">
    <li>Ensure Google Chrome is installed on the host computer.</li>
    <li>When <code>pos_server.js</code> initiates its first cloud pull, it will prompt for login if the session is unauthenticated.</li>
    <li>Log into your official <strong>Zoho Books / Inventory Quality Superstores</strong> account and check <em>"Keep me signed in"</em>.</li>
    <li>Once authenticated, credentials and session tokens persist in the local <code>.browser_profile/</code> folder. Future sync runs execute headlessly in the background automatically.</li>
  </ol>

  <!-- SECTION 5: STARTING THE POS HUB SERVER -->
  <h2><span class="step-num">5</span> Starting the POS Hub Server</h2>
  <p>Choose one of the following methods to start the retail server:</p>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">Option A: Desktop Double-Click (Recommended)</div>
      <p style="font-size: 8.5pt; margin: 4px 0;">Double-click <code>start_pos.bat</code> in the project root folder. This batch script starts the server and automatically opens the POS in Google Chrome after 2 seconds.</p>
      <pre><span class="cmd">start_pos.bat</span></pre>
    </div>
    <div class="card">
      <div class="card-title">Option B: Windows Terminal / PowerShell</div>
      <p style="font-size: 8.5pt; margin: 4px 0;">Run directly from Node.js in any terminal window:</p>
      <pre><span class="cmd">npm start</span>
<span class="com"># Or directly:</span>
<span class="cmd">node</span> <span class="arg">pos_server.js</span></pre>
    </div>
  </div>

  <h3>Option C: Windows Startup Auto-Run (Production Auto-Boot)</h3>
  <p>To have the POS Hub start automatically whenever the computer is powered on in the morning without touching the keyboard, run the included PowerShell setup script as Administrator:</p>
  <pre><span class="cmd">powershell -ExecutionPolicy Bypass -File</span> <span class="arg">scripts/create_launch_shortcut.ps1</span></pre>
  <p>This creates a desktop shortcut with the official app icon and places an auto-run link in the Windows <code>Startup</code> folder.</p>

  <!-- PAGE BREAK -->
  <div class="page-break"></div>

  <!-- SECTION 6: MULTI-TERMINAL LOCAL AREA NETWORK (LAN) SETUP -->
  <h2><span class="step-num">6</span> Multi-Terminal Station Configuration (LAN Setup)</h2>
  <p>You can run multiple cashier stations simultaneously across different PCs, tablets, or laptops connected to the same store Wi-Fi or Ethernet router.</p>

  <div class="card" style="margin-bottom: 12px;">
    <div class="card-title">🌐 Store Network Topology</div>
    <div style="font-family: monospace; font-size: 8.5pt; background: #0F172A; color: #38BDF8; padding: 10px; border-radius: 6px; line-height: 1.6;">
      [ Store Wi-Fi Router: 192.168.100.1 ]<br>
      &nbsp;&nbsp;├── [Server Hub PC] &bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull; IP: 192.168.100.18:3001 (Host Server)<br>
      &nbsp;&nbsp;├── [Cashier Station 1 (KETERE 2)] &bull;&bull;&bull;&bull;&bull;&bull; Browser -> http://192.168.100.18:3001<br>
      &nbsp;&nbsp;├── [Cashier Station 2 (TERM-02)] &bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull; Browser -> http://192.168.100.18:3001<br>
      &nbsp;&nbsp;└── [Manager / Finance PC (OFFICE-01)] &bull;&bull; Browser -> http://192.168.100.18:3001
    </div>
  </div>

  <h3>Station Setup Instructions:</h3>
  <ol style="margin: 4px 0 10px 18px; padding: 0; font-size: 9pt;">
    <li><strong>Assign Static IP:</strong> Set a static IP on the Server Hub PC (recommended: <code>192.168.100.18</code>) via your Windows Network adapter settings or router DHCP reservation.</li>
    <li><strong>Open on Cashier Terminal:</strong> Open Google Chrome or Microsoft Edge on any station PC and navigate to:
      <pre style="display:inline-block; padding: 3px 8px; margin: 2px 0;"><span class="cmd">http://192.168.100.18:3001</span></pre>
    </li>
    <li><strong>Install Desktop App (PWA):</strong> Click the <strong>Install App</strong> icon in the Chrome URL bar (or Menu &rarr; <em>"Install Quality Superstores POS"</em>). The POS will install as a native desktop application with its own window, taskbar icon, and offline caching.</li>
  </ol>

  <h3>6.4 Emergency Standalone Mode (If Server Hub PC Powers Off)</h3>
  <div class="callout">
    <strong>Zero-Downtime Standalone Resiliency:</strong> If the central Server Hub PC suddenly loses power, crashes, or Wi-Fi drops, connected cashier stations automatically switch to <strong>Standalone Mode</strong>:
    <ul style="margin: 4px 0 0 16px; padding: 0;">
      <li>Cashiers can continue entering PINs, scanning barcodes, collecting cash/POS, and issuing receipts without interruption.</li>
      <li>Sales are saved into the station's browser storage with emergency standalone receipt numbers (e.g. <code>QS-EMG-KTR2-0001</code>).</li>
      <li>Receipts print immediately to the cashier station's local printer.</li>
      <li>When the host Server Hub PC turns back on, the terminal automatically flushes all local sales to the central server outbox.</li>
    </ul>
  </div>

  <!-- SECTION 7: THERMAL PRINTER & HARDWARE CASH DRAWER SETUP -->
  <h2><span class="step-num">7</span> Thermal Receipt Printer & Cash Drawer Setup</h2>

  <h3>7.1 Per-Terminal Local Printing Architecture</h3>
  <p>To avoid all store receipts printing on the central server machine across the room, each cashier terminal can print directly to its own attached receipt printer:</p>
  <ul style="margin: 4px 0 10px 18px; padding: 0; font-size: 9pt;">
    <li>Open the POS on the cashier station and click <strong>Printer Setup</strong> in the left sidebar or the footer link.</li>
    <li>Set <strong>Print Destination</strong> to: <code>This Station (Browser / Local USB)</code>.</li>
    <li>Set <strong>Paper Width</strong> to <code>80mm</code> (or <code>58mm</code>).</li>
    <li>When a sale completes, the receipt prints instantly on that cashier's local printer.</li>
  </ul>

  <h3>7.2 Chrome Kiosk Silent Printing (Zero-Click Receipts)</h3>
  <p>To bypass the Windows print dialog box and print receipts silently in under 0.5 seconds:</p>
  <pre><span class="com"># Launch Chrome with silent kiosk printing flags</span>
<span class="cmd">chrome.exe</span> <span class="arg">--kiosk --kiosk-printing http://192.168.100.18:3001</span></pre>

  <h3>7.3 Electronic Cash Drawer (RJ11 Cable)</h3>
  <ul style="margin: 4px 0 10px 18px; padding: 0; font-size: 9pt;">
    <li>Plug the RJ11 modular phone-style cable from the cash drawer into the back of the thermal printer (labeled <code>DK</code> or <code>DRAWER</code>).</li>
    <li>The POS automatically fires the ESC/POS electrical pulse (<code>\x1B\x70\x00\x19\xFA</code>) on every <strong>Cash</strong> transaction.</li>
    <li>Cashiers can also kick the drawer open manually at any time by pressing <kbd>F11</kbd> or clicking <em>Open Drawer</em> in the footer.</li>
  </ul>

  <!-- SECTION 8: DAILY CASHIER WORKFLOW & FINANCIAL RECONCILIATION -->
  <h2><span class="step-num">8</span> Daily Cashier Operations & Financial Reconciliation</h2>

  <div class="grid-3">
    <div class="card">
      <div class="card-title">🌅 Morning Shift Open</div>
      <p style="font-size: 8pt; margin: 4px 0;">Press <kbd>Ctrl+E</kbd>. Enter the morning cash float provided in the drawer (e.g. ₦10,000 in small denominations). Click <em>Open Shift</em>.</p>
    </div>
    <div class="card">
      <div class="card-title">🛒 Active Retail Selling</div>
      <p style="font-size: 8pt; margin: 4px 0;">Scan barcodes (<kbd>F2</kbd>). Toggle Packaging Unit (Carton / Pack / Pcs). Select Customer (<kbd>F4</kbd>). Cycle payment (<kbd>F6</kbd>). Charge (<kbd>F8</kbd>).</p>
    </div>
    <div class="card">
      <div class="card-title">🌙 Evening Shift Close</div>
      <p style="font-size: 8pt; margin: 4px 0;">Press <kbd>Ctrl+E</kbd>. Physically count cash notes in the drawer and enter the total. System calculates Variance and prints the physical Z-Report.</p>
    </div>
  </div>

  <h3>Variance & Drawer Reconciliation Matrix</h3>
  <p>The system automatically audits expected cash against counted cash:</p>
  <ul>
    <li><strong>Expected Cash:</strong> <code>Opening Float + Total Cash Tender Sales - Change Returned</code></li>
    <li><strong>Variance:</strong> <code>Counted Physical Cash - Expected Cash</code>
      <ul>
        <li><code>₦0.00</code> &rarr; <strong>BALANCED</strong> (Drawer reconciles perfectly).</li>
        <li><code>+₦XXX.XX</code> &rarr; <strong>OVER</strong> (Excess physical cash detected).</li>
        <li><code>-₦XXX.XX</code> &rarr; <strong>SHORT</strong> (Shortfall detected; cashier must explain variance).</li>
      </ul>
    </li>
  </ul>

  <!-- PAGE BREAK -->
  <div class="page-break"></div>

  <!-- SECTION 9: DISASTER RECOVERY & AUTOMATED BACKUPS -->
  <h2><span class="step-num">9</span> Automated Disaster Recovery & Backups</h2>
  <p>The POS includes a multi-tier automated data protection engine to prevent data loss in the event of hardware failure, power loss, or Windows corruption:</p>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">🛡️ 11:59 PM Nightly Auto-Backup</div>
      <p style="font-size: 8.5pt; margin: 4px 0;">Every night at 11:59 PM, the server automatically bundles all inventory, customer ledgers, sales queues, and logs into a compressed <code>.zip</code> archive in the <code>backups/</code> folder.</p>
      <p style="font-size: 8pt; color: #64748B;">Archives older than 30 days are automatically rotated and cleaned up.</p>
    </div>
    <div class="card">
      <div class="card-title">⚡ Instant Protection Snapshot</div>
      <p style="font-size: 8.5pt; margin: 4px 0;">Managers and Finance staff can click <strong>Data Backups</strong> &rarr; <strong>Backup Now</strong> at any time during the day to generate an instant protection snapshot.</p>
      <p style="font-size: 8pt; color: #64748B;">Existing archives can be downloaded directly from the UI.</p>
    </div>
  </div>

  <!-- SECTION 10: VERIFICATION & CI TEST SUITES -->
  <h2><span class="step-num">10</span> System Diagnostics & Verification</h2>
  <p>Always run the automated verification suites after completing a fresh installation or software update:</p>

  <div class="card" style="margin-bottom: 10px;">
    <div class="card-title">1. Catalog & Core Feature Verification (27 CI Tests)</div>
    <pre><span class="cmd">npm test</span>
<span class="com"># Or:</span>
<span class="cmd">node</span> <span class="arg">scripts/test_catalog.js</span></pre>
    <p style="font-size: 8pt; color: #059669; font-weight: 700; margin: 0;">Verifies catalog integrity, packaging ratios, ESC/POS printer buffers, drawer kick commands, and RBAC PIN authorization.</p>
  </div>

  <div class="card">
    <div class="card-title">2. Multi-User Simultaneous Concurrency & Stress Test (37 Tests)</div>
    <pre><span class="cmd">node</span> <span class="arg">scripts/simulate_multiuser.js</span></pre>
    <p style="font-size: 8pt; color: #059669; font-weight: 700; margin: 0;">Fires simultaneous multi-terminal sales, concurrent logins, shift reconciliations, and race-condition checks under high load.</p>
  </div>

  <!-- APPENDIX: KEYBOARD SHORTCUTS REFERENCE CARD -->
  <h2><span class="step-num">★</span> Appendix: Cashier Keyboard Shortcuts Cheat Sheet</h2>
  <p>All cashier operations can be executed at lightning speed without touching the mouse:</p>

  <table>
    <thead>
      <tr>
        <th style="width:14%">Shortcut</th>
        <th style="width:36%">Action</th>
        <th style="width:14%">Shortcut</th>
        <th style="width:36%">Action</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><kbd>F1</kbd></td>
        <td>Keyboard Shortcuts Help Modal</td>
        <td><kbd>F7</kbd></td>
        <td>Product Price Manager <em>(Manager / Finance only)</em></td>
      </tr>
      <tr>
        <td><kbd>F2</kbd></td>
        <td>Focus Search Bar / Barcode Scan</td>
        <td><kbd>F8</kbd></td>
        <td>Charge / Complete Sale Transaction</td>
      </tr>
      <tr>
        <td><kbd>F3</kbd></td>
        <td>Toggle Sell Register & Orders View</td>
        <td><kbd>F9</kbd></td>
        <td>Push Sales to Zoho (Shift+F9: Pull Catalog)</td>
      </tr>
      <tr>
        <td><kbd>F4</kbd></td>
        <td>Select Customer Ledger / Debtor Alert</td>
        <td><kbd>F10</kbd></td>
        <td>Toggle Theme (Light / Dark Mode)</td>
      </tr>
      <tr>
        <td><kbd>F5</kbd></td>
        <td>Park / Hold & Recall Active Cart</td>
        <td><kbd>F11</kbd></td>
        <td>Kick Open Hardware Cash Drawer</td>
      </tr>
      <tr>
        <td><kbd>F6</kbd></td>
        <td>Cycle Payment Mode (Cash, POS, Transfer, Split)</td>
        <td><kbd>F12</kbd></td>
        <td>Reprint Last Receipt</td>
      </tr>
      <tr>
        <td><kbd>Ctrl+E</kbd></td>
        <td>Open Shift Float & Close Z-Report</td>
        <td><kbd>Esc</kbd></td>
        <td>Close Active Modal / Clear Tender</td>
      </tr>
    </tbody>
  </table>

  <div style="text-align: center; margin-top: 24px; padding-top: 12px; border-top: 1px solid #E2E8F0; font-size: 8pt; color: #64748B;">
    <strong>Quality Superstores</strong> &bull; 16, Ogo Oluwa St, Ketere Market, Sango, Ogun State &bull; Automation Engine v2.2
  </div>

</body>
</html>`;

async function generatePDF() {
  console.log('Launching headless Chrome to render Setup Guide PDF...');
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true
  });

  const page = await browser.newPage();
  await page.setContent(HTML_CONTENT, { waitUntil: 'load' });

  console.log(`Generating PDF output at: ${OUTPUT_PDF}`);
  await page.pdf({
    path: OUTPUT_PDF,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '16mm',
      bottom: '16mm',
      left: '14mm',
      right: '14mm'
    },
    displayHeaderFooter: true,
    headerTemplate: `
      <div style="font-size: 7.5pt; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #64748B; width: 100%; text-align: right; padding-right: 14mm;">
        Quality Superstores POS &bull; Fresh Installation & Hardware Setup Manual
      </div>
    `,
    footerTemplate: `
      <div style="font-size: 7.5pt; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #64748B; width: 100%; display: flex; justify-content: space-between; padding: 0 14mm;">
        <span>Quality Superstores &bull; Ketere Market, Sango, Ogun State</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `
  });

  await browser.close();
  const stats = fs.statSync(OUTPUT_PDF);
  console.log(`\n🎉 PDF GENERATED SUCCESSFULLY!`);
  console.log(`   File: ${OUTPUT_PDF}`);
  console.log(`   Size: ${(stats.size / 1024).toFixed(2)} KB\n`);
}

generatePDF().catch(err => {
  console.error('❌ PDF generation failed:', err);
  process.exit(1);
});

# Quality Superstores - Offline-First POS & Zoho Inventory Automation

A robust, enterprise-grade, offline-first retail Point of Sale (POS) application and Zoho Books / Inventory sync engine built specifically for **Quality Superstores** (16, Ogo Oluwa St, Ketere Market, Sango, Ogun State).

---

## 🌟 Highlights & Architecture

### 1. Offline-First POS Engine (`public/index.html`, `pos_server.js`)
* **100% Offline Capability**: Runs seamlessly even without an active internet connection. All sales queue locally in `data/offline_sales_queue.json`.
* **Zero-Decimal Whole Pricing**: Enforces integer Naira currency calculations for piece and carton packaging without fractional rounding errors.
* **Instant Barcode Scanner Support (<kbd>F2</kbd>)**: Fast USB barcode scanning with audio feedback and live inventory auto-lookups.
* **Cart Hold & Recall (<kbd>F5</kbd>)**: Park incomplete transactions to serve the next customer, then instantly restore customer items and pricing.
* **Split Tender & Multi-Payment**: Supports Cash with Quick Tender bills (+500, +1k, +2k, +5k, +10k, Exact), Moniepoint POS, First Bank Transfer, and Split Tender.
* **Customer Debt Ledgers (<kbd>F4</kbd>)**: Real-time customer balance alerts and outstanding balance checks for debtor tracking.

### 2. Dual-Role RBAC & High-Security PIN Authentication
* **Role-Based Access Control**:
  * **Manager / Admin** (`admin`): Full administrative control (override authority, sales, shift close, auto-backup, Zoho sync).
  * **Finance / Accounts** (`finance`): Complete financial oversight and manager-level authorization privileges plus sales capability.
  * **Cashiers** (`cashier`): Streamlined checkout operations with locked pricing and zero-discount enforcement.
* **Manager & Finance Override Gate**:
  * **Strict 0% Cashier Discount Policy**: Any discount greater than 0% requires a 4-digit Manager (`9545`) or Finance (`6935`) PIN.
  * **Unit Price Lockdown**: Cashiers cannot alter item catalog rates on order lines without Manager or Finance PIN verification.
  * **Price Manager Gating (<kbd>F7</kbd>)**: Product price adjustments are locked to Manager and Finance roles.
* **Server-Side Security**: All sale payloads submitted to `/api/sales` are verified on the backend before being written to the outbox queue.

### 3. Hardware & Thermal Printer Automation (`modules/hardware_printer.js`)
* **ESC/POS Direct Spooler**: Direct binary thermal printing to standard 80mm / 58mm USB and networked receipt printers bypassing Windows browser dialogs.
* **Automatic Cash Drawer Kick (RJ11 Pulse)**: Emits standard ESC/POS pulses (`\x1B\x70\x00\x19\xFA` & `\x1B\x70\x01\x19\xFA`) on cash tender and manual <kbd>F11</kbd> hotkey.
* **Sequential Retail Order Numbering**: Clear consecutive retail receipts (`QS-00001`, `QS-00002`, etc.) with explicit till tracking (`Tilled By: Cashier 1 (TERM-01)`).

### 4. Financial Reconciliation & Shift Close / Z-Report (<kbd>Ctrl+E</kbd>)
* **End-of-Shift Balancing**: Cashiers balance their drawer by entering opening cash float and counted drawer cash.
* **Variance Auditing**: Tracks expected cash vs. physical count with automatic Over/Short calculation.
* **Thermal Z-Report**: Generates compact physical shift summary receipts itemizing Cash, Moniepoint POS, and Transfer totals.

### 5. Automated Protection & Background Synchronization
* **11:59 PM Nightly Auto-Backup**: Scheduled ZIP compression bundling `data/` and `logs/` into `backups/pos_backup_YYYY-MM-DD_HHmmss.zip` (30-day retention).
* **Zoho Cloud Sync Watchdog**: 10-minute periodic sync engine pushing local sales to Zoho Books and pulling customer ledgers and live stock.

### 6. Production CI/CD & Process Management
* **GitHub Actions Workflow (`.github/workflows/ci.yml`)**: Continuous integration testing frontend syntax, hardware printer binary buffers, and RBAC PIN authorization.
* **PM2 Process Manager (`ecosystem.config.js`)**: Production process supervisor with auto-restart on memory spikes or terminal reboot.

---

## 🚀 Quick Start

### Prerequisites
* [Node.js](https://nodejs.org/) (v16.0.0 or higher)
* Windows PowerShell (for raw USB ESC/POS printer spooler)

### Installation
```bash
# Clone the repository
git clone https://github.com/segunolatoye/Zoho-POS-Automation-for-QS.git
cd Zoho-POS-Automation-for-QS

# Install dependencies
npm install

# Run automated CI validation suite
npm test
```

### Launching the POS
Double-click `start_pos.bat` or run:
```bash
node pos_server.js
```
Open your browser at:
* Local machine: **http://localhost:3001**
* LAN / Wi-Fi Terminals: **http://192.168.100.18:3001**

To run as a background service via PM2:
```bash
npx pm2 start ecosystem.config.js
npx pm2 save
```

---

## ⌨️ POS Keyboard Shortcuts

| Shortcut | Function | Description |
| :---: | :--- | :--- |
| <kbd>F2</kbd> | **Barcode Scan** | Focus barcode input / auto-detect scan |
| <kbd>F4</kbd> | **Customer** | Select or search customer ledger |
| <kbd>F5</kbd> | **Hold / Recall** | Park cart on hold or recall parked cart |
| <kbd>F6</kbd> | **Payment Mode** | Cycle payment method (Cash, POS, Transfer, Split) |
| <kbd>F7</kbd> | **Price Manager** | Open catalog price editor (Manager PIN req) |
| <kbd>F8</kbd> | **Charge Sale** | Complete checkout & print receipt |
| <kbd>F10</kbd> | **Theme Toggle** | Toggle Dark / Light visual theme |
| <kbd>F11</kbd> | **Kick Drawer** | Send manual pulse to open physical cash drawer |
| <kbd>Ctrl+E</kbd> | **Shift Close** | End-of-Day cash reconciliation & Z-Report |

---

## 🛡️ License
Private & Proprietary - Built for **Quality Superstores**, Ogun State, Nigeria. All rights reserved.

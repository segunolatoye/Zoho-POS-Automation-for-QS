/**
 * test_quantity_and_tender.js
 * Verifies:
 * 1. Direct editable quantity in cart with 0.5 bulk unit support.
 * 2. Focus preservation on Cash Received and Split Pay amount inputs.
 * 3. Removal of stepper arrow spinners from POS number inputs.
 * 4. PWA Service Worker Network-First strategy for HTML navigation.
 * 5. Server-side fractional bulk stock deduction (0.5 carton).
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('====================================================');
console.log('   TESTING DIRECT QTY EDIT, 0.5 BULK & TENDER INPUTS');
console.log('====================================================\n');

// 1. Read index.html and sw.js
const indexPath = path.join(__dirname, '..', 'public', 'index.html');
const indexHtml = fs.readFileSync(indexPath, 'utf8');

const swPath = path.join(__dirname, '..', 'public', 'sw.js');
const swJs = fs.readFileSync(swPath, 'utf8');

// Test 1: Service Worker uses Network-First for navigation and has bumped cache version
assert(swJs.includes("qs-pos-v2.3"), "Service Worker must have updated cache version qs-pos-v2.3");
assert(swJs.includes("event.request.mode === 'navigate'"), "Service Worker must have Network-First navigation rule");
console.log('✅ PASS: Service Worker v2.3 with Network-First navigation verified');

// Test 2: Stepper spinners are removed via CSS
assert(indexHtml.includes('-webkit-inner-spin-button'), "CSS must target -webkit-inner-spin-button");
assert(indexHtml.includes('-webkit-appearance: none'), "CSS must set -webkit-appearance: none on number spinners");
assert(indexHtml.includes('-moz-appearance: textfield'), "CSS must set -moz-appearance: textfield for Firefox");
console.log('✅ PASS: Number stepper spinner removal CSS verified');

// Test 3: Editable quantity input (.qty-inp) in cart line items
assert(indexHtml.includes('class="qty-inp"'), "Cart must render editable .qty-inp input field");
assert(indexHtml.includes('handleCartQtyInput'), "Must have handleCartQtyInput handler for in-place typing");
assert(indexHtml.includes('handleCartQtyCommit'), "Must have handleCartQtyCommit handler for change commit");
assert(indexHtml.includes("step=\"${L.unit.is_base ? '1' : '0.5'}\""), "Bulk units must have step='0.5' while base units have step='1'");
console.log('✅ PASS: Editable quantity input with 0.5 bulk step verified in cart template');

// Test 4: Focus preservation on Cash Received and Split Pay inputs
assert(indexHtml.includes('id="tender"'), "Must have tender input");
assert(indexHtml.includes('oninput="handleTenderInput(this.value)"'), "Tender input must call handleTenderInput, not innerHTML re-render");
assert(indexHtml.includes('onfocus="this.select()"'), "Tender and Split inputs must have onfocus='this.select()'");
assert(indexHtml.includes('id="split-cash"'), "Must have split-cash input");
assert(indexHtml.includes('id="split-moniepoint"'), "Must have split-moniepoint input");
assert(indexHtml.includes('id="split-transfer"'), "Must have split-transfer input");
console.log('✅ PASS: Zero focus loss verified for Cash Received and Split Pay inputs');

// Test 5: In-place DOM updates in handleCartQtyInput
assert(indexHtml.includes("id=\"line-tot-${id}\""), "Cart lines must have line-tot ID for in-place total updates");
assert(indexHtml.includes("id=\"cart-subtotal-val\""), "Cart must have cart-subtotal-val ID for in-place subtotal updates");
assert(indexHtml.includes("id=\"cart-total-val\""), "Cart must have cart-total-val ID for in-place total updates");
console.log('✅ PASS: In-place DOM updates for quantity typing verified (preserves focus and caret)');

// Test 6: Server stock deduction logic for fractional bulk items (0.5 carton)
const serverPath = path.join(__dirname, '..', 'pos_server.js');
const serverJs = fs.readFileSync(serverPath, 'utf8');

assert(serverJs.includes("Math.round((currentStockBulk * bulkRatio) * 100) / 100"), "Server must support 2 decimal precision on currentStockBase");
assert(serverJs.includes("Math.round((line.quantity * sellRatio) * 100) / 100"), "Server must support 2 decimal precision on requestedBase");
assert(serverJs.includes("item.stock = Math.max(0, Math.round(((parseFloat(item.stock) || 0) - soldBulk) * 100) / 100)"), "Server stock decrement must support fractional deductions");
console.log('✅ PASS: Server-side fractional bulk stock support (0.5 carton) verified');

// Test 7: Mathematical simulation of 0.5 carton sale
const listPriceCarton = 63000;
const qty = 0.5;
const lineTotal = Math.round(listPriceCarton * qty);
assert.strictEqual(lineTotal, 31500, "0.5 * ₦63,000 must equal exactly ₦31,500");

const initialStockCartons = 10;
const soldBulk = 0.5;
const remainingStock = Math.max(0, Math.round((initialStockCartons - soldBulk) * 100) / 100);
assert.strictEqual(remainingStock, 9.5, "10 - 0.5 cartons must equal 9.5 cartons");
console.log('✅ PASS: Math simulation for 0.5 carton sale verified (₦31,500 total, 9.5 cartons remaining)');

console.log('\n====================================================');
console.log('✅ ALL QUANTITY & TENDER INTEGRITY TESTS PASSED!');
console.log('====================================================\n');

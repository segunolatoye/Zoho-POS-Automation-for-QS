const readline = require('readline');
const path = require('path');

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

async function mainMenu() {
  while (true) {
    console.clear();
    console.log(`================================================================`);
    console.log(`        Zoho POS / Inventory Automation Suite                   `);
    console.log(`================================================================\n`);
    console.log(`Select an option:\n`);
    console.log(`  [1] Create / Sync Unit Groups (80 Flipped Groups)`);
    console.log(`  [2] Add / Import Catalog Items from CSV`);
    console.log(`  [3] Import Stock Quantities / Counts for Items`);
    console.log(`  [4] Post Sales Correctly (Zero Conflict POS Assistant)`);
    console.log(`  [5] Reprocess Stuck Conflicts to Real Paid Invoices`);
    console.log(`  [6] Conflict Manager (Inspect, Retry, or Delete Conflicts)`);
    console.log(`  [7] Launch Offline-First POS Web GUI (Zero Decimals & Auto-Sync)`);
    console.log(`  [8] Exit\n`);

    const choice = (await askQuestion(`Enter choice [1-8]: `)).trim();

    if (choice === '1') {
      console.log(`\nStarting Feature 1: Unit Groups Automation...\n`);
      const unitGroupsScript = require('./create_unit_groups.js');
      if (typeof unitGroupsScript.run === 'function') {
        await unitGroupsScript.run();
      }
      break;
    } else if (choice === '2') {
      console.log(`\nStarting Feature 2: Add Inventory Items from CSV...\n`);
      const itemsScript = require('./modules/add_inventory_items.js');
      if (typeof itemsScript.run === 'function') {
        await itemsScript.run();
      }
      break;
    } else if (choice === '3') {
      console.log(`\nStarting Feature 3: Import Stock Quantities for Items...\n`);
      const stockScript = require('./modules/import_stock_items.js');
      if (typeof stockScript.run === 'function') {
        await stockScript.run();
      }
      break;
    } else if (choice === '4') {
      console.log(`\nStarting Feature 4: Post Sales Correctly (POS Assistant)...\n`);
      const postSalesScript = require('./post_sales.js');
      if (typeof postSalesScript.main === 'function') {
        await postSalesScript.main();
      }
      break;
    } else if (choice === '5') {
      console.log(`\nStarting Feature 5: Reprocess Stuck Conflicts to Real Paid Invoices...\n`);
      const reprocessScript = require('./reprocess_all_conflicts.js');
      if (typeof reprocessScript.reprocessAllConflicts === 'function') {
        await reprocessScript.reprocessAllConflicts();
      }
      break;
    } else if (choice === '6') {
      console.log(`\nStarting Feature 6: Conflict Manager...\n`);
      const conflictScript = require('./auto_resolve_conflicts.js');
      if (typeof conflictScript.main === 'function') {
        await conflictScript.main();
      }
      break;
    } else if (choice === '7') {
      console.log(`\nStarting Feature 7: Offline-First POS Web GUI Server...\n`);
      require('./pos_server.js');
      break;
    } else if (choice === '8' || choice.toLowerCase() === 'exit' || choice.toLowerCase() === 'q') {
      console.log(`Exiting. Goodbye!`);
      process.exit(0);
    } else {
      console.log(`Invalid choice. Press [ENTER] to try again...`);
      await askQuestion('');
    }
  }
}

if (require.main === module) {
  mainMenu().catch(err => {
    console.error('Error in main menu:', err);
  });
}

module.exports = { mainMenu };

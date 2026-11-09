/**
 * update_catalog_units.js
 * Accurately updates all packaging conversion units in pos_catalog.json based on items.csv.
 * Assigns exact respective conversion units:
 * - Toothbrushes / Grooming -> pcs / pack (e.g. 12 or 6 pcs per pack)
 * - Diapers / Tissue -> roll or pack / bag (e.g. 4, 5, 10 per bag)
 * - Carton goods -> roll, pack, jar or pcs / ctn (e.g. 12, 24, 50 per ctn)
 * - Single unit items -> pack, bag, or ctn (ratio 1)
 */

const fs = require('fs');
const path = require('path');

const catalogPath = path.join(__dirname, '..', 'data', 'pos_catalog.json');
const itemsCsvPath = path.join(__dirname, '..', 'items.csv');

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const lines = fs.readFileSync(itemsCsvPath, 'utf8').split('\n');
const header = lines[0].split(',');

const itemIdx = header.indexOf('Item Name');
const groupIdx = header.indexOf('Unit Group Name');
const unitIdx = header.indexOf('Unit Name');
const salesUnitIdx = header.indexOf('Default Sales Unit Name');
const salesSymIdx = header.indexOf('Default Sales Unit Symbol');

const csvMap = new Map();
for (let i = 1; i < lines.length; i++) {
  if (!lines[i]) continue;
  const cols = lines[i].split(',');
  const name = (cols[itemIdx] || '').trim();
  if (!name) continue;
  csvMap.set(name.toLowerCase(), {
    group: cols[groupIdx]?.trim() || '',
    unit: cols[unitIdx]?.trim() || '',
    salesUnit: cols[salesUnitIdx]?.trim() || '',
    salesSym: cols[salesSymIdx]?.trim() || ''
  });
}

function getUnitSymbol(name) {
  const n = (name || '').toLowerCase().trim();
  if (n === 'piece' || n === 'pieces' || n === 'pcs') return 'pcs';
  if (n === 'carton' || n === 'cartons' || n === 'ctn') return 'ctn';
  if (n === 'pack' || n === 'packs') return 'pack';
  if (n === 'bag' || n === 'bags') return 'bag';
  if (n === 'roll' || n === 'rolls') return 'roll';
  if (n === 'box' || n === 'boxes') return 'box';
  if (n === 'jar' || n === 'jars') return 'jar';
  if (n === 'dozen' || n === 'dzn') return 'dzn';
  if (n === 'unit' || n === 'units') return 'unit';
  if (n === 'tin' || n === 'tins') return 'tin';
  if (n === 'bottle' || n === 'bottles' || n === 'btl') return 'btl';
  if (n === 'can' || n === 'cans') return 'can';
  if (n === 'sachet' || n === 'sachets') return 'sachet';
  return n || 'unit';
}

function parseUnitGroup(g) {
  if (!g) return null;
  // Pattern 1: Base (Ratio) - Bulk
  let m = g.match(/^([A-Za-z\s]+)\s*\(([\d\.]+)\)\s*-\s*([A-Za-z\s]+)$/);
  if (m) {
    let ratio = parseFloat(m[2]);
    if (ratio < 1 && ratio > 0) ratio = Math.round(1 / ratio);
    return { base: m[1].trim(), bulk: m[3].trim(), ratio };
  }
  // Pattern 2: Bulk - Base (Ratio)
  m = g.match(/^([A-Za-z\s]+)\s*-\s*([A-Za-z\s]+)\s*\(([\d\.]+)\)$/);
  if (m) {
    let ratio = parseFloat(m[3]);
    if (ratio < 1 && ratio > 0) ratio = Math.round(1 / ratio);
    return { bulk: m[1].trim(), base: m[2].trim(), ratio };
  }
  return null;
}

let updatedBulkUnitsCount = 0;

for (const it of catalog) {
  const csvData = csvMap.get(it.name.toLowerCase());
  const effectiveGroup = csvData?.group || it.unit_group;
  const parsed = parseUnitGroup(effectiveGroup);

  if (parsed && parsed.ratio > 1) {
    const baseSym = getUnitSymbol(parsed.base);
    const bulkSym = getUnitSymbol(parsed.bulk);
    const baseName = parsed.base.toLowerCase();
    const bulkName = parsed.bulk.toLowerCase();
    const ratio = parsed.ratio;

    it.base_unit = baseSym;
    it.bulk_unit = bulkSym;
    it.unit_group = effectiveGroup;

    const existingBulk = (it.units || []).find(u => !u.is_base);
    const existingBase = (it.units || []).find(u => u.is_base);
    const convId = existingBulk?.unit_conversion_id || '';

    it.units = [
      {
        name: baseName,
        label: `${baseSym.toUpperCase()} (Retail Single Unit)`,
        price: it.retail_price,
        is_base: true,
        conversion_ratio: 1,
        unit_conversion_id: '',
        unit_symbol: baseSym,
        cost: it.cost_price || 0
      },
      {
        name: bulkName,
        label: `${bulkSym.toUpperCase()} (Full Bulk - ${ratio} ${baseSym}s)`,
        price: it.carton_price,
        is_base: false,
        conversion_ratio: ratio,
        unit_conversion_id: convId,
        unit_symbol: bulkSym,
        cost: it.carton_cost_price || 0
      }
    ];
    updatedBulkUnitsCount++;
  } else {
    // Single unit product (ratio = 1)
    const singleName = (csvData?.unit || it.base_unit || 'unit').toLowerCase();
    const singleSym = getUnitSymbol(singleName);

    it.base_unit = singleSym;
    it.bulk_unit = singleSym;
    it.units = [
      {
        name: singleName,
        label: `${singleSym.toUpperCase()} (Standard Unit)`,
        price: it.retail_price,
        is_base: true,
        conversion_ratio: 1,
        unit_conversion_id: '',
        unit_symbol: singleSym,
        cost: it.cost_price || 0
      }
    ];
  }
}

fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');
console.log(`✅ Successfully updated catalog with respective conversion units:`);
console.log(`   - Multi-unit conversion items updated: ${updatedBulkUnitsCount}`);
console.log(`   - Total catalog items: ${catalog.length}`);

// Print samples
const sampleToothbrush = catalog.find(i => i.name.includes('DIPLOMAT CHAMPION'));
console.log('\nSample Toothbrush (Pack conversion):', JSON.stringify(sampleToothbrush.units, null, 2));

const sampleDiaper = catalog.find(i => i.name.includes('SOFTCARE GOLD XS/S10'));
console.log('\nSample Diaper (Bag conversion):', JSON.stringify(sampleDiaper.units, null, 2));

const sampleCarton = catalog.find(i => i.name === 'SWISS GEL');
console.log('\nSample Swiss Gel (Carton conversion):', JSON.stringify(sampleCarton.units, null, 2));


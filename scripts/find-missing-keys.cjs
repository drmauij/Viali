const fs = require('fs');
const path = require('path');

// 1. Recursively find all .tsx and .ts files
function findFiles(dir, ext) {
  let results = [];
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory() && item.name !== 'node_modules') {
      results.push(...findFiles(fullPath, ext));
    } else if (ext.some(e => item.name.endsWith(e))) {
      results.push(fullPath);
    }
  }
  return results;
}

const files = findFiles('client/src', ['.tsx', '.ts']);

// 2. Extract all t('key', 'fallback') patterns
const keyMap = new Map(); // key -> fallback

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');

  // t('key', 'fallback') - basic pattern
  const re1 = /t\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = re1.exec(content)) !== null) {
    if (!keyMap.has(match[1])) {
      keyMap.set(match[1], match[2]);
    }
  }

  // t('key', { defaultValue: 'fallback' })
  const re2 = /t\(\s*['"]([^'"]+)['"]\s*,\s*\{[^}]*defaultValue:\s*['"]([^'"]+)['"]/g;
  while ((match = re2.exec(content)) !== null) {
    if (!keyMap.has(match[1])) {
      keyMap.set(match[1], match[2]);
    }
  }
}

// 3. Load de.json and en.json
const de = JSON.parse(fs.readFileSync('client/src/i18n/locales/de.json', 'utf8'));
const en = JSON.parse(fs.readFileSync('client/src/i18n/locales/en.json', 'utf8'));

// Helper: get nested key
function getNestedKey(obj, keyPath) {
  const parts = keyPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

// 4. Find missing keys
const missingFromDe = [];
const missingFromEn = [];
for (const [key, fallback] of keyMap) {
  if (getNestedKey(de, key) === undefined) {
    missingFromDe.push({ key, fallback });
  }
  if (getNestedKey(en, key) === undefined) {
    missingFromEn.push({ key, fallback });
  }
}

console.log('=== STATISTICS ===');
console.log('Total files scanned:', files.length);
console.log('Total t() keys with fallback:', keyMap.size);
console.log('Missing from de.json (with fallback):', missingFromDe.length);
console.log('Missing from en.json (with fallback):', missingFromEn.length);
console.log('');
console.log('=== MISSING FROM de.json ===');
for (const { key, fallback } of missingFromDe.sort((a, b) => a.key.localeCompare(b.key))) {
  console.log(`${key} = ${fallback}`);
}
console.log('');
console.log('=== MISSING FROM en.json ===');
for (const { key, fallback } of missingFromEn.sort((a, b) => a.key.localeCompare(b.key))) {
  console.log(`${key} = ${fallback}`);
}

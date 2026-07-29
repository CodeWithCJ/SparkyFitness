import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(import.meta.dirname, '..');
const auditPath = path.join(mobileRoot, 'mobile-i18n-audit.json');
const outputPath = path.join(mobileRoot, 'src', 'localization', 'mobile.pl.json');
const BATCH_SIZE = 24;
const CONCURRENCY = 5;
const MAX_ATTEMPTS = 4;

if (!fs.existsSync(auditPath)) {
  throw new Error(
    `Run "node scripts/audit-mobile-i18n.mjs mobile-i18n-audit.json" first: ${auditPath}`,
  );
}

const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
const existing = fs.existsSync(outputPath)
  ? JSON.parse(fs.readFileSync(outputPath, 'utf8'))
  : {};
const pending = audit.inventory
  .filter((entry) => !entry.polish && !existing[entry.english])
  .map((entry) => entry.english);

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function restorePlaceholders(source, translated) {
  const expected = [...source.matchAll(/\{\{(value\d+)\}\}/g)].map((match) => match[1]);
  if (expected.length === 0) return translated;

  let fallbackIndex = 0;
  return translated.replace(/\{\{([^}]+)\}\}/g, (_match, placeholder) => {
    const number = String(placeholder).match(/(\d+)/)?.[1];
    const expectedName = number ? `value${number}` : expected[fallbackIndex];
    fallbackIndex += 1;
    return expected.includes(expectedName) ? `{{${expectedName}}}` : _match;
  });
}

async function requestTranslation(text, attempt = 1) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'en');
  url.searchParams.set('tl', 'pl');
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'SparkyFitness-mobile-i18n-sync/1.0',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    return payload[0].map((segment) => segment[0]).join('');
  } catch (error) {
    if (attempt >= MAX_ATTEMPTS) throw error;
    await delay(500 * 2 ** (attempt - 1));
    return requestTranslation(text, attempt + 1);
  }
}

async function translateBatch(batch) {
  const translated = await requestTranslation(batch.join('\n'));
  const lines = translated.split('\n').map((line) => line.trim());
  if (lines.length === batch.length && lines.every(Boolean)) {
    return lines;
  }

  return Promise.all(batch.map((text) => requestTranslation(text)));
}

const batches = chunks(pending, BATCH_SIZE);
let cursor = 0;
let completed = 0;

async function worker() {
  while (cursor < batches.length) {
    const batchIndex = cursor;
    cursor += 1;
    const batch = batches[batchIndex];
    const translations = await translateBatch(batch);
    batch.forEach((english, index) => {
      existing[english] = restorePlaceholders(english, translations[index].trim());
    });
    completed += batch.length;
    console.log(`Translated ${completed}/${pending.length}`);
  }
}

await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, batches.length) }, () => worker()),
);

for (const [english, polish] of Object.entries(existing)) {
  existing[english] = restorePlaceholders(english, polish);
}

const sorted = Object.fromEntries(
  Object.entries(existing).sort(([left], [right]) => left.localeCompare(right)),
);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`Wrote ${Object.keys(sorted).length} mobile translations to ${outputPath}`);

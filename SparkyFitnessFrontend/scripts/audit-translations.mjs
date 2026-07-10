import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const isRecord = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const flattenCatalog = (catalog, prefix = '', messages = new Map()) => {
  for (const [key, value] of Object.entries(catalog)) {
    const messageKey = prefix ? `${prefix}.${key}` : key;
    if (isRecord(value)) {
      flattenCatalog(value, messageKey, messages);
    } else {
      messages.set(messageKey, value);
    }
  }
  return messages;
};

const extractInterpolationVariables = (message) => {
  if (typeof message !== 'string') return [];

  const variables = new Set();
  for (const match of message.matchAll(/{{\s*([^,}\s]+)[^}]*}}/g)) {
    if (match[1]) variables.add(match[1]);
  }
  return [...variables].sort();
};

const arraysEqual = (left, right) =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

export const compareTranslationCatalogs = (source, target) => {
  const sourceMessages = flattenCatalog(source);
  const targetMessages = flattenCatalog(target);
  const sourceKeys = [...sourceMessages.keys()].sort();
  const targetKeys = [...targetMessages.keys()].sort();
  const missingKeys = sourceKeys.filter((key) => !targetMessages.has(key));
  const extraKeys = targetKeys.filter((key) => !sourceMessages.has(key));
  const interpolationMismatches = [];

  for (const key of sourceKeys) {
    if (!targetMessages.has(key)) continue;
    const sourceVariables = extractInterpolationVariables(
      sourceMessages.get(key)
    );
    const targetVariables = extractInterpolationVariables(
      targetMessages.get(key)
    );
    if (!arraysEqual(sourceVariables, targetVariables)) {
      interpolationMismatches.push({
        key,
        sourceVariables,
        targetVariables,
      });
    }
  }

  const translatedMessageCount = sourceMessages.size - missingKeys.length;
  const coveragePercent = sourceMessages.size
    ? Number(((translatedMessageCount / sourceMessages.size) * 100).toFixed(1))
    : 100;

  return {
    sourceMessageCount: sourceMessages.size,
    targetMessageCount: targetMessages.size,
    translatedMessageCount,
    coveragePercent,
    missingKeys,
    extraKeys,
    interpolationMismatches,
  };
};

const readCatalog = async (filePath) =>
  JSON.parse(await readFile(filePath, 'utf8'));

const printKeyList = (label, keys) => {
  if (!keys.length) return;
  console.error(`${label} (${keys.length}):`);
  for (const key of keys.slice(0, 20)) console.error(`  - ${key}`);
  if (keys.length > 20) console.error(`  ...and ${keys.length - 20} more`);
};

const runCli = async () => {
  const args = process.argv.slice(2);
  const locale = args.find((arg) => !arg.startsWith('--')) || 'ar';
  const asJson = args.includes('--json');
  const localesDirectory = path.join(process.cwd(), 'public', 'locales');
  const sourcePath = path.join(localesDirectory, 'en', 'translation.json');
  const targetPath = path.join(localesDirectory, locale, 'translation.json');
  const result = compareTranslationCatalogs(
    await readCatalog(sourcePath),
    await readCatalog(targetPath)
  );

  if (asJson) {
    console.log(JSON.stringify({ locale, ...result }, null, 2));
  } else {
    console.log(
      `${locale}: ${result.translatedMessageCount}/${result.sourceMessageCount} messages (${result.coveragePercent}%)`
    );
    printKeyList('Missing keys', result.missingKeys);
    printKeyList('Extra keys', result.extraKeys);
    printKeyList(
      'Interpolation mismatches',
      result.interpolationMismatches.map(({ key }) => key)
    );
  }

  if (result.missingKeys.length || result.interpolationMismatches.length) {
    process.exitCode = 1;
  }
};

const isCli =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isCli) {
  await runCli();
}

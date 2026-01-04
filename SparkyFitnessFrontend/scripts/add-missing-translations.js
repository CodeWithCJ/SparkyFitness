#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Recursively finds missing keys in target object compared to source object
 * and adds them with [TODO] prefix to the English value
 */
function addMissingKeys(source, target) {
  const result = { ...target };
  let addedCount = 0;

  for (const key in source) {
    if (!(key in target)) {
      // Key is missing in target
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        // It's a nested object, recursively add missing keys
        const nested = addMissingKeys(source[key], {});
        result[key] = nested.object;
        addedCount += nested.count;
      } else {
        // It's a leaf value, add it with [TODO] prefix
        result[key] = `[TODO] ${source[key]}`;
        addedCount++;
      }
    } else {
      // Key exists, check if it's a nested object
      if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
        if (typeof target[key] === 'object' && target[key] !== null && !Array.isArray(target[key])) {
          // Both are objects, recursively process
          const nested = addMissingKeys(source[key], target[key]);
          result[key] = nested.object;
          addedCount += nested.count;
        } else {
          // Target has this key but it's not an object, replace with nested structure
          const nested = addMissingKeys(source[key], {});
          result[key] = nested.object;
          addedCount += nested.count;
        }
      }
      // If source[key] is not an object, keep target[key] as is
    }
  }

  return { object: result, count: addedCount };
}

/**
 * Formats JSON with consistent indentation (2 spaces)
 */
function formatJSON(obj) {
  return JSON.stringify(obj, null, 2) + '\n';
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node add-missing-translations.js <language-code>');
    console.error('Example: node add-missing-translations.js fr');
    process.exit(1);
  }

  const targetLang = args[0];
  
  // Paths to translation files
  const baseDir = path.join(__dirname, '..');
  const localesDir = path.join(baseDir, 'public', 'locales');
  const enFilePath = path.join(localesDir, 'en', 'translation.json');
  const targetFilePath = path.join(localesDir, targetLang, 'translation.json');

  // Check if English file exists
  if (!fs.existsSync(enFilePath)) {
    console.error(`Error: English translation file not found at ${enFilePath}`);
    process.exit(1);
  }

  // Check if target language directory exists
  const targetLangDir = path.join(localesDir, targetLang);
  if (!fs.existsSync(targetLangDir)) {
    console.error(`Error: Language directory not found: ${targetLangDir}`);
    process.exit(1);
  }

  // Read English translation file (source of truth)
  let enTranslations;
  try {
    const enContent = fs.readFileSync(enFilePath, 'utf-8');
    enTranslations = JSON.parse(enContent);
  } catch (error) {
    console.error(`Error reading English translation file: ${error.message}`);
    process.exit(1);
  }

  // Read target language translation file (or start with empty object)
  let targetTranslations = {};
  if (fs.existsSync(targetFilePath)) {
    try {
      const targetContent = fs.readFileSync(targetFilePath, 'utf-8');
      targetTranslations = JSON.parse(targetContent);
    } catch (error) {
      console.error(`Error reading target language translation file: ${error.message}`);
      process.exit(1);
    }
  } else {
    console.log(`Target translation file not found, creating new file: ${targetFilePath}`);
  }

  // Add missing keys
  console.log(`Checking for missing keys in ${targetLang} translation file...`);
  const result = addMissingKeys(enTranslations, targetTranslations);

  // Write the updated translation file
  try {
    const formatted = formatJSON(result.object);
    fs.writeFileSync(targetFilePath, formatted, 'utf-8');
    console.log(`✓ Successfully updated ${targetLang}/translation.json`);
    console.log(`✓ Added ${result.count} missing translation key(s) with [TODO] prefix`);
  } catch (error) {
    console.error(`Error writing translation file: ${error.message}`);
    process.exit(1);
  }
}

main();

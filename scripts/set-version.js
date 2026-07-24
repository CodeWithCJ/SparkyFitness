#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const newVersion = process.argv[2];
if (!newVersion) {
  console.error('Error: Please provide a version number.');
  console.error('Usage: pnpm run set-version <version>');
  console.error('Example: pnpm run set-version 1.6.0');
  process.exit(1);
}

const cleanVersion = newVersion.replace(/^v/, '');

const targetFiles = [
  'SparkyFitnessServer/package.json',
  'SparkyFitnessFrontend/package.json',
  'SparkyFitnessMobile/package.json',
  'shared/package.json',
];

let updatedCount = 0;

for (const relPath of targetFiles) {
  const fullPath = path.join(rootDir, relPath);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const json = JSON.parse(content);
    json.version = cleanVersion;
    fs.writeFileSync(fullPath, JSON.stringify(json, null, 2) + '\n');
    console.log(`✓ Updated ${relPath} -> ${cleanVersion}`);
    updatedCount++;
  } else {
    console.warn(`⚠ Skipping missing file: ${relPath}`);
  }
}

// Also update SparkyFitnessMobile/app.json (expo.version)
const appJsonPath = path.join(rootDir, 'SparkyFitnessMobile/app.json');
if (fs.existsSync(appJsonPath)) {
  const content = fs.readFileSync(appJsonPath, 'utf8');
  const json = JSON.parse(content);
  if (json.expo) {
    json.expo.version = cleanVersion;
    fs.writeFileSync(appJsonPath, JSON.stringify(json, null, 2) + '\n');
    console.log(`✓ Updated SparkyFitnessMobile/app.json (expo.version) -> ${cleanVersion}`);
    updatedCount++;
  }
}

console.log(`\nSuccessfully updated ${updatedCount} file(s) to version v${cleanVersion}!`);

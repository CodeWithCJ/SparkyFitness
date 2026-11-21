#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distPath = path.join(rootDir, 'dist', 'exercises.json');

if (!fs.existsSync(distPath)) {
  console.log('⚠️  dist/exercises.json not found. Run "npm run build" first.');
  process.exit(1);
}

const exercises = JSON.parse(fs.readFileSync(distPath, 'utf8'));

const args = process.argv.slice(2);

// Help flag
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🏋️  SparkyFitness Exercise Library Inspector CLI

Usage:
  npm run list                    List first 25 exercises
  npm run list -- <query>         Search by name (e.g. "bench press", "squat", "curl")
  npm run list -- --muscle chest  Filter by muscle (chest, lats, biceps, quadriceps, etc.)
  npm run list -- --equipment dumbbell Filter by equipment (barbell, cable, machine, etc.)
  npm run list -- --all           Print all 1,798 exercises
  npm run list -- --stats         Show library breakdown stats

Examples:
  npm run list -- "squat"
  npm run list -- --muscle triceps
  npm run list -- --equipment kettlebells
`);
  process.exit(0);
}

// Stats flag
if (args.includes('--stats')) {
  const stats = {
    total: exercises.length,
    modalities: {},
    equipment: {},
    muscles: {},
  };
  for (const ex of exercises) {
    const mod = ex.taxonomy.modality;
    stats.modalities[mod] = (stats.modalities[mod] || 0) + 1;

    const eq = ex.taxonomy.equipment;
    stats.equipment[eq] = (stats.equipment[eq] || 0) + 1;

    for (const m of ex.taxonomy.primary_muscles || []) {
      stats.muscles[m] = (stats.muscles[m] || 0) + 1;
    }
  }

  console.log('\n📊 Library Statistics (Total: ' + stats.total + ' exercises):\n');
  console.log('Modalities:');
  for (const [k, v] of Object.entries(stats.modalities)) {
    console.log(`  • ${k.padEnd(20)}: ${v}`);
  }
  console.log('\nEquipment:');
  for (const [k, v] of Object.entries(stats.equipment)) {
    console.log(`  • ${k.padEnd(20)}: ${v}`);
  }
  console.log('\nPrimary Muscles:');
  for (const [k, v] of Object.entries(stats.muscles)) {
    console.log(`  • ${k.padEnd(20)}: ${v}`);
  }
  process.exit(0);
}

// Filters
let filterMuscle = null;
let filterEquipment = null;
let showAll = args.includes('--all');
let queryTerms = [];

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--muscle' && args[i + 1]) {
    filterMuscle = args[++i].toLowerCase();
  } else if (args[i] === '--equipment' && args[i + 1]) {
    filterEquipment = args[++i].toLowerCase();
  } else if (args[i] === '--all') {
    showAll = true;
  } else if (!args[i].startsWith('--')) {
    queryTerms.push(args[i].toLowerCase());
  }
}

const query = queryTerms.join(' ').trim();

let results = exercises.filter(ex => {
  if (filterMuscle) {
    const hasPrimary = ex.taxonomy.primary_muscles?.some(m => m.toLowerCase().includes(filterMuscle));
    const hasSecondary = ex.taxonomy.secondary_muscles?.some(m => m.toLowerCase().includes(filterMuscle));
    if (!hasPrimary && !hasSecondary) return false;
  }
  if (filterEquipment) {
    if (!ex.taxonomy.equipment?.toLowerCase().includes(filterEquipment)) return false;
  }
  if (query) {
    const nameMatch = ex.name.toLowerCase().includes(query);
    const aliasMatch = ex.aliases?.some(a => a.toLowerCase().includes(query));
    const idMatch = ex.id.toLowerCase().includes(query);
    if (!nameMatch && !aliasMatch && !idMatch) return false;
  }
  return true;
});

console.log(`\nFound ${results.length} exercise(s)${query ? ` matching "${query}"` : ''}${filterMuscle ? ` [muscle: ${filterMuscle}]` : ''}${filterEquipment ? ` [equipment: ${filterEquipment}]` : ''}:\n`);

const limit = showAll ? results.length : 25;
const displayed = results.slice(0, limit);

displayed.forEach((ex, idx) => {
  const num = `[${idx + 1}]`.padStart(5);
  const idStr = `${ex.numeric_id}`.padEnd(7);
  const nameStr = ex.name.padEnd(35);
  const equipStr = `${ex.taxonomy.equipment}`.padEnd(14);
  const musclesStr = `(${ex.taxonomy.primary_muscles.join(', ')})`;
  const biomech = [ex.taxonomy.force, ex.taxonomy.mechanic, ex.taxonomy.level].filter(Boolean).join(' • ');

  console.log(`${num} ${idStr} ${nameStr} | ${equipStr} | ${musclesStr}`);
  if (biomech) {
    console.log(`           Biomech: ${biomech}`);
  }
});

if (results.length > limit) {
  console.log(`\n... and ${results.length - limit} more exercises. Use --all to view all, or narrow with a search term.`);
}
console.log();

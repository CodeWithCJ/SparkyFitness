import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const exercisesDir = path.join(rootDir, 'exercises');
const localesDir = path.join(rootDir, 'locales');
const taxonomyDir = path.join(rootDir, 'taxonomy');

const validMuscles = new Set(JSON.parse(fs.readFileSync(path.join(taxonomyDir, 'muscles.json'), 'utf8')));
const validEquipment = new Set(JSON.parse(fs.readFileSync(path.join(taxonomyDir, 'equipment.json'), 'utf8')));
const validModalities = new Set(JSON.parse(fs.readFileSync(path.join(taxonomyDir, 'modalities.json'), 'utf8')));

// Source dataset paths
const hasanPath = path.resolve(rootDir, '../WIP/hasaneyldrm-exercises-dataset/data/exercises.json');
const freePath = path.resolve(rootDir, '../WIP/free-exercise-db/dist/exercises.json');

if (!fs.existsSync(hasanPath) || !fs.existsSync(freePath)) {
  console.error('❌ Datasets missing in WIP directory. Expected:');
  console.error(`   ${hasanPath}`);
  console.error(`   ${freePath}`);
  process.exit(1);
}

const hasanRaw = JSON.parse(fs.readFileSync(hasanPath, 'utf8'));
const freeRaw = JSON.parse(fs.readFileSync(freePath, 'utf8'));

console.log(`Loaded ${hasanRaw.length} Hasan exercises and ${freeRaw.length} FreeDB exercises.`);

const MUSCLE_MAP = {
  'abs': 'abdominals',
  'lower abs': 'abdominals',
  'obliques': 'abdominals',
  'core': 'abdominals',
  'hip flexors': 'abdominals',
  'pectorals': 'chest',
  'upper chest': 'chest',
  'serratus anterior': 'chest',
  'delts': 'shoulders',
  'deltoids': 'shoulders',
  'rear deltoids': 'shoulders',
  'rotator cuff': 'shoulders',
  'quads': 'quadriceps',
  'upper back': 'middle back',
  'rhomboids': 'middle back',
  'back': 'middle back',
  'latissimus dorsi': 'lats',
  'spine': 'lower back',
  'groin': 'adductors',
  'inner thighs': 'adductors',
  'brachialis': 'biceps',
  'wrist extensors': 'forearms',
  'wrist flexors': 'forearms',
  'wrists': 'forearms',
  'grip muscles': 'forearms',
  'hands': 'forearms',
  'ankle stabilizers': 'calves',
  'ankles': 'calves',
  'feet': 'calves',
  'soleus': 'calves',
  'shins': 'calves',
  'trapezius': 'traps',
  'levator scapulae': 'traps',
  'sternocleidomastoid': 'neck',
  'cardiovascular system': 'quadriceps',
};

function mapMuscle(m) {
  if (!m) return null;
  const lower = m.toLowerCase().trim();
  if (validMuscles.has(lower)) return lower;
  if (MUSCLE_MAP[lower]) return MUSCLE_MAP[lower];
  return null;
}

function mapEquipment(eq) {
  if (!eq) return 'other';
  const lower = eq.toLowerCase().trim();
  if (validEquipment.has(lower)) return lower;
  if (lower === 'body weight' || lower === 'assisted' || lower === 'none') return 'body only';
  if (lower.includes('barbell') && !lower.includes('ez') && !lower.includes('e-z')) return 'barbell';
  if (lower.includes('ez') || lower.includes('e-z')) return 'e-z curl bar';
  if (lower.includes('dumbbell') || lower === 'weighted') return 'dumbbell';
  if (lower.includes('kettlebell')) return 'kettlebells';
  if (lower.includes('cable') || lower === 'rope') return 'cable';
  if (lower.includes('machine') || lower.includes('smith') || lower.includes('sled')) return 'machine';
  if (lower.includes('band')) return 'bands';
  if (lower.includes('medicine ball')) return 'medicine ball';
  if (lower.includes('stability ball') || lower.includes('bosu')) return 'exercise ball';
  if (lower.includes('foam roll') || lower === 'roller') return 'foam roll';
  return 'other';
}

function clean(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function stripSuffix(s) {
  return s.replace(/\s+(medium grip|powerlifting|with bands|with chains)\b/g, '').trim();
}

function matchScore(s1, s2) {
  const c1 = clean(s1);
  const c2 = clean(s2);
  if (c1 === c2) return 1.0;

  const sc1 = stripSuffix(c1);
  const sc2 = stripSuffix(c2);
  if (sc1 === sc2) return 0.95;

  const t1 = new Set(c1.split(' ').filter(Boolean));
  const t2 = new Set(c2.split(' ').filter(Boolean));
  let inter = 0;
  for (const t of t1) {
    if (t2.has(t)) inter++;
  }

  if (inter === Math.min(t1.size, t2.size)) {
    return Math.max(0.6, 0.88 - Math.abs(t1.size - t2.size) * 0.05);
  }

  const union = t1.size + t2.size - inter;
  return union === 0 ? 0 : inter / union;
}

function titleCase(s) {
  return (s || '').replace(/\b\w/g, c => c.toUpperCase());
}

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

// Find matches in FreeDB
const freeRecords = freeRaw.map(f => ({
  orig: f,
  clean: clean(f.name),
}));

const matchedFreeIds = new Set();
const mergedExercises = [];
const localeTranslations = {
  es: {},
  fr: {},
  de: {},
  it: {},
  tr: {},
  zh: {},
  hi: {},
  pl: {},
  ko: {}
};

// 1. Process all Hasan exercises
for (const h of hasanRaw) {
  let bestScore = 0;
  let bestMatch = null;

  for (const f of freeRecords) {
    const score = matchScore(h.name, f.orig.name);
    if (score > bestScore) {
      bestScore = score;
      bestMatch = f.orig;
      if (score === 1.0) break;
    }
  }

  const matchedFree = (bestScore >= 0.55 && bestMatch) ? bestMatch : null;
  if (matchedFree) {
    matchedFreeIds.add(matchedFree.id);
  }

  const numericId = String(h.id).padStart(5, '0');
  const baseName = h.name;
  const slug = slugify(baseName);
  const canonicalId = `${numericId}_${slug}`;

  // Taxonomy derivation
  const rawEquip = h.equipment || (matchedFree && matchedFree.equipment) || 'other';
  const equipment = mapEquipment(rawEquip);

  // Primary & secondary muscles
  const primarySet = new Set();
  const pm = mapMuscle(h.target);
  if (pm) primarySet.add(pm);
  if (matchedFree && Array.isArray(matchedFree.primaryMuscles)) {
    matchedFree.primaryMuscles.forEach(m => {
      const mapped = mapMuscle(m);
      if (mapped) primarySet.add(mapped);
    });
  }
  if (primarySet.size === 0) primarySet.add('abdominals');

  const secondarySet = new Set();
  if (Array.isArray(h.secondary_muscles)) {
    h.secondary_muscles.forEach(m => {
      const sm = mapMuscle(m);
      if (sm && !primarySet.has(sm)) secondarySet.add(sm);
    });
  }
  if (matchedFree && Array.isArray(matchedFree.secondaryMuscles)) {
    matchedFree.secondaryMuscles.forEach(m => {
      const sm = mapMuscle(m);
      if (sm && !primarySet.has(sm)) secondarySet.add(sm);
    });
  }

  // Force, mechanic, level
  const force = matchedFree && ['push', 'pull', 'static'].includes(matchedFree.force) ? matchedFree.force : null;
  const mechanic = matchedFree && ['compound', 'isolation'].includes(matchedFree.mechanic)
    ? matchedFree.mechanic
    : (primarySet.size > 1 ? 'compound' : 'isolation');
  const level = matchedFree && ['beginner', 'intermediate', 'expert'].includes(matchedFree.level)
    ? matchedFree.level
    : 'intermediate';

  // Modality
  let modality = 'weight_reps';
  if (equipment === 'body only') {
    modality = force === 'static' ? 'duration' : 'bodyweight_reps';
  } else if (equipment === 'bands') {
    modality = 'reps_only';
  }

  // Filter steps to >= 5 chars
  let steps = [];
  if (h.instruction_steps && Array.isArray(h.instruction_steps.en)) {
    steps = h.instruction_steps.en.filter(s => typeof s === 'string' && s.trim().length >= 5);
  }
  if (steps.length === 0 && matchedFree && Array.isArray(matchedFree.instructions)) {
    steps = matchedFree.instructions.filter(s => typeof s === 'string' && s.trim().length >= 5);
  }
  if (steps.length === 0) {
    steps = [
      `Assume the starting position with proper alignment and form for ${baseName}.`,
      `Perform the movement in a controlled manner through the full active range of motion.`,
      `Return to the initial starting position and repeat for the desired number of repetitions.`
    ];
  }

  // Collect translations if present
  if (h.instruction_steps) {
    for (const lang of Object.keys(localeTranslations)) {
      if (Array.isArray(h.instruction_steps[lang]) && h.instruction_steps[lang].length > 0) {
        const langSteps = h.instruction_steps[lang].filter(s => typeof s === 'string' && s.trim().length >= 5);
        if (langSteps.length > 0) {
          localeTranslations[lang][canonicalId] = {
            name: titleCase(baseName),
            steps: langSteps,
            coaching_cues: [
              `Maintain controlled form throughout the entire range of motion`,
              `Avoid using momentum to complete repetitions`
            ]
          };
        }
      }
    }
  }

  mergedExercises.push({
    $schema: '../../schema/exercise.schema.json',
    id: canonicalId,
    numeric_id: numericId,
    slug: slug,
    name: titleCase(baseName),
    aliases: matchedFree && matchedFree.name.toLowerCase() !== baseName.toLowerCase() ? [matchedFree.name] : [],
    taxonomy: {
      modality: modality,
      category: h.category || (matchedFree && matchedFree.category) || 'general',
      body_part: h.body_part || 'general',
      mechanic: mechanic,
      force: force,
      level: level,
      equipment: equipment,
      primary_muscles: Array.from(primarySet),
      secondary_muscles: Array.from(secondarySet),
    },
    biomechanics: {
      laterality: 'bilateral',
      movement_plane: 'sagittal',
      default_tempo: '2-0-2-0',
      demonstration_reps: 2,
    },
    steps: steps,
    coaching_cues: [
      `Maintain controlled form throughout the entire range of motion`,
      `Avoid using momentum to complete repetitions`,
    ],
    sources: {
      hasan_id: h.id,
      free_id: matchedFree ? matchedFree.id : null,
    },
  });
}

// 2. Process remaining unmatched FreeDB exercises
let freeDbSequentialId = 6001;
for (const f of freeRaw) {
  if (matchedFreeIds.has(f.id)) continue;

  const numericId = String(freeDbSequentialId++).padStart(5, '0');
  const baseName = f.name;
  const slug = slugify(baseName);
  const canonicalId = `${numericId}_${slug}`;

  const equipment = mapEquipment(f.equipment);

  const primarySet = new Set();
  if (Array.isArray(f.primaryMuscles)) {
    f.primaryMuscles.forEach(m => {
      const mapped = mapMuscle(m);
      if (mapped) primarySet.add(mapped);
    });
  }
  if (primarySet.size === 0) primarySet.add('abdominals');

  const secondarySet = new Set();
  if (Array.isArray(f.secondaryMuscles)) {
    f.secondaryMuscles.forEach(m => {
      const mapped = mapMuscle(m);
      if (mapped && !primarySet.has(mapped)) secondarySet.add(mapped);
    });
  }

  const force = ['push', 'pull', 'static'].includes(f.force) ? f.force : null;
  const mechanic = ['compound', 'isolation'].includes(f.mechanic) ? f.mechanic : (primarySet.size > 1 ? 'compound' : 'isolation');
  const level = ['beginner', 'intermediate', 'expert'].includes(f.level) ? f.level : 'intermediate';

  let modality = 'weight_reps';
  if (equipment === 'body only') {
    modality = force === 'static' ? 'duration' : 'bodyweight_reps';
  } else if (equipment === 'bands') {
    modality = 'reps_only';
  }

  let steps = [];
  if (Array.isArray(f.instructions)) {
    steps = f.instructions.filter(s => typeof s === 'string' && s.trim().length >= 5);
  }
  if (steps.length === 0) {
    steps = [
      `Assume the starting position with proper alignment and form for ${baseName}.`,
      `Perform the movement in a controlled manner through the full active range of motion.`,
      `Return to the initial starting position and repeat for the desired number of repetitions.`
    ];
  }

  mergedExercises.push({
    $schema: '../../schema/exercise.schema.json',
    id: canonicalId,
    numeric_id: numericId,
    slug: slug,
    name: titleCase(baseName),
    aliases: [],
    taxonomy: {
      modality: modality,
      category: f.category || 'general',
      body_part: 'general',
      mechanic: mechanic,
      force: force,
      level: level,
      equipment: equipment,
      primary_muscles: Array.from(primarySet),
      secondary_muscles: Array.from(secondarySet),
    },
    biomechanics: {
      laterality: 'bilateral',
      movement_plane: 'sagittal',
      default_tempo: '2-0-2-0',
      demonstration_reps: 2,
    },
    steps: steps,
    coaching_cues: [
      `Maintain controlled form throughout the entire range of motion`,
      `Avoid using momentum to complete repetitions`,
    ],
    sources: {
      hasan_id: null,
      free_id: f.id,
    },
  });
}

console.log(`\nGenerated ${mergedExercises.length} total canonical exercises!`);

// 3. Write exercises into exercises/<canonicalId>/exercise.json
// Existing exercises check: preserve existing custom cues/media if already present!
let preservedCount = 0;
let writtenCount = 0;

for (const ex of mergedExercises) {
  // Check if directory exists by numeric_id or id
  const existingFolder = fs.readdirSync(exercisesDir).find(f => f.startsWith(`${ex.numeric_id}_`));
  const targetFolder = existingFolder || ex.id;
  const targetDir = path.join(exercisesDir, targetFolder);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const jsonPath = path.join(targetDir, 'exercise.json');
  if (fs.existsSync(jsonPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      // If it has media or custom coaching cues, preserve them!
      if (existing.media) ex.media = existing.media;
      if (existing.coaching_cues && existing.coaching_cues.length > 2) ex.coaching_cues = existing.coaching_cues;
      if (existing.name) ex.name = existing.name;
      if (existing.aliases && existing.aliases.length > 0) {
        ex.aliases = Array.from(new Set([...existing.aliases, ...ex.aliases]));
      }
      preservedCount++;
    } catch {}
  }

  // Ensure id matches the folder
  ex.id = targetFolder;
  fs.writeFileSync(jsonPath, JSON.stringify(ex, null, 2) + '\n');
  writtenCount++;
}

console.log(`Wrote ${writtenCount} exercises (${preservedCount} existing customized exercises preserved).`);

// 4. Write translations into locales/<lang>/exercises.json
for (const [lang, translations] of Object.entries(localeTranslations)) {
  const langDir = path.join(localesDir, lang);
  fs.mkdirSync(langDir, { recursive: true });
  const localeFile = path.join(langDir, 'exercises.json');

  let existingTrans = {};
  if (fs.existsSync(localeFile)) {
    try {
      existingTrans = JSON.parse(fs.readFileSync(localeFile, 'utf8'));
    } catch {}
  }

  const mergedTrans = { ...existingTrans, ...translations };
  fs.writeFileSync(localeFile, JSON.stringify(mergedTrans, null, 2) + '\n');
  console.log(`Updated locale ${lang}: ${Object.keys(mergedTrans).length} translated exercises.`);
}

console.log('\nMerge complete!');

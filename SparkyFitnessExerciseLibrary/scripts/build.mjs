import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const exercisesDir = path.join(rootDir, 'exercises');
const localesDir = path.join(rootDir, 'locales');
const distDir = path.join(rootDir, 'dist');
const taxonomyDir = path.join(rootDir, 'taxonomy');

const validMuscles = new Set(JSON.parse(fs.readFileSync(path.join(taxonomyDir, 'muscles.json'), 'utf8')));
const validEquipment = new Set(JSON.parse(fs.readFileSync(path.join(taxonomyDir, 'equipment.json'), 'utf8')));
const validModalities = new Set(JSON.parse(fs.readFileSync(path.join(taxonomyDir, 'modalities.json'), 'utf8')));

console.log('🏋️  Building SparkyFitness Exercise Library...\n');

if (!fs.existsSync(exercisesDir)) {
  console.error(`❌ Exercises directory not found at ${exercisesDir}`);
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });

const exerciseFolders = fs
  .readdirSync(exercisesDir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name)
  .sort();

const allExercises = [];
const enLocaleEntries = {};
const stats = {
  total: 0,
  modalities: {},
  equipment: {},
  muscles: {},
};

function discoverMedia(folder, exercisePath, overrides = {}) {
  const files = fs.readdirSync(exercisePath);

  // 1. Vertical Video (9:16)
  let videoVertical = overrides?.video_vertical_path || null;
  if (!videoVertical) {
    const match = files.find(f => f.endsWith('.mp4') && (f.includes('_9_16') || f.includes('_vertical')));
    if (match) videoVertical = match;
  }

  // 2. Horizontal Video (16:9)
  let videoHorizontal = overrides?.video_horizontal_path || null;
  if (!videoHorizontal) {
    const match = files.find(f => f.endsWith('.mp4') && (f.includes('_16_9') || f.includes('_horizontal')));
    if (match) videoHorizontal = match;
  }

  // 3. Default Video
  let videoDefault = overrides?.video_path || null;
  if (!videoDefault) {
    const allMp4s = files.filter(f => f.endsWith('.mp4') && !f.startsWith('_temp_'));
    if (allMp4s.length === 1) {
      videoDefault = allMp4s[0];
    } else if (videoVertical) {
      videoDefault = videoVertical;
    } else if (videoHorizontal) {
      videoDefault = videoHorizontal;
    }
  }

  // 4. Static Card Thumbnail (_thumb.webp, _thumb.jpg, or single static image)
  let thumbnail = overrides?.thumbnail_path || null;
  if (!thumbnail) {
    const match = files.find(f => f.includes('_thumb.') && (f.endsWith('.webp') || f.endsWith('.jpg') || f.endsWith('.png')));
    if (match) {
      thumbnail = match;
    } else {
      const generic = files.find(f => (f.endsWith('.webp') || f.endsWith('.jpg') || f.endsWith('.png')) && !f.includes('_9_16') && !f.includes('_16_9') && !f.startsWith('_temp_'));
      if (generic) thumbnail = generic;
    }
  }

  // 5. Vertical Animation (_9_16.webp)
  let animVertical = overrides?.animation_vertical_path || null;
  if (!animVertical) {
    const match = files.find(f => (f.includes('_9_16.webp') || f.includes('_9_16.gif')) && !f.startsWith('_temp_'));
    if (match) {
      animVertical = match;
    } else if (videoVertical) {
      // If a vertical video is present and there is a matching single animation
      const single = files.find(f => f.endsWith('.webp') && !f.includes('_thumb.') && !f.includes('_16_9') && !f.startsWith('_temp_'));
      if (single) animVertical = single;
    }
  }

  // 6. Horizontal Animation (_16_9.webp)
  let animHorizontal = overrides?.animation_horizontal_path || null;
  if (!animHorizontal) {
    const match = files.find(f => (f.includes('_16_9.webp') || f.includes('_16_9.gif')) && !f.startsWith('_temp_'));
    if (match) animHorizontal = match;
  }

  // 7. Default Animation (WebP or GIF)
  let animation = overrides?.animation_path || null;
  if (!animation) {
    if (animVertical) animation = animVertical;
    else if (animHorizontal) animation = animHorizontal;
    else {
      const match = files.find(f => (f.endsWith('.gif') || (f.endsWith('.webp') && !f.includes('_thumb.'))) && !f.startsWith('_temp_'));
      if (match) animation = match;
    }
  }

  // 8. Static Image (for exercises without video)
  let image = overrides?.image_path || null;
  if (!image && !videoDefault) {
    image = thumbnail;
  }

  const toRelative = (f) => f ? path.posix.join('exercises', folder, f) : null;

  return {
    video_path: toRelative(videoDefault),
    video_vertical_path: toRelative(videoVertical),
    video_horizontal_path: toRelative(videoHorizontal),
    animation_path: toRelative(animation),
    animation_vertical_path: toRelative(animVertical),
    animation_horizontal_path: toRelative(animHorizontal),
    thumbnail_path: toRelative(thumbnail),
    image_path: toRelative(image),
  };
}

for (const folder of exerciseFolders) {
  const jsonPath = path.join(exercisesDir, folder, 'exercise.json');
  if (!fs.existsSync(jsonPath)) {
    console.warn(`⚠️  Skipping ${folder}: missing exercise.json`);
    continue;
  }

  let exercise;
  try {
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    exercise = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Failed parsing JSON in ${folder}:`, err.message);
    process.exit(1);
  }

  // Schema assertions
  if (!exercise.id || !exercise.name || !exercise.taxonomy || !exercise.steps) {
    console.error(`❌ ${folder}/exercise.json is missing required fields (id, name, taxonomy, steps)`);
    process.exit(1);
  }

  if (!/^[0-9]{5}$/.test(exercise.numeric_id)) {
    console.error(`❌ ${folder}/exercise.json numeric_id must be a 5-digit string (e.g. '00001'). Got: '${exercise.numeric_id}'`);
    process.exit(1);
  }

  if (!validModalities.has(exercise.taxonomy.modality)) {
    console.error(`❌ ${folder}/exercise.json invalid modality: '${exercise.taxonomy.modality}'`);
    process.exit(1);
  }

  if (!validEquipment.has(exercise.taxonomy.equipment)) {
    console.error(`❌ ${folder}/exercise.json invalid equipment: '${exercise.taxonomy.equipment}'`);
    process.exit(1);
  }

  for (const muscle of exercise.taxonomy.primary_muscles || []) {
    if (!validMuscles.has(muscle)) {
      console.error(`❌ ${folder}/exercise.json invalid primary muscle: '${muscle}'`);
      process.exit(1);
    }
  }

  for (const muscle of exercise.taxonomy.secondary_muscles || []) {
    if (!validMuscles.has(muscle)) {
      console.error(`❌ ${folder}/exercise.json invalid secondary muscle: '${muscle}'`);
      process.exit(1);
    }
  }

  // Auto-discover media by convention with optional overrides from exercise.json
  const discoveredMedia = discoverMedia(folder, path.join(exercisesDir, folder), exercise.media);

  // Generate continuous instructions from steps for DB backward-compatibility
  const compiledExercise = {
    ...exercise,
    instructions: exercise.steps.join(' '),
    folder: folder,
    media: discoveredMedia,
  };

  allExercises.push(compiledExercise);

  // Collect English locale strings for Weblate template
  enLocaleEntries[exercise.id] = {
    name: exercise.name,
    steps: exercise.steps,
    coaching_cues: exercise.coaching_cues || [],
  };

  // Collect stats
  stats.total += 1;
  const mod = exercise.taxonomy.modality || 'unknown';
  stats.modalities[mod] = (stats.modalities[mod] || 0) + 1;

  const eq = exercise.taxonomy.equipment || 'unknown';
  stats.equipment[eq] = (stats.equipment[eq] || 0) + 1;

  for (const muscle of exercise.taxonomy.primary_muscles || []) {
    stats.muscles[muscle] = (stats.muscles[muscle] || 0) + 1;
  }
}

// 1. Write dist/exercises.json (Consolidated catalog for server/app)
const distPath = path.join(distDir, 'exercises.json');
fs.writeFileSync(distPath, JSON.stringify(allExercises, null, 2), 'utf-8');
console.log(`✅ Generated ${distPath} (${allExercises.length} exercises)`);

// 2. Sync locales/en/exercises.json (Weblate base template)
const enLocalePath = path.join(localesDir, 'en', 'exercises.json');
fs.mkdirSync(path.dirname(enLocalePath), { recursive: true });
fs.writeFileSync(enLocalePath, JSON.stringify(enLocaleEntries, null, 2), 'utf-8');
console.log(`✅ Synced Weblate base template: ${enLocalePath}`);

console.log('\n📊 Summary:');
console.log(`Total Exercises: ${stats.total}`);
console.log('Modalities:', stats.modalities);
console.log('Equipment:', stats.equipment);
console.log('\n✨ Build completed successfully!\n');

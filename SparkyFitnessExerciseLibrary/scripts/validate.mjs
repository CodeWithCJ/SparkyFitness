import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync, execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const exercisesDir = path.join(rootDir, 'exercises');
const taxonomyDir = path.join(rootDir, 'taxonomy');

const validMuscles = new Set(JSON.parse(fs.readFileSync(path.join(taxonomyDir, 'muscles.json'), 'utf8')));
const validEquipment = new Set(JSON.parse(fs.readFileSync(path.join(taxonomyDir, 'equipment.json'), 'utf8')));
const validModalities = new Set(JSON.parse(fs.readFileSync(path.join(taxonomyDir, 'modalities.json'), 'utf8')));

// Video standards for long-term maintainability
const MAX_VIDEO_SIZE_BYTES = 2.5 * 1024 * 1024; // 2.5 MB hard cap (ideal <= 1.5 MB)
const MIN_DURATION_SECONDS = 5;
const MAX_DURATION_SECONDS = 15;

// Check if ffprobe is available on the system
let hasFfprobe = false;
try {
  execSync('ffprobe -version', { stdio: 'ignore' });
  hasFfprobe = true;
} catch {
  // ffprobe not installed or not in PATH
}

console.log('🔍 Validating SparkyFitness Exercise Library...\n');

const exerciseFolders = fs
  .readdirSync(exercisesDir, { withFileTypes: true })
  .filter((dirent) => dirent.isDirectory())
  .map((dirent) => dirent.name)
  .sort();

let errorCount = 0;
let warningCount = 0;

for (const folder of exerciseFolders) {
  const exercisePath = path.join(exercisesDir, folder);
  const jsonPath = path.join(exercisePath, 'exercise.json');

  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ [${folder}] Missing exercise.json`);
    errorCount++;
    continue;
  }

  let exercise;
  try {
    exercise = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch (err) {
    console.error(`❌ [${folder}] Invalid JSON: ${err.message}`);
    errorCount++;
    continue;
  }

  // 1. Validate ID conventions
  if (!exercise.id || !exercise.numeric_id) {
    console.error(`❌ [${folder}] Missing id or numeric_id`);
    errorCount++;
  } else {
    if (!/^[0-9]{5}$/.test(exercise.numeric_id)) {
      console.error(`❌ [${folder}] numeric_id must be exactly 5 digits (e.g. '00857'). Got: '${exercise.numeric_id}'`);
      errorCount++;
    }
    if (exercise.id !== folder) {
      console.error(`❌ [${folder}] id '${exercise.id}' must match folder name '${folder}'`);
      errorCount++;
    }
  }

  // 2. Validate taxonomy
  if (!exercise.taxonomy) {
    console.error(`❌ [${folder}] Missing taxonomy object`);
    errorCount++;
  } else {
    if (!validModalities.has(exercise.taxonomy.modality)) {
      console.error(`❌ [${folder}] Invalid modality: '${exercise.taxonomy.modality}'`);
      errorCount++;
    }
    if (!validEquipment.has(exercise.taxonomy.equipment)) {
      console.error(`❌ [${folder}] Invalid equipment: '${exercise.taxonomy.equipment}'`);
      errorCount++;
    }
    for (const m of exercise.taxonomy.primary_muscles || []) {
      if (!validMuscles.has(m)) {
        console.error(`❌ [${folder}] Invalid primary muscle: '${m}'`);
        errorCount++;
      }
    }
    for (const m of exercise.taxonomy.secondary_muscles || []) {
      if (!validMuscles.has(m)) {
        console.error(`❌ [${folder}] Invalid secondary muscle: '${m}'`);
        errorCount++;
      }
    }
  }

  // 3. Validate required fields, steps, and cues
  if (!exercise.name || typeof exercise.name !== 'string' || exercise.name.trim().length < 2) {
    console.error(`❌ [${folder}] Missing or invalid 'name' (must be a string of at least 2 characters)`);
    errorCount++;
  }

  if (!Array.isArray(exercise.steps) || exercise.steps.length === 0) {
    console.error(`❌ [${folder}] 'steps' must be a non-empty array of strings`);
    errorCount++;
  } else {
    for (let i = 0; i < exercise.steps.length; i++) {
      const step = exercise.steps[i];
      if (typeof step !== 'string' || step.trim().length < 5) {
        console.error(`❌ [${folder}] steps[${i}] must be a descriptive string of at least 5 characters. Got: ${JSON.stringify(step)}`);
        errorCount++;
      }
    }
  }

  // 4. Validate explicit media overrides (committed image/animation/thumbnail files must exist if declared and stay inside exercise dir)
  const explicitMediaFiles = [
    exercise.media?.thumbnail_path,
    exercise.media?.animation_path,
    exercise.media?.animation_vertical_path,
    exercise.media?.animation_horizontal_path,
    exercise.media?.image_path,
  ].filter(Boolean);

  for (const mediaFile of explicitMediaFiles) {
    if (typeof mediaFile !== 'string' || mediaFile.includes('..') || path.isAbsolute(mediaFile)) {
      console.error(`❌ [${folder}] Invalid media file path (must be a relative filename without '..'): '${mediaFile}'`);
      errorCount++;
      continue;
    }
    const localPath = path.resolve(exercisePath, mediaFile);
    const rel = path.relative(exercisePath, localPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      console.error(`❌ [${folder}] Media file path escapes exercise directory: '${mediaFile}'`);
      errorCount++;
      continue;
    }
    if (!fs.existsSync(localPath)) {
      console.error(`❌ [${folder}] Explicit media file declared in exercise.json does not exist: '${mediaFile}'`);
      errorCount++;
    }
  }

  // 5. Validate Video Assets (auto-discovered on local disk + explicit media overrides)
  const localFiles = fs.readdirSync(exercisePath);
  const explicitVideos = [
    exercise.media?.video_path,
    exercise.media?.video_vertical_path,
    exercise.media?.video_horizontal_path,
  ].filter(Boolean);

  for (const vFile of explicitVideos) {
    if (typeof vFile !== 'string' || vFile.includes('..') || path.isAbsolute(vFile)) {
      console.error(`❌ [${folder}] Invalid video file path (must be a relative filename without '..'): '${vFile}'`);
      errorCount++;
    } else {
      const localPath = path.resolve(exercisePath, vFile);
      const rel = path.relative(exercisePath, localPath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        console.error(`❌ [${folder}] Video file path escapes exercise directory: '${vFile}'`);
        errorCount++;
      }
    }
  }

  const videoFiles = new Set([
    ...localFiles.filter((f) => f.endsWith('.mp4') && !f.startsWith('_temp_')),
    ...explicitVideos,
  ].filter(Boolean));

  for (const videoFileName of videoFiles) {
    let localVideoPath;
    try {
      localVideoPath = path.resolve(exercisePath, videoFileName);
      const rel = path.relative(exercisePath, localVideoPath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    } catch {
      continue;
    }

    if (fs.existsSync(localVideoPath)) {
      const stats = fs.statSync(localVideoPath);
      const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);

      if (stats.size > MAX_VIDEO_SIZE_BYTES) {
        console.error(
          `❌ [${folder}] Video ${videoFileName} is ${sizeMB} MB (exceeds 2.5 MB limit). Please compress to ~1MB:\n` +
          `   ffmpeg -i "${videoFileName}" -vcodec libx264 -crf 24 -an -movflags +faststart "${videoFileName}_compressed.mp4"`
        );
        errorCount++;
      } else if (stats.size > 1.8 * 1024 * 1024) {
        console.warn(`⚠️  [${folder}] Video ${videoFileName} is ${sizeMB} MB (recommended <= 1.5 MB for optimal performance)`);
        warningCount++;
      }

      // Deep inspection with ffprobe if installed
      if (hasFfprobe) {
        try {
          const probeOutput = execFileSync(
            'ffprobe',
            [
              '-v', 'error',
              '-select_streams', 'v:0',
              '-show_entries', 'stream=codec_name,width,height,duration',
              '-of', 'json',
              localVideoPath,
            ],
            { encoding: 'utf8' }
          );
          const probeData = JSON.parse(probeOutput);
          const stream = probeData.streams?.[0];

          if (stream) {
            // Check codec
            if (stream.codec_name !== 'h264') {
              console.warn(`⚠️  [${folder}] Video ${videoFileName} codec is '${stream.codec_name}'. H.264 ('h264') is recommended for mobile support.`);
              warningCount++;
            }

            // Check duration
            const duration = parseFloat(stream.duration);
            if (duration && (duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS)) {
              console.warn(`⚠️  [${folder}] Video ${videoFileName} duration is ${duration.toFixed(1)}s (recommended: 5s - 15s exercise loop)`);
              warningCount++;
            }
          }
        } catch {
          // ignore probe error
        }
      }
    }
  }
}

console.log('\n--- Validation Result ---');
if (errorCount === 0 && warningCount === 0) {
  console.log(`✅ All ${exerciseFolders.length} exercises passed validation! Zero errors.\n`);
} else if (errorCount === 0) {
  console.log(`✅ All ${exerciseFolders.length} exercises passed schema validation (${warningCount} optimization warnings).\n`);
} else {
  console.error(`💥 Validation failed with ${errorCount} error(s) and ${warningCount} warning(s).\n`);
  process.exit(1);
}

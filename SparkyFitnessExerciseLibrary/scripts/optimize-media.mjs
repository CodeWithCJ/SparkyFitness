#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

const exercisesDir = path.resolve(__dirname, '../exercises');

// Parse CLI flags and subcommands:
// e.g.:
//   pnpm media                    -> Incremental optimization on all exercises
//   pnpm media force-all          -> Force re-encode all exercises
//   pnpm media force 00857        -> Force re-encode only exercise 00857
//   pnpm media 00857              -> Incremental optimization only on 00857
//   pnpm media candidates 00857   -> Extract candidate thumbnail frames for 00857
const args = process.argv.slice(2);
const forceKeywords = new Set(['--force', '-f', 'force', 'force-all']);
const candidateKeywords = new Set(['--candidates', '-c', 'candidates', 'candidate']);

const isForce = args.some((a) => forceKeywords.has(a.toLowerCase()));
const isCandidates = args.some((a) => candidateKeywords.has(a.toLowerCase()));

// Find target exercise filter (ignoring subcommand keywords and flags)
const reservedKeywords = new Set([...forceKeywords, ...candidateKeywords]);
const targetFilter = args.find((a) => !reservedKeywords.has(a.toLowerCase()) && !a.startsWith('-'));

let hasSharpError = false;

// Verify ffmpeg & ffprobe
try {
  execSync('ffmpeg -version', { stdio: 'ignore' });
  execSync('ffprobe -version', { stdio: 'ignore' });
} catch {
  console.error('❌ Error: ffmpeg and ffprobe must be installed and available in PATH.');
  process.exit(1);
}

// Load sharp from exercise library, server, frontend, or root
let sharp = null;
const candidateSharpPaths = [
  'sharp',
  path.resolve(__dirname, '../node_modules/sharp'),
  path.resolve(__dirname, '../../SparkyFitnessServer/node_modules/sharp'),
  path.resolve(__dirname, '../../SparkyFitnessFrontend/node_modules/sharp'),
  path.resolve(__dirname, '../../node_modules/sharp'),
];
for (const p of candidateSharpPaths) {
  try {
    sharp = require(p);
    if (sharp) break;
  } catch {}
}

function probeVideo(videoPath) {
  const probeData = JSON.parse(
    execFileSync(
      'ffprobe',
      [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height,duration,codec_name',
        '-show_entries', 'format=size',
        '-of', 'json',
        videoPath,
      ],
      { encoding: 'utf8' }
    )
  );
  const vStream = probeData.streams?.[0] || {};
  const width = parseInt(vStream.width || 0, 10);
  const height = parseInt(vStream.height || 0, 10);
  const duration = parseFloat(vStream.duration || 0);
  const sizeBytes = parseInt(probeData.format?.size || fs.statSync(videoPath).size, 10);
  const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(2);

  const streamData = JSON.parse(
    execFileSync(
      'ffprobe',
      [
        '-v', 'error',
        '-show_entries', 'stream=codec_type',
        '-of', 'json',
        videoPath,
      ],
      { encoding: 'utf8' }
    )
  );
  const hasAudio = (streamData.streams || []).some((s) => s.codec_type === 'audio');

  return { width, height, duration, sizeMb, sizeBytes, hasAudio };
}

function resolveInsideExerciseDir(exDir, relativePath, label) {
  if (!relativePath || typeof relativePath !== 'string') {
    throw new Error(`[${label}] Invalid relative path: ${JSON.stringify(relativePath)}`);
  }
  const resolved = path.resolve(exDir, relativePath);
  const rel = path.relative(exDir, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`[${label}] Path traversal detected: '${relativePath}' escapes exercise directory '${exDir}'`);
  }
  return resolved;
}

async function processExercise(dirName) {
  const exDir = path.join(exercisesDir, dirName);
  const jsonPath = path.join(exDir, 'exercise.json');

  if (!fs.existsSync(jsonPath)) return;

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const media = data.media || {};

  console.log(`\n📦 [${dirName}] ${data.name || ''}`);

  // Auto-discover all mp4 files in folder + any explicit media paths
  const localFiles = fs.readdirSync(exDir);
  const candidateVideos = Array.from(new Set([
    ...localFiles.filter((f) => f.endsWith('.mp4') && !f.startsWith('_temp_')),
    media.video_path,
    media.video_vertical_path,
    media.video_horizontal_path,
  ].filter(Boolean)));

  const videoFiles = candidateVideos.filter((f) => {
    try {
      const resolved = resolveInsideExerciseDir(exDir, f, 'video');
      return fs.existsSync(resolved);
    } catch {
      return false;
    }
  });

  if (videoFiles.length === 0) {
    console.log(`  ℹ️  No MP4 videos found on disk, skipping.`);
    return;
  }

  // 1. Optimize all video files in folder
  let primaryVideoPath = resolveInsideExerciseDir(exDir, videoFiles[0], 'primary_video');
  let primaryStats = probeVideo(primaryVideoPath);

  for (const vFile of videoFiles) {
    const vPath = resolveInsideExerciseDir(exDir, vFile, 'video');
    if (!fs.existsSync(vPath)) continue;

    const stats = probeVideo(vPath);
    const isVert = stats.height > stats.width;
    const isHoriz = stats.width > stats.height;
    const isSq = stats.width === stats.height;

    console.log(`  🎥 ${vFile}: ${stats.width}x${stats.height} (${isVert ? '9:16 vertical' : isHoriz ? '16:9 horizontal' : '1:1 square'}), ${stats.duration.toFixed(1)}s, ${stats.sizeMb} MB, audio: ${stats.hasAudio ? 'yes' : 'no'}`);

    const needsVideoCompression = isForce || stats.sizeBytes > 1.5 * 1024 * 1024 || stats.hasAudio;
    if (needsVideoCompression) {
      console.log(`     ⚙️  Optimizing ${vFile} (size ${stats.sizeMb} MB > 1.5 MB or audio detected)...`);
      const tempVideo = path.join(exDir, `_temp_${vFile}`);

      const encodeArgs = ['-y', '-i', vPath];
      if (isVert && stats.height > 1280) {
        encodeArgs.push('-vf', 'scale=720:1280');
      } else if (isHoriz && stats.width > 1280) {
        encodeArgs.push('-vf', 'scale=1280:720');
      } else if (isSq && stats.width > 1080) {
        encodeArgs.push('-vf', 'scale=1080:1080');
      }
      encodeArgs.push('-vcodec', 'libx264', '-crf', '25', '-an', '-movflags', '+faststart', tempVideo);

      execFileSync('ffmpeg', encodeArgs, { stdio: 'ignore' });

      fs.renameSync(tempVideo, vPath);
      const newStats = probeVideo(vPath);
      console.log(`     ✅ Optimized: ${stats.sizeMb} MB -> ${newStats.sizeMb} MB (${newStats.width}x${newStats.height}, silent)`);
    } else {
      console.log(`     ⚡ Already optimal (${stats.sizeMb} MB, silent, faststart).`);
    }

    // Prefer vertical video as primary reference for thumbnail if available
    if (isVert) {
      primaryVideoPath = vPath;
      primaryStats = stats;
    }
  }

  // Mode: Extract candidate frames to help user pick optimal thumbnail
  if (isCandidates) {
    const candDir = path.join(exDir, 'candidates');
    if (!fs.existsSync(candDir)) fs.mkdirSync(candDir, { recursive: true });

    const checkpoints = [
      { label: '01_start', pct: 0.15 },
      { label: '02_mid_descent', pct: 0.30 },
      { label: '03_peak_action', pct: 0.50 },
      { label: '04_concentric', pct: 0.75 },
    ];

    console.log(`  🔍 Extracting thumbnail candidates to: ${path.relative(process.cwd(), candDir)}/`);
    for (const cp of checkpoints) {
      const ts = (primaryStats.duration * cp.pct).toFixed(2);
      const outImg = path.join(candDir, `candidate_${cp.label}_t${ts}s.jpg`);
      execFileSync(
        'ffmpeg',
        ['-y', '-ss', String(ts), '-i', primaryVideoPath, '-vframes', '1', '-q:v', '2', outImg],
        { stdio: 'ignore' }
      );
      console.log(`     📸 ${path.basename(outImg)} (t = ${ts}s)`);
    }
    console.log(`  👉 To select a candidate, set "thumbnail_timestamp": <seconds> in ${dirName}/exercise.json`);
    return;
  }

  // 2. Generate WebP Thumbnail (_thumb.webp) if missing or --force
  const thumbFileName = media.thumbnail_path || `${dirName}_thumb.webp`;
  const thumbPath = resolveInsideExerciseDir(exDir, thumbFileName, 'thumbnail_path');

  if (isForce || !fs.existsSync(thumbPath)) {
    const timestamp = media.thumbnail_timestamp ?? parseFloat((primaryStats.duration * 0.3).toFixed(2));
    console.log(`  📸 Extracting WebP thumbnail at t = ${timestamp}s from ${path.basename(primaryVideoPath)}...`);

    const tempFrame = path.join(exDir, '_temp_thumb_frame.jpg');
    execFileSync(
      'ffmpeg',
      ['-y', '-ss', String(timestamp), '-i', primaryVideoPath, '-vframes', '1', '-q:v', '2', tempFrame],
      { stdio: 'ignore' }
    );

    let tWidth = 360;
    let tHeight = 640;
    if (primaryStats.width > primaryStats.height) {
      tWidth = 640;
      tHeight = 360;
    } else if (primaryStats.width === primaryStats.height) {
      tWidth = 540;
      tHeight = 540;
    }

    if (sharp) {
      await sharp(tempFrame)
        .resize(tWidth, tHeight)
        .webp({ quality: 80 })
        .toFile(thumbPath);
    } else {
      execFileSync(
        'ffmpeg',
        ['-y', '-i', tempFrame, '-vf', `scale=${tWidth}:${tHeight}`, '-q:v', '80', thumbPath],
        { stdio: 'ignore' }
      );
    }

    if (fs.existsSync(tempFrame)) fs.unlinkSync(tempFrame);
    const thumbKb = (fs.statSync(thumbPath).size / 1024).toFixed(1);
    console.log(`  ✅ Generated ${thumbFileName} (${tWidth}x${tHeight}, ${thumbKb} KB)`);
  } else {
    console.log(`  ⚡ Thumbnail already exists: ${thumbFileName}`);
  }

  // 3. Generate Animated WebP loops (Option B) for each video
  for (const vFile of videoFiles) {
    const vPath = path.join(exDir, vFile);
    if (!fs.existsSync(vPath)) continue;

    const vStats = probeVideo(vPath);
    let animFileName;
    if (vFile.includes('_9_16') || vFile.includes('_vertical')) {
      animFileName = `${dirName}_9_16.webp`;
    } else if (vFile.includes('_16_9') || vFile.includes('_horizontal')) {
      animFileName = `${dirName}_16_9.webp`;
    } else if (videoFiles.length === 1) {
      animFileName = `${dirName}.webp`;
    } else {
      animFileName = `${path.parse(vFile).name}.webp`;
    }

    const animPath = path.join(exDir, animFileName);

    if (isForce || !fs.existsSync(animPath)) {
      console.log(`  🎞️  Generating animated WebP loop for ${vFile}...`);

      let fps = 6;
      let scale = '180:320';
      if (vStats.width > vStats.height) {
        fps = 8;
        scale = '320:180';
      } else if (vStats.width === vStats.height) {
        fps = 8;
        scale = '240:240';
      }

      if (!sharp) {
        console.error('     ❌ Error: sharp is required to encode animated WebP. Please ensure sharp is installed.');
        hasSharpError = true;
        continue;
      }

      const tempGif = path.join(exDir, `_temp_${animFileName}.gif`);
      const filterComplex = `fps=${fps},scale=${scale}:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5`;
      execFileSync(
        'ffmpeg',
        ['-y', '-i', vPath, '-vf', filterComplex, tempGif],
        { stdio: 'ignore' }
      );

      await sharp(tempGif, { animated: true })
        .webp({ quality: 80, effort: 4 })
        .toFile(animPath);

      if (fs.existsSync(tempGif)) fs.unlinkSync(tempGif);

      const animKb = (fs.statSync(animPath).size / 1024).toFixed(1);
      console.log(`  ✅ Generated ${animFileName} (${scale}, ${fps} fps, ${vStats.duration.toFixed(1)}s full loop, ${animKb} KB)`);
    } else {
      console.log(`  ⚡ Animated WebP already exists: ${animFileName}`);
    }
  }

  // 4. Clean up unreferenced legacy GIF, temporary files, and candidate preview folder
  const candDir = path.join(exDir, 'candidates');
  if (fs.existsSync(candDir)) {
    try {
      fs.rmSync(candDir, { recursive: true, force: true });
      console.log(`  🧹 Cleaned up candidate preview folder`);
    } catch {}
  }

  const referencedFiles = new Set([
    media.animation_path,
    media.animation_vertical_path,
    media.animation_horizontal_path,
    media.gif_path,
    media.thumbnail_path,
    media.image_path,
  ].filter(Boolean));

  const leftoverFiles = fs.readdirSync(exDir);
  for (const f of leftoverFiles) {
    if (referencedFiles.has(f)) continue;

    if (f.startsWith('_temp_') || f.includes('_anim.webp')) {
      try {
        fs.unlinkSync(path.join(exDir, f));
        console.log(`  🧹 Cleaned up temporary file: ${f}`);
      } catch {}
    } else if (f.endsWith('.gif') && sharp) {
      try {
        fs.unlinkSync(path.join(exDir, f));
        console.log(`  🧹 Cleaned up unreferenced legacy GIF: ${f}`);
      } catch {}
    }
  }
}

async function main() {
  console.log('🚀 SparkyFitness Exercise Library - Media Optimizer');
  console.log(`Mode: ${isForce ? 'FORCE (re-encode)' : isCandidates ? 'CANDIDATES PREVIEW' : 'INCREMENTAL (only missing/unoptimized)'} | Target: ${targetFilter || 'ALL'}`);

  const folders = fs.readdirSync(exercisesDir).filter((f) => {
    const full = path.join(exercisesDir, f);
    return fs.statSync(full).isDirectory() && /^[0-9]{5}_[a-z0-9_]+$/.test(f);
  });

  const targetFolders = targetFilter
    ? folders.filter((f) => f.includes(targetFilter))
    : folders;

  if (targetFolders.length === 0) {
    console.log(`⚠️  No exercise found matching filter: "${targetFilter}"`);
    return;
  }

  for (const folder of targetFolders) {
    await processExercise(folder);
  }

  if (hasSharpError) {
    console.error('\n❌ Media optimization finished with errors: sharp was missing for some exercises.');
    process.exit(1);
  }

  console.log('\n✨ Media optimization complete!\n');
}

main().catch((err) => {
  console.error('\n❌ Media optimization failed:', err);
  process.exit(1);
});

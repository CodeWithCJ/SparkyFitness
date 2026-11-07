import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const bundleId = process.env.EXPO_DEV_BUNDLE_IDENTIFIER
  ? `${process.env.EXPO_DEV_BUNDLE_IDENTIFIER}.watchkitapp`
  : 'org.SparkyApps.SparkyFitnessMobile1.dev.watchkitapp';

// Scheme and product name both come from `name` in
// targets/watch/expo-target.config.js. They are one word — an earlier
// "SparkyFitness Watch" (with a space) here matched no scheme at all, so this
// script and `pnpm run watch:device` both failed with "the workspace does not
// contain a scheme named ...".
const SCHEME = 'SparkyFitnessWatch';

console.log(`› Building ${SCHEME} scheme...`);
execSync(
  `xcodebuild -workspace ios/SparkyFitness.xcworkspace -scheme '${SCHEME}' -destination 'generic/platform=watchOS Simulator' build -quiet`,
  { stdio: 'inherit' }
);

// Find built app in DerivedData
const derivedDataPath = join(homedir(), 'Library/Developer/Xcode/DerivedData');
let builtAppPath = null;

if (existsSync(derivedDataPath)) {
  const folders = readdirSync(derivedDataPath).filter((f) =>
    f.startsWith('SparkyFitness-')
  );
  for (const folder of folders) {
    const candidate = join(
      derivedDataPath,
      folder,
      `Build/Products/Debug-watchsimulator/${SCHEME}.app`
    );
    if (existsSync(candidate)) {
      builtAppPath = candidate;
      break;
    }
  }
}

if (!builtAppPath) {
  console.error(`❌ Could not find built ${SCHEME}.app in DerivedData`);
  process.exit(1);
}

// Find an available watchOS simulator across all runtimes
console.log('› Finding available Apple Watch simulator...');
const deviceListJson = execSync('xcrun simctl list devices available -j', {
  encoding: 'utf-8',
});
const { devices } = JSON.parse(deviceListJson);

const allWatchDevices = Object.entries(devices)
  .filter(([runtime]) => runtime.includes('watchOS'))
  .flatMap(([_, list]) => list);

const watchDevice =
  allWatchDevices.find(
    (d) => d.state === 'Booted' && d.name.includes('Apple Watch Series 11')
  ) ||
  allWatchDevices.find((d) =>
    d.name.includes('Apple Watch Series 11 (46mm)')
  ) ||
  allWatchDevices.find((d) => d.name.includes('Apple Watch Series 11')) ||
  allWatchDevices.find((d) => d.state === 'Booted') ||
  allWatchDevices[0];

if (!watchDevice) {
  console.error('❌ No available watchOS simulator found.');
  process.exit(1);
}

console.log(
  `› Booting Apple Watch Simulator: ${watchDevice.name} (${watchDevice.udid})...`
);
try {
  execSync('open -a Simulator', { stdio: 'ignore' });
} catch {
  // Simulator GUI app might not be installed or running headlessly
}
try {
  execSync(`xcrun simctl boot "${watchDevice.udid}"`, { stdio: 'ignore' });
} catch {
  // Already booted
}

console.log('› Installing app on simulator...');
execSync(`xcrun simctl install "${watchDevice.udid}" "${builtAppPath}"`, {
  stdio: 'inherit',
});

console.log(`› Launching ${bundleId}...`);
execSync(`xcrun simctl launch "${watchDevice.udid}" "${bundleId}"`, {
  stdio: 'inherit',
});

console.log('✔ Apple Watch App launched successfully!');

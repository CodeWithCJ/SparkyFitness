import { execSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const bundleId = process.env.EXPO_DEV_BUNDLE_IDENTIFIER
  ? `${process.env.EXPO_DEV_BUNDLE_IDENTIFIER}.watchkitapp`
  : 'org.SparkyApps.SparkyFitnessMobile1.dev.watchkitapp';

console.log('› Building SparkyFitness Watch scheme...');
execSync(
  "xcodebuild -workspace ios/SparkyFitness.xcworkspace -scheme 'SparkyFitness Watch' -destination 'generic/platform=watchOS Simulator' build -quiet",
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
      'Build/Products/Debug-watchsimulator/SparkyFitness Watch.app'
    );
    if (existsSync(candidate)) {
      builtAppPath = candidate;
      break;
    }
  }
}

if (!builtAppPath) {
  console.error(
    '❌ Could not find built SparkyFitness Watch.app in DerivedData'
  );
  process.exit(1);
}

// Find an available watchOS simulator
console.log('› Finding available Apple Watch simulator...');
const deviceListJson = execSync('xcrun simctl list devices available -j', {
  encoding: 'utf-8',
});
const { devices } = JSON.parse(deviceListJson);

let watchDevice = null;
for (const [runtime, list] of Object.entries(devices)) {
  if (runtime.includes('watchOS')) {
    watchDevice =
      list.find((d) => d.name.includes('Apple Watch Series 11 (46mm)')) ||
      list[0];
    if (watchDevice) break;
  }
}

if (!watchDevice) {
  console.error('❌ No available watchOS simulator found.');
  process.exit(1);
}

console.log(
  `› Booting Apple Watch Simulator: ${watchDevice.name} (${watchDevice.udid})...`
);
execSync('open -a Simulator', { stdio: 'ignore' });
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

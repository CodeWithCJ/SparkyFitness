# Sparky Fitness Mobile

Sparky Fitness Mobile is a React Native application built with Expo, designed to help users track their fitness activities and health data seamlessly across devices.

## Development

Use the following `pnpm` shortcuts for development (which map to the underlying Expo CLI commands):

```bash
# Clean and regenerate native /ios and /android directories (runs expo prebuild --clean)
# (Required when native package dependencies in package.json or configurations in app.json change)
pnpm prebuild

# Build and run on Android emulator or connected device
pnpm android

# Build and run on iOS simulator or connected device
pnpm ios

# Start Expo dev server (Metro packager)
pnpm start
```

### Run on a phone

Each shortcut asks which connected phone (or simulator/emulator) to use.

```bash
# Debug build: loads JavaScript from Metro (fast refresh, dev menu).
# The phone must reach your Mac by cable or the same Wi-Fi.
pnpm ios:device
pnpm android:device

# Release build: JavaScript is bundled into the app, runs without Metro,
# behaves like the store version.
pnpm ios:release
pnpm android:release

# Same Release build, but regenerates the native project first.
# Use after changing native config (app.config.ts, plugins, .env flags such as ENABLE_NFC_LINKS).
pnpm ios:release:clean
pnpm android:release:clean
```

Dev builds install as **DevSparkyFitness**, next to the store app. Tapping an NFC tag opens a dev build only when it is built with `ENABLE_NFC_LINKS=1` in `.env` and signed with a paid Apple team; otherwise use **Settings → NFC tags → Scan a tag**.

### Production Build

```bash
APP_VARIANT=production eas build -p ios --profile production --auto-submit
```

### Configure Xcode

```bash
open ios/SparkyFitness.xcworkspace
```

### Troubleshooting

```bash
# 1. Clean the cached build folders again
rm -rf ios/build ios/Pods

# 2. Re-run prebuild with the variable set to 0
EXPO_USE_PRECOMPILED_MODULES=0 npx expo prebuild --clean

# 3. Run the iOS build with the variable set to 0
EXPO_USE_PRECOMPILED_MODULES=0 pnpm ios
```

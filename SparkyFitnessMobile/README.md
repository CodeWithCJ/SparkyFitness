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

### Advanced iOS Runs
```bash
# Run on a physical iOS device
npx expo run:ios --device

# Run release configuration on a physical iOS device
npx expo run:ios --configuration Release --device
```

### Production Build
```bash
APP_VARIANT=production eas build -p ios --profile production --auto-submit
```


### Configure Xcode
```bash
open ios/SparkyFitness.xcworkspace

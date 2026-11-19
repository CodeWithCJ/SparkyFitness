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
# iPhone: must be on the same Wi-Fi as the Mac (or start Metro with `npx expo start --tunnel`).
# Android: a USB cable is enough; Expo forwards the Metro port with `adb reverse`.
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

### Android phone over Wi-Fi (no cable)

Needs Android 11 or newer, with the phone and the Mac on the same Wi-Fi. `adb` is in `~/Library/Android/sdk/platform-tools` if it is not on your `PATH`.

On the phone, once:

1. **Settings → About phone**, tap **Build number** seven times to enable Developer options.
2. **Settings → System → Developer options → Wireless debugging**: turn it on and allow it on this network.
3. Tap **Pair device with pairing code**. It shows an `IP:port` and a six-digit code. The pairing port differs from the port on the main Wireless debugging screen.

On the Mac:

```bash
# Pair (once per Mac). Use the IP:port from the pairing dialog, then enter the six-digit code.
adb pair 192.168.1.50:37123

# Connect. Use the IP:port from the main Wireless debugging screen, not the pairing one.
# Repeat after the phone reboots or Wi-Fi changes: the port changes each time.
adb connect 192.168.1.50:41234
adb devices          # the phone should be listed as "device"

# Build and install a debug build (loads JavaScript from Metro on the Mac;
# Expo forwards the Metro port with `adb reverse`, which works over Wi-Fi too).
pnpm android:device

# Or a Release build that runs without the Mac (like the store version).
pnpm android:release

# Copy a file to the phone's Downloads folder (for example a .p12 client certificate).
adb push phone.p12 /sdcard/Download/

# Follow the app's logs. `ClientCertificate` is the client certificate code.
adb logcat -s ClientCertificate ReactNativeJS

# Disconnect when finished.
adb disconnect
```

The debug build loads the Mac's JavaScript, so the phone must keep a route to the Mac while you test. To try a feature away from your desk, use the Release build.

To test a server that requires a client certificate (mTLS), see [Client Certificates](../docs/src/mobile-app/client-certificates.md). That includes the extra certificate install the phone's browser needs for SSO and passkey sign-in.

Dev builds install as **DevSparkyFitness**, next to the store app. Tapping an NFC tag opens a dev build only when it is built with `ENABLE_NFC_LINKS=1` in `.env`, and the tag site (`SparkyFitnessTag/`) lists that app's ID, as it does for the store app and the maintainer's dev build:

- **iPhone:** the build must also be signed with a paid Apple team.
- **Android 15 and older:** the app's own NFC filter also opens a tapped tag.

Otherwise use **Settings → NFC tags → Scan a tag**.

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

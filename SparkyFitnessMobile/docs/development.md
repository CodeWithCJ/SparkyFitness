## Dependencies

### Installation

- Always use `npx expo install` to install dependencies to ensure compatibility with Expo and react native. This will solve a lot of dependency issues as they arise.
- When installing a react native package, make sure to check if it is compatible with expo and the new architecture.
- If the dependency contains native code, you will need to run `npx expo prebuild` to rebuild the ios and android folders.
- Seriously, always use `npx expo install`

### Keep These Required Peer Dependencies

| Package | Dependency For |
|---------|----------------|
| `react-native-bottom-tabs` | `@bottom-tabs/react-navigation` |
| `react-native-worklets` | `react-native-reanimated` |
| `expo-font` | `@expo/vector-icons` |
| `react-native-nitro-modules` | `@kingstinct/react-native-healthkit` |
| `expo-asset` | expo |

`expo-health-connect` contains only an expo config module that enables the use of `react-native-health-connect` in expo projects. The actual native module is in `react-native-health-connect`. Both must be installed.

### Troubleshooting

- You can run `npx expo install --check` to check for incompatible dependencies in your project. You can run it with `--fix` to automatically fix any issues found.
- Use `npx expo-doctor` to diagnose and fix common issues in your Expo project.
- Prebuild after changing anything in `app.json`
- Delete node_modules and run `npm install` again to reinstall all dependencies. Follow up with `npx expo-doctor`
- Clear metro cache with `npx expo start -c` if you encounter strange issues.

## Prebuild

This app uses expo development builds so any changes made to ios and android folders will be overwritten when running `npx expo prebuild`. Changes should instead be made in `app.json` using config plugins.

Running `npx expo prebuild --clean` will delete the folders before generating them again.

## Running

Use one of the following to start the metro server, prebuild if necessary, run the app on a simulator or connected device, and start the metro server:

```bash
npx expo run:android
npx expo run:ios
```

Adding `--device` will let you pick a simulator or connected device.

If you have a current development build and just want to start the metro server, use:

```bash
npx expo start
```

Then launch the development build on your device or simulator.

## Dev Tools

Set the environment variable `APP_VARIANT` to `production` to disable the dev menu. As a fallback this menu is also only available in expo __development__ builds. 

### Seed data

At the bottom of settings screen is a button to seed the app with test Health Connect or HealthKit data for testing.

## API Documentation

See [API Documentation](api.md) for details on the server API as it relates to mobile app development.

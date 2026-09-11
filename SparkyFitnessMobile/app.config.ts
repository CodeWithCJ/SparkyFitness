import 'tsx/cjs';
import { ExpoConfig, ConfigContext } from 'expo/config';
import { nativeLanguageTags } from './src/localization/localeRegistry';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  getIosAppGroup,
  DEV_BUNDLE_IDENTIFIER,
} = require('./app.identifiers.js');

const APP_NAME = 'SparkyFitness';
const APP_SLUG = 'sparkyfitnessmobile';
const ANDROID_PROD_BUNDLE_IDENTIFIER = 'com.SparkyApps.SparkyFitnessMobile';
const IOS_PROD_BUNDLE_IDENTIFIER = 'com.SparkyApps.SparkyFitnessMobile';
const DEV_APPLE_TEAM_ID = process.env.EXPO_DEV_APPLE_TEAM_ID || '';
const PROD_APPLE_TEAM_ID = process.env.EXPO_PROD_APPLE_TEAM_ID || '';

const DEV_PACKAGE = DEV_BUNDLE_IDENTIFIER;
const PROD_PACKAGE = ANDROID_PROD_BUNDLE_IDENTIFIER;

const androidPermissions = [
  'android.permission.INTERNET',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  'android.permission.health.READ_BASAL_BODY_TEMPERATURE',
  'android.permission.health.READ_BASAL_METABOLIC_RATE',
  'android.permission.health.READ_BLOOD_GLUCOSE',
  'android.permission.health.READ_BLOOD_PRESSURE',
  'android.permission.health.READ_BODY_FAT',
  'android.permission.health.READ_BODY_TEMPERATURE',
  'android.permission.health.READ_BONE_MASS',
  'android.permission.health.READ_CERVICAL_MUCUS',
  'android.permission.health.READ_CYCLING_PEDALING_CADENCE',
  'android.permission.health.READ_EXERCISE',
  // Route data is gated separately from READ_EXERCISE and is granted per
  // session through requestExerciseRoute's system dialog; the blanket
  // READ_EXERCISE_ROUTES_ALL is a restricted permission Google grants only to
  // allowlisted apps. READ_HEALTH_DATA_IN_BACKGROUND does not cover routes.
  'android.permission.health.READ_EXERCISE_ROUTES',
  'android.permission.health.READ_DISTANCE',
  'android.permission.health.READ_ELEVATION_GAINED',
  'android.permission.health.READ_FLOORS_CLIMBED',
  'android.permission.health.READ_HEART_RATE',
  'android.permission.health.READ_HEART_RATE_VARIABILITY',
  'android.permission.health.READ_HEIGHT',
  'android.permission.health.READ_HYDRATION',
  'android.permission.health.READ_NUTRITION',
  'android.permission.health.READ_LEAN_BODY_MASS',
  'android.permission.health.READ_INTERMENSTRUAL_BLEEDING',
  'android.permission.health.READ_MENSTRUATION',
  'android.permission.health.READ_OVULATION_TEST',
  'android.permission.health.READ_OXYGEN_SATURATION',
  'android.permission.health.READ_POWER',
  'android.permission.health.READ_RESPIRATORY_RATE',
  'android.permission.health.READ_RESTING_HEART_RATE',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.READ_SPEED',
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_STEPS_CADENCE',
  'android.permission.health.READ_TOTAL_CALORIES_BURNED',
  'android.permission.health.READ_VO2_MAX',
  'android.permission.health.READ_WEIGHT',
  'android.permission.health.READ_WHEELCHAIR_PUSHES',
  'android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND',
  'android.permission.health.READ_HEALTH_DATA_HISTORY',
  // Writeback (Sparky → Health Connect): nutrition + water. Production feature,
  // so these live in the base list (not the dev-only writes below).
  'android.permission.health.WRITE_NUTRITION',
  'android.permission.health.WRITE_HYDRATION',
  // Exact rest-complete alerts: without this special access (user-granted via
  // "Alarms & reminders" on Android 13+), expo-notifications falls back to
  // inexact alarms that the OS batches ~15s late.
  'android.permission.SCHEDULE_EXACT_ALARM',
];

const devAndroidPermissions = [
  'android.permission.health.WRITE_ACTIVE_CALORIES_BURNED',
  'android.permission.health.WRITE_BASAL_BODY_TEMPERATURE',
  'android.permission.health.WRITE_BASAL_METABOLIC_RATE',
  'android.permission.health.WRITE_BLOOD_GLUCOSE',
  'android.permission.health.WRITE_BLOOD_PRESSURE',
  'android.permission.health.WRITE_BODY_FAT',
  'android.permission.health.WRITE_BODY_TEMPERATURE',
  'android.permission.health.WRITE_BONE_MASS',
  'android.permission.health.WRITE_CERVICAL_MUCUS',
  'android.permission.health.WRITE_CYCLING_PEDALING_CADENCE',
  'android.permission.health.WRITE_EXERCISE',
  'android.permission.health.WRITE_EXERCISE_ROUTE',
  'android.permission.health.WRITE_DISTANCE',
  'android.permission.health.WRITE_ELEVATION_GAINED',
  'android.permission.health.WRITE_FLOORS_CLIMBED',
  'android.permission.health.WRITE_HEART_RATE',
  'android.permission.health.WRITE_HEIGHT',
  // WRITE_HYDRATION moved to the base androidPermissions list (writeback feature).
  'android.permission.health.WRITE_LEAN_BODY_MASS',
  'android.permission.health.WRITE_INTERMENSTRUAL_BLEEDING',
  'android.permission.health.WRITE_MENSTRUATION',
  'android.permission.health.WRITE_OVULATION_TEST',
  'android.permission.health.WRITE_OXYGEN_SATURATION',
  'android.permission.health.WRITE_POWER',
  'android.permission.health.WRITE_RESPIRATORY_RATE',
  'android.permission.health.WRITE_RESTING_HEART_RATE',
  'android.permission.health.WRITE_SLEEP',
  'android.permission.health.WRITE_SPEED',
  'android.permission.health.WRITE_STEPS',
  'android.permission.health.WRITE_STEPS_CADENCE',
  'android.permission.health.WRITE_TOTAL_CALORIES_BURNED',
  'android.permission.health.WRITE_VO2_MAX',
  'android.permission.health.WRITE_WEIGHT',
  'android.permission.health.WRITE_WHEELCHAIR_PUSHES',
];

// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require('./package.json');

export default ({ config }: ConfigContext): Partial<ExpoConfig> => {
  const environment = process.env.APP_VARIANT || 'dev';

  const isDev = environment === 'dev' || environment === 'development';

  if (isDev) {
    androidPermissions.push(...devAndroidPermissions);
  }

  // Plugins only included in production builds
  const prodPlugins = ['./plugins/withNetworkSecurityConfig'];

  return {
    ...config,
    name: APP_NAME,
    slug: APP_SLUG,
    version: packageJson.version,
    locales: Object.fromEntries(
      nativeLanguageTags().map((language) => [
        language,
        `./locales/${language}.json`,
      ])
    ),
    ios: {
      bundleIdentifier: isDev
        ? DEV_BUNDLE_IDENTIFIER
        : IOS_PROD_BUNDLE_IDENTIFIER,
      appleTeamId: isDev ? DEV_APPLE_TEAM_ID : PROD_APPLE_TEAM_ID,
      supportsTablet: false,
      infoPlist: {
        NSLocalNetworkUsageDescription:
          'SparkyFitness connects to self-hosted servers on your local network.',
        // Required by the food/meal photo picker and the label/barcode
        // scanner. iOS terminates the app on first use without these, and App
        // Review rejects a binary that requests either without a purpose
        // string.
        NSCameraUsageDescription:
          'SparkyFitness uses the camera to photograph foods and meals, and to scan barcodes and nutrition labels.',
        NSPhotoLibraryUsageDescription:
          'SparkyFitness lets you choose photos from your library for your foods, meals, and diary entries.',
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: false,
        },
        ITSAppUsesNonExemptEncryption: false,
        // Keep the native per-app Language entry visible in iOS Settings even
        // when the device has only one preferred system language.
        UIPrefersShowingLanguageSettings: true,
        // The localized InfoPlist permission strings come from `locales`; this
        // allows the generated app metadata to use the selected localization.
        CFBundleAllowMixedLocalizations: true,
      },
      entitlements: {
        'com.apple.security.application-groups': [getIosAppGroup()],
        // Lets iOS honour the `timeSensitive` rest alert (see
        // `scheduleRestNotification`); without it a Focus mode silences it.
        'com.apple.developer.usernotifications.time-sensitive': true,
      },
      icon: './assets/icons/appicon.icon',
    },
    android: {
      package: isDev ? DEV_PACKAGE : PROD_PACKAGE,
      permissions: androidPermissions,
      adaptiveIcon: {
        foregroundImage: './assets/icons/adaptiveicon.png',
        backgroundColor: '#FFFFFF',
      },
    },
    plugins: [
      ...(config.plugins ?? []),
      'expo-image',
      [
        // Foreground playback only (rest-timer chime): no mic permission, no
        // background-audio mode, no Android record/foreground-service perms.
        'expo-audio',
        {
          microphonePermission: false,
          recordAudioAndroid: false,
          enableBackgroundPlayback: false,
        },
      ],
      './plugins/withGlanceAndroidSupport',
      './plugins/withAppLanguage',
      './plugins/withCalorieWidget',
      './plugins/withExactAlarmModule',
      './plugins/withEnrichedMarkdownNoMath',
      [
        'expo-localization',
        {
          supportedLocales: {
            ios: nativeLanguageTags(),
            android: nativeLanguageTags(),
          },
        },
      ],
      [
        'expo-widgets',
        {
          groupIdentifier: getIosAppGroup(),
          bundleIdentifier:
            process.env.WIDGET_BUNDLE_IDENTIFIER ||
            (isDev
              ? `${DEV_BUNDLE_IDENTIFIER}.ExpoWidgetsTarget`
              : 'com.SparkyApps.SparkyFitnessMobile.ExpoWidgetsTarget'),
          // Live Activities register at runtime via createLiveActivity and must
          // NOT be listed here — widgets[] is only for home/Lock Screen widgets
          // (an entry without supportedFamilies breaks the generated target).
          widgets: [],
        },
      ],
      ...(!isDev ? prodPlugins : []),
    ],
    extra: {
      ...config.extra,
      APP_VARIANT: environment,
      iosAppGroup: getIosAppGroup(),
      eas: {
        projectId: '498a86c5-344f-4d2c-9033-dfd720e4a383',
      },
    },
  };
};

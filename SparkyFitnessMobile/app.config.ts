import { ExpoConfig, ConfigContext } from 'expo/config';

const APP_NAME = 'SparkyFitnessMobile';
const APP_SLUG = 'sparkyfitnessmobile';
const ANDROID_PROD_BUNDLE_IDENTIFIER = 'org.SparkyApps.SparkyFitnessMobile';
const IOS_PROD_BUNDLE_IDENTIFIER = 'com.SparkyApps.SparkyFitnessMobile';
const DEV_BUNDLE_IDENTIFIER = 'org.SparkyApps.SparkyFitnessMobile.dev';

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
  'android.permission.health.READ_DISTANCE',
  'android.permission.health.READ_ELEVATION_GAINED',
  'android.permission.health.READ_FLOORS_CLIMBED',
  'android.permission.health.READ_HEART_RATE',
  'android.permission.health.READ_HEIGHT',
  'android.permission.health.READ_HYDRATION',
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
  'android.permission.health.WRITE_DISTANCE',
  'android.permission.health.WRITE_ELEVATION_GAINED',
  'android.permission.health.WRITE_FLOORS_CLIMBED',
  'android.permission.health.WRITE_HEART_RATE',
  'android.permission.health.WRITE_HEIGHT',
  'android.permission.health.WRITE_HYDRATION',
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

export default ({ config }: ConfigContext): ExpoConfig => {
  const environment = process.env.APP_VARIANT || 'dev';

  const isDev = environment === 'dev' || environment === 'development';

  if (isDev) {
    androidPermissions.push(...devAndroidPermissions);
  }

  return {
    ...config,
    name: APP_NAME,
    slug: APP_SLUG,
    ios: {
      bundleIdentifier: isDev
        ? DEV_BUNDLE_IDENTIFIER
        : IOS_PROD_BUNDLE_IDENTIFIER,
      supportsTablet: false,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
      icon: './assets/icons/appicon.icon'
    },
    android: {
      package: isDev
        ? DEV_PACKAGE
        : PROD_PACKAGE,
      permissions: androidPermissions,
      adaptiveIcon: {
        foregroundImage: './assets/icons/adaptiveicon.png',
        backgroundColor: '#FFFFFF',
      }
    },
    extra: {
      ...config.extra,
      APP_VARIANT: environment,
      eas: {
        projectId: "498a86c5-344f-4d2c-9033-dfd720e4a383",
      },
    }, // expose to app at runtime
  };
};

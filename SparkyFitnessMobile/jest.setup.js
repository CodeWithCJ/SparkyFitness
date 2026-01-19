// Mock expo-asset
jest.mock('expo-asset', () => ({
  Asset: {
    loadAsync: jest.fn(),
    fromModule: jest.fn(() => ({ uri: 'mock-uri' })),
  },
}));

// Mock expo-font
jest.mock('expo-font', () => ({
  loadAsync: jest.fn(),
  isLoaded: jest.fn(() => true),
}));

// Mock @expo/vector-icons
jest.mock('@expo/vector-icons', () => {
  const { View } = require('react-native');
  return {
    Ionicons: View,
    MaterialIcons: View,
    FontAwesome: View,
    AntDesign: View,
  };
});

// Mock react-native-nitro-modules
jest.mock('react-native-nitro-modules', () => ({
  NitroModules: {
    createHybridObject: jest.fn(),
  },
}));

// Mock @kingstinct/react-native-healthkit
jest.mock('@kingstinct/react-native-healthkit', () => ({
  requestAuthorization: jest.fn().mockResolvedValue(true),
  queryQuantitySamples: jest.fn(),
  queryCategorySamples: jest.fn(),
  queryStatisticsForQuantity: jest.fn(),
  queryWorkoutSamples: jest.fn(),
  saveQuantitySample: jest.fn().mockResolvedValue(true),
  saveCategorySample: jest.fn().mockResolvedValue(true),
  saveWorkoutSample: jest.fn().mockResolvedValue({}),
  HKQuantityTypeIdentifier: {
    stepCount: 'HKQuantityTypeIdentifierStepCount',
    activeEnergyBurned: 'HKQuantityTypeIdentifierActiveEnergyBurned',
    basalEnergyBurned: 'HKQuantityTypeIdentifierBasalEnergyBurned',
    bodyMass: 'HKQuantityTypeIdentifierBodyMass',
    heartRate: 'HKQuantityTypeIdentifierHeartRate',
  },
  HKStatisticsOptions: {
    cumulativeSum: 'cumulativeSum',
  },
  isHealthDataAvailable: jest.fn().mockResolvedValue(true),
}));

// Mock react-native-health-connect
jest.mock('react-native-health-connect', () => ({
  initialize: jest.fn().mockResolvedValue(true),
  requestPermission: jest.fn().mockResolvedValue([]),
  readRecords: jest.fn().mockResolvedValue({ records: [] }),
  getSdkStatus: jest.fn().mockResolvedValue(3),
  SdkAvailabilityStatus: {
    SDK_AVAILABLE: 3,
  },
}));

// Mock react-native-background-fetch
jest.mock('react-native-background-fetch', () => ({
  configure: jest.fn(),
  scheduleTask: jest.fn(),
  finish: jest.fn(),
  STATUS_AVAILABLE: 2,
}));

// Mock @react-native-async-storage/async-storage
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// Mock react-native-gesture-handler
jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native').View;
  return {
    GestureHandlerRootView: View,
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    ScrollView: View,
    Slider: View,
    Switch: View,
    TextInput: View,
    ToolbarAndroid: View,
    ViewPagerAndroid: View,
    DrawerLayoutAndroid: View,
    WebView: View,
    NativeViewGestureHandler: View,
    TapGestureHandler: View,
    FlingGestureHandler: View,
    ForceTouchGestureHandler: View,
    LongPressGestureHandler: View,
    PanGestureHandler: View,
    PinchGestureHandler: View,
    RotationGestureHandler: View,
    RawButton: View,
    BaseButton: View,
    RectButton: View,
    BorderlessButton: View,
    FlatList: View,
    gestureHandlerRootHOC: jest.fn((component) => component),
    Directions: {},
  };
});

// Mock expo-web-browser
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
}));

// Mock expo-application
jest.mock('expo-application', () => ({
  nativeApplicationVersion: '1.0.0',
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      version: '1.0.0',
    },
  },
}));

// Mock @react-native-clipboard/clipboard
jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
  getString: jest.fn().mockResolvedValue(''),
}));

// Mock @gorhom/bottom-sheet
jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const { View, ScrollView } = require('react-native');
  return {
    BottomSheetModal: React.forwardRef(({ children }, ref) => {
      React.useImperativeHandle(ref, () => ({
        present: jest.fn(),
        dismiss: jest.fn(),
      }));
      return React.createElement(View, null, children);
    }),
    BottomSheetModalProvider: ({ children }) => React.createElement(View, null, children),
    BottomSheetView: ({ children, style }) => React.createElement(View, { style }, children),
    BottomSheetScrollView: ({ children, contentContainerStyle }) =>
      React.createElement(ScrollView, { contentContainerStyle }, children),
    BottomSheetBackdrop: () => null,
  };
});

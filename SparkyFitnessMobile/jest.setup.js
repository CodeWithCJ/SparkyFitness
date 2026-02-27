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

// Mock expo-task-manager
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(() => true),
  isTaskRegisteredAsync: jest.fn(() => Promise.resolve(false)),
  unregisterTaskAsync: jest.fn(() => Promise.resolve()),
}));

// Mock expo-background-task
jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn(() => Promise.resolve()),
  unregisterTaskAsync: jest.fn(() => Promise.resolve()),
  getStatusAsync: jest.fn(() => Promise.resolve(2)),
  triggerTaskWorkerForTestingAsync: jest.fn(() => Promise.resolve(true)),
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  BackgroundTaskResult: { Success: 1, Failed: 2 },
}));

// Mock expo-secure-store
jest.mock('expo-secure-store', () => {
  const store = {};
  return {
    AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
    setItemAsync: jest.fn(async (key, value) => { store[key] = value; }),
    getItemAsync: jest.fn(async (key) => store[key] ?? null),
    deleteItemAsync: jest.fn(async (key) => { delete store[key]; }),
    __store: store,
    __clear: () => { Object.keys(store).forEach(k => delete store[k]); },
  };
});

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

// Mock react-native-gesture-handler/ReanimatedSwipeable
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(({ children, renderRightActions, ...props }, ref) => {
      React.useImperativeHandle(ref, () => ({
        close: jest.fn(),
        reset: jest.fn(),
      }));
      return React.createElement(View, { testID: 'reanimated-swipeable', ...props },
        children,
        renderRightActions ? React.createElement(View, { testID: 'swipeable-right-actions' }, renderRightActions()) : null,
      );
    }),
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

// Mock @shopify/react-native-skia
jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Canvas: ({ children, style }) => React.createElement(View, { style, testID: 'skia-canvas' }, children),
    Circle: () => null,
    Rect: () => null,
    RoundedRect: () => null,
    Path: () => null,
    Group: ({ children }) => children,
    Skia: {
      Path: {
        Make: () => ({
          addArc: jest.fn().mockReturnThis(),
          moveTo: jest.fn().mockReturnThis(),
          lineTo: jest.fn().mockReturnThis(),
          close: jest.fn().mockReturnThis(),
        }),
      },
    },
    rect: jest.fn((x, y, width, height) => ({ x, y, width, height })),
    rrect: jest.fn((r, rx, ry) => ({ rect: r, rx, ry })),
  };
});

// Mock react-native-ui-datepicker
jest.mock('react-native-ui-datepicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props) => React.createElement(View, { testID: 'date-picker', ...props }),
  };
});

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

// Mock radon-ide (ESM module that Jest can't transform)
jest.mock('radon-ide', () => ({
  preview: jest.fn(),
}));

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
  enableBackgroundDelivery: jest.fn().mockResolvedValue(true),
  disableBackgroundDelivery: jest.fn().mockResolvedValue(undefined),
  disableAllBackgroundDelivery: jest.fn().mockResolvedValue(undefined),
  subscribeToChanges: jest.fn().mockReturnValue({ remove: jest.fn() }),
  UpdateFrequency: { immediate: 1, hourly: 2, daily: 3, weekly: 4 },
}));

// Mock react-native-health-connect
jest.mock('react-native-health-connect', () => ({
  initialize: jest.fn().mockResolvedValue(true),
  requestPermission: jest.fn().mockResolvedValue([]),
  readRecords: jest.fn().mockResolvedValue({ records: [] }),
  aggregateRecord: jest.fn().mockResolvedValue({}),
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

// Mock expo-notifications
jest.mock('expo-notifications', () => {
  let nextId = 1;
  return {
    setNotificationHandler: jest.fn(),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(undefined),
    getPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
    scheduleNotificationAsync: jest.fn(async () => `mock-notif-${nextId++}`),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
    AndroidImportance: { HIGH: 4, DEFAULT: 3, LOW: 2, MIN: 1, NONE: 0 },
    SchedulableTriggerInputTypes: {
      CALENDAR: 'calendar',
      DAILY: 'daily',
      WEEKLY: 'weekly',
      MONTHLY: 'monthly',
      YEARLY: 'yearly',
      DATE: 'date',
      TIME_INTERVAL: 'timeInterval',
    },
  };
});

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
}));

// Mock expo-camera
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');

  return {
    CameraView: React.forwardRef(({ children, ...props }, ref) => {
      React.useImperativeHandle(ref, () => ({
        takePictureAsync: jest.fn(),
      }));
      return React.createElement(View, { testID: 'camera-view', ...props }, children);
    }),
    useCameraPermissions: jest.fn(() => [{ granted: true }, jest.fn()]),
  };
});

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
    TouchableOpacity: View,
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

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  const createAnimationMock = () => ({ duration: () => createAnimationMock() });
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (init) => React.useRef({ value: init }).current,
    useAnimatedStyle: (fn) => fn(),
    useDerivedValue: (fn) => ({ value: fn() }),
    withTiming: (toValue) => toValue,
    withSpring: (toValue) => toValue,
    withSequence: (...args) => args[args.length - 1],
    useAnimatedReaction: jest.fn(),
    Easing: {
      linear: jest.fn(),
      ease: jest.fn(),
      bezier: jest.fn(() => jest.fn()),
      in: jest.fn(() => jest.fn()),
      out: jest.fn(() => jest.fn()),
      inOut: jest.fn(() => jest.fn()),
      cubic: jest.fn(),
      quad: jest.fn(),
      sin: jest.fn(),
      exp: jest.fn(),
    },
    FadeIn: createAnimationMock(),
    FadeOut: createAnimationMock(),
    LinearTransition: createAnimationMock(),
  };
});

// Mock react-native-keyboard-controller
jest.mock('react-native-keyboard-controller', () => {
  const React = require('react');
  const { ScrollView } = require('react-native');

  return {
    KeyboardProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    KeyboardAwareScrollView: React.forwardRef(({ children, ...props }, ref) =>
      React.createElement(ScrollView, { ...props, ref }, children),
    ),
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

// Mock expo-device
jest.mock('expo-device', () => ({
  modelName: 'iPhone 15 Pro',
  manufacturer: 'Apple',
  osVersion: '18.3',
}));

// Mock expo-file-system
jest.mock('expo-file-system', () => {
  const MockFile = jest.fn().mockImplementation(() => ({
    uri: 'file:///mock-cache/mock-file.json',
    create: jest.fn(),
    write: jest.fn(),
    delete: jest.fn(),
  }));
  return {
    File: MockFile,
    Paths: { cache: { uri: 'file:///mock-cache/' } },
  };
});

// Mock expo-sharing
jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(undefined),
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
    matchFont: jest.fn(() => null),
  };
});

// Mock victory-native
jest.mock('victory-native', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    CartesianChart: ({ children, ...props }) => React.createElement(View, { testID: 'cartesian-chart', ...props }),
    Bar: () => null,
    useChartPressState: jest.fn(() => ({
      state: {
        isActive: { value: false },
        matchedIndex: { value: -1 },
        x: { value: { value: '' }, position: { value: 0 } },
        y: { steps: { value: { value: 0 }, position: { value: 0 } } },
        yIndex: { value: 0 },
      },
      isActive: false,
    })),
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

// Mock uniwind
jest.mock('uniwind', () => ({
  useCSSVariable: jest.fn((vars) =>
    Array.isArray(vars) ? vars.map(() => '#888888') : '#888888'
  ),
  useUniwind: jest.fn(() => ({ theme: 'light', hasAdaptiveThemes: false })),
  Uniwind: {
    setTheme: jest.fn(),
  },
}));

// Mock react-native-toast-message
jest.mock('react-native-toast-message', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockToast = (props) => React.createElement(View, { testID: 'toast', ...props });
  MockToast.show = jest.fn();
  MockToast.hide = jest.fn();
  return { __esModule: true, default: MockToast };
});

// Mock react-native-pager-view
jest.mock('react-native-pager-view', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: React.forwardRef(({ children, ...props }, ref) =>
      React.createElement(View, { testID: 'pager-view', ref, ...props }, children),
    ),
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

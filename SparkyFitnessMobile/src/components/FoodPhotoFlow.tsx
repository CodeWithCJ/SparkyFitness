import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import FoodPhotoImproveScreen from '../screens/FoodPhotoImproveScreen';
import FoodPhotoEstimateReviewScreen from '../screens/FoodPhotoEstimateReviewScreen';
import FoodPhotoLogEntryScreen from '../screens/FoodPhotoLogEntryScreen';
import { withErrorBoundary } from './ScreenErrorBoundary';
import type { FoodPhotoFlowParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<FoodPhotoFlowParamList>();

const SafeImprove = withErrorBoundary(FoodPhotoImproveScreen, 'FoodPhotoImprove', { canGoBack: true });
const SafeEstimateReview = withErrorBoundary(
  FoodPhotoEstimateReviewScreen,
  'FoodPhotoEstimateReview',
  { canGoBack: true },
);
const SafeLogEntry = withErrorBoundary(FoodPhotoLogEntryScreen, 'FoodPhotoLogEntry', { canGoBack: true });

// Native-stack presents this flow as a modal, which gives it a separate
// view hierarchy that doesn't always inherit the root KeyboardProvider's
// keyboard events. Wrap the flow in its own KeyboardProvider so
// KeyboardStickyView / KeyboardAwareScrollView work inside the modal.
const FoodPhotoFlow: React.FC = () => (
  <KeyboardProvider>
    <Stack.Navigator
      initialRouteName="Improve"
      screenOptions={{ headerShown: false, gestureEnabled: true }}
    >
      <Stack.Screen name="Improve" component={SafeImprove} />
      <Stack.Screen name="EstimateReview" component={SafeEstimateReview} />
      <Stack.Screen name="LogEntry" component={SafeLogEntry} />
    </Stack.Navigator>
  </KeyboardProvider>
);

export default FoodPhotoFlow;

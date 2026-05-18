import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import FoodPhotoImproveScreen from '../screens/FoodPhotoImproveScreen';
import FoodPhotoEstimateReviewScreen from '../screens/FoodPhotoEstimateReviewScreen';
import FoodPhotoLogEntryScreen from '../screens/FoodPhotoLogEntryScreen';
import { withErrorBoundary } from '../components/ScreenErrorBoundary';
import type { FoodPhotoFlowParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<FoodPhotoFlowParamList>();

const SafeImprove = withErrorBoundary(FoodPhotoImproveScreen, 'FoodPhotoImprove', { canGoBack: true });
const SafeEstimateReview = withErrorBoundary(
  FoodPhotoEstimateReviewScreen,
  'FoodPhotoEstimateReview',
  { canGoBack: true },
);
const SafeLogEntry = withErrorBoundary(FoodPhotoLogEntryScreen, 'FoodPhotoLogEntry', { canGoBack: true });

const FoodPhotoFlow: React.FC = () => (
  <Stack.Navigator
    initialRouteName="Improve"
    screenOptions={{ headerShown: false, gestureEnabled: true }}
  >
    <Stack.Screen name="Improve" component={SafeImprove} />
    <Stack.Screen name="EstimateReview" component={SafeEstimateReview} />
    <Stack.Screen name="LogEntry" component={SafeLogEntry} />
  </Stack.Navigator>
);

export default FoodPhotoFlow;

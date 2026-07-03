import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { fireSuccessHaptic } from '../../src/services/haptics';
import {
  useAppPreferencesStore,
  __resetAppPreferencesStoreForTests,
} from '../../src/stores/appPreferencesStore';

describe('haptics service', () => {
  const mockNotificationAsync = Haptics.notificationAsync as jest.MockedFunction<
    typeof Haptics.notificationAsync
  >;

  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetAppPreferencesStoreForTests();
    mockNotificationAsync.mockClear();
  });

  it('fires success haptics', () => {
    fireSuccessHaptic();

    expect(mockNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockNotificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
  });

  it('does not fire when haptics are disabled', () => {
    useAppPreferencesStore.getState().setHapticsEnabled(false);

    fireSuccessHaptic();

    expect(mockNotificationAsync).not.toHaveBeenCalled();
  });

  it('swallows success haptic rejections', () => {
    mockNotificationAsync.mockRejectedValueOnce(new Error('boom'));

    expect(() => fireSuccessHaptic()).not.toThrow();
  });
});

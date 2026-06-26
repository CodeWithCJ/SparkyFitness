import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import {
  fireSuccessHaptic,
  setHapticsEnabled,
  __resetHapticsStateForTests,
} from '../../src/services/haptics';

describe('haptics service', () => {
  const mockNotificationAsync = Haptics.notificationAsync as jest.MockedFunction<
    typeof Haptics.notificationAsync
  >;

  beforeEach(async () => {
    await AsyncStorage.clear();
    __resetHapticsStateForTests();
    mockNotificationAsync.mockClear();
  });

  it('fires success haptics', () => {
    fireSuccessHaptic();

    expect(mockNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockNotificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
  });

  it('does not fire when haptics are disabled', async () => {
    await setHapticsEnabled(false);

    fireSuccessHaptic();

    expect(mockNotificationAsync).not.toHaveBeenCalled();
  });

  it('swallows success haptic rejections', () => {
    mockNotificationAsync.mockRejectedValueOnce(new Error('boom'));

    expect(() => fireSuccessHaptic()).not.toThrow();
  });
});

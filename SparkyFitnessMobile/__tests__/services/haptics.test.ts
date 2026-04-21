import * as Haptics from 'expo-haptics';
import { fireSuccessHaptic } from '../../src/services/haptics';

describe('haptics service', () => {
  const mockNotificationAsync = Haptics.notificationAsync as jest.MockedFunction<
    typeof Haptics.notificationAsync
  >;

  beforeEach(() => {
    mockNotificationAsync.mockClear();
  });

  it('fires success haptics', () => {
    fireSuccessHaptic();

    expect(mockNotificationAsync).toHaveBeenCalledTimes(1);
    expect(mockNotificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
  });

  it('swallows success haptic rejections', () => {
    mockNotificationAsync.mockRejectedValueOnce(new Error('boom'));

    expect(() => fireSuccessHaptic()).not.toThrow();
  });
});

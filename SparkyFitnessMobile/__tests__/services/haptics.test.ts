import * as Haptics from 'expo-haptics';
import { fireSelectionHaptic, fireSuccessHaptic } from '../../src/services/haptics';

describe('haptics service', () => {
  const mockSelectionAsync = Haptics.selectionAsync as jest.MockedFunction<
    typeof Haptics.selectionAsync
  >;
  const mockNotificationAsync = Haptics.notificationAsync as jest.MockedFunction<
    typeof Haptics.notificationAsync
  >;

  beforeEach(() => {
    mockSelectionAsync.mockClear();
    mockNotificationAsync.mockClear();
  });

  it('fires selection haptics', () => {
    fireSelectionHaptic();

    expect(mockSelectionAsync).toHaveBeenCalledTimes(1);
  });

  it('swallows selection haptic rejections', () => {
    mockSelectionAsync.mockRejectedValueOnce(new Error('boom'));

    expect(() => fireSelectionHaptic()).not.toThrow();
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

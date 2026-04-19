import * as Haptics from 'expo-haptics';
import {
  fireSelectionHaptic,
  fireSheetOpenHaptic,
  fireSuccessHaptic,
} from '../../src/services/haptics';

describe('haptics service', () => {
  const mockSelectionAsync = Haptics.selectionAsync as jest.MockedFunction<
    typeof Haptics.selectionAsync
  >;
  const mockNotificationAsync = Haptics.notificationAsync as jest.MockedFunction<
    typeof Haptics.notificationAsync
  >;
  const mockImpactAsync = Haptics.impactAsync as jest.MockedFunction<
    typeof Haptics.impactAsync
  >;

  beforeEach(() => {
    mockSelectionAsync.mockClear();
    mockNotificationAsync.mockClear();
    mockImpactAsync.mockClear();
  });

  it('fires selection haptics', () => {
    fireSelectionHaptic();

    expect(mockSelectionAsync).toHaveBeenCalledTimes(1);
  });

  it('swallows selection haptic rejections', () => {
    mockSelectionAsync.mockRejectedValueOnce(new Error('boom'));

    expect(() => fireSelectionHaptic()).not.toThrow();
  });

  it('fires sheet-open haptics with a rigid impact', () => {
    fireSheetOpenHaptic();

    expect(mockImpactAsync).toHaveBeenCalledTimes(1);
    expect(mockImpactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Rigid);
  });

  it('swallows sheet-open haptic rejections', () => {
    mockImpactAsync.mockRejectedValueOnce(new Error('boom'));

    expect(() => fireSheetOpenHaptic()).not.toThrow();
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

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import EquipmentScreen from '../../src/screens/EquipmentScreen';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));

describe('EquipmentScreen', () => {
  beforeAll(async () => {
    await initializeI18n();
  });

  it('opens the shoes list from the Shoes row', () => {
    const navigate = jest.fn();
    const props = {
      navigation: { navigate },
    } as unknown as RootStackScreenProps<'Equipment'>;
    render(<EquipmentScreen {...props} />);

    fireEvent.press(screen.getByTestId('equipment-shoes'));

    expect(navigate).toHaveBeenCalledWith('Shoes');
  });
});

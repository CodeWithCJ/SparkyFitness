import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import FocusWorkoutSettingsPage from '../../src/components/FocusWorkoutSettingsPage';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';

describe('FocusWorkoutSettingsPage', () => {
  beforeEach(() => {
    useAppPreferencesStore.setState({
      watchRpeEnabled: false,
      focusNowBanner: true,
      focusHoldAtZero: 'keep',
      focusShowPrevious: true,
      focusMediaDefault: 'expanded',
      defaultRestSec: 90,
    });
  });

  it('shows the focus settings and writes the preferences', () => {
    const onClose = jest.fn();
    const { getByText, getByTestId, getByLabelText } = render(
      <FocusWorkoutSettingsPage visible onClose={onClose} />
    );
    expect(getByText('Ask for effort (RPE) after each set')).toBeTruthy();
    expect(getByText('Timed hold at zero')).toBeTruthy();

    fireEvent(getByTestId('focus-settings-ask-effort'), 'valueChange', true);
    expect(useAppPreferencesStore.getState().watchRpeEnabled).toBe(true);

    fireEvent(getByTestId('focus-settings-previous'), 'valueChange', false);
    expect(useAppPreferencesStore.getState().focusShowPrevious).toBe(false);

    fireEvent(getByTestId('focus-settings-large-image'), 'valueChange', false);
    expect(useAppPreferencesStore.getState().focusMediaDefault).toBe(
      'minimized'
    );

    fireEvent.press(getByText('Log at zero'));
    expect(useAppPreferencesStore.getState().focusHoldAtZero).toBe('log');

    fireEvent.press(getByLabelText('Longer default rest'));
    expect(useAppPreferencesStore.getState().defaultRestSec).toBe(105);

    fireEvent.press(getByTestId('focus-settings-done'));
    expect(onClose).toHaveBeenCalled();
  });
});

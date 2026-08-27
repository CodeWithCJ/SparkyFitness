import React from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';

import i18n, { initializeI18n } from '../../src/localization/i18n';
import { useAppLocale } from '../../src/localization';

describe('useAppLocale', () => {
  beforeAll(async () => {
    await initializeI18n('pl');
  });

  afterEach(async () => {
    await i18n.changeLanguage('en');
  });

  it('re-renders an already-mounted consumer directly from i18n.languageChanged', async () => {
    const Probe = () => <Text testID="locale">{useAppLocale()}</Text>;

    await act(async () => {
      await i18n.changeLanguage('pl');
    });
    const screen = render(<Probe />);
    expect(screen.getByTestId('locale').props.children).toBe('pl-PL');

    await act(async () => {
      await i18n.changeLanguage('en');
    });
    await waitFor(() => {
      expect(screen.getByTestId('locale').props.children).toBe('en-US');
    });

    await act(async () => {
      await i18n.changeLanguage('pl');
    });
    await waitFor(() => {
      expect(screen.getByTestId('locale').props.children).toBe('pl-PL');
    });

    await act(async () => {
      await i18n.changeLanguage('es');
    });
    await waitFor(() => {
      expect(screen.getByTestId('locale').props.children).toBe('es-ES');
    });
  });
});

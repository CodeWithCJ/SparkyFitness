import React from 'react';
import { Text, TextInput, View } from 'react-native';
import { act, render } from '@testing-library/react-native';

import i18n, { applyLanguagePreference } from '../../src/localization/i18n';

describe('mobile localization Babel integration', () => {
  afterEach(async () => {
    await act(async () => {
      await i18n.changeLanguage('en');
    });
  });

  it('localizes React Native Text and static UI properties', async () => {
    await applyLanguagePreference('pl');

    const screen = render(
      <View>
        <Text>App Settings</Text>
        <TextInput placeholder="Search foods..." accessibilityLabel="Search foods..." />
      </View>,
    );

    expect(screen.getByText('Ustawienia aplikacji')).toBeTruthy();
    expect(screen.getByPlaceholderText('Szukaj produktów...')).toBeTruthy();
    expect(screen.getByLabelText('Szukaj produktów...')).toBeTruthy();
  });
});

import React from 'react';
import { Image } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { OidcProviderLogo } from '../../src/components/MfaForm';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: any) => <View testID={`icon-${name}`} />,
  };
});

const SERVER_URL = 'https://sparky.example.com';

describe('OidcProviderLogo', () => {
  it('renders the globe fallback when no logo is configured', () => {
    const { getByTestId } = render(
      <OidcProviderLogo logoUrl={undefined} serverUrl={SERVER_URL} />,
    );

    expect(getByTestId('icon-globe')).toBeTruthy();
  });

  it('resolves a server-relative logo path against the server URL', () => {
    const { UNSAFE_getByType } = render(
      <OidcProviderLogo logoUrl="/uploads/logo.png" serverUrl={SERVER_URL} />,
    );

    expect(UNSAFE_getByType(Image).props.source.uri).toBe(
      `${SERVER_URL}/uploads/logo.png`,
    );
  });

  it('uses an absolute logo URL as-is', () => {
    const { UNSAFE_getByType } = render(
      <OidcProviderLogo logoUrl="https://cdn.example.com/logo.png" serverUrl={SERVER_URL} />,
    );

    expect(UNSAFE_getByType(Image).props.source.uri).toBe(
      'https://cdn.example.com/logo.png',
    );
  });

  it('falls back to the globe when the logo fails to load', () => {
    jest.useFakeTimers();
    try {
      const { UNSAFE_getByType, getByTestId, queryByTestId } = render(
        <OidcProviderLogo logoUrl="/uploads/broken.png" serverUrl={SERVER_URL} />,
      );

      expect(queryByTestId('icon-globe')).toBeNull();

      // SafeImage retries twice with backoff before surrendering to the
      // fallback; fail the initial load and both retries.
      fireEvent(UNSAFE_getByType(Image), 'error');
      act(() => jest.runAllTimers());
      fireEvent(UNSAFE_getByType(Image), 'error');
      act(() => jest.runAllTimers());
      fireEvent(UNSAFE_getByType(Image), 'error');

      expect(getByTestId('icon-globe')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

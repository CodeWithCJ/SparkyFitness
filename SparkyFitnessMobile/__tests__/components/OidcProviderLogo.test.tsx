import React from 'react';
import { Image } from 'expo-image';
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

  it('resolves a relative logo path missing its leading slash', () => {
    const { UNSAFE_getByType } = render(
      <OidcProviderLogo logoUrl="uploads/logo.png" serverUrl={SERVER_URL} />,
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

  it('shows the globe underlay for a slow load and keeps it when the logo fails', () => {
    jest.useFakeTimers();
    try {
      const { UNSAFE_getByType, UNSAFE_queryByType, getByTestId, queryByTestId } = render(
        <OidcProviderLogo logoUrl="/uploads/broken.png" serverUrl={SERVER_URL} />,
      );

      // The underlay is held back for a grace period so cached loads never
      // flash it; a slow load gets it as a placeholder beneath the image.
      expect(queryByTestId('icon-globe')).toBeNull();
      act(() => jest.advanceTimersByTime(200));
      expect(getByTestId('icon-globe')).toBeTruthy();

      // SafeImage retries twice with backoff before surrendering to the
      // fallback; fail the initial load and both retries.
      fireEvent(UNSAFE_getByType(Image), 'error');
      act(() => jest.runAllTimers());
      fireEvent(UNSAFE_getByType(Image), 'error');
      act(() => jest.runAllTimers());
      fireEvent(UNSAFE_getByType(Image), 'error');

      expect(UNSAFE_queryByType(Image)).toBeNull();
      expect(getByTestId('icon-globe')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('never shows the underlay when the logo loads within the grace period', () => {
    jest.useFakeTimers();
    try {
      const { UNSAFE_getByType, queryByTestId } = render(
        <OidcProviderLogo logoUrl="/uploads/logo.png" serverUrl={SERVER_URL} />,
      );

      fireEvent(UNSAFE_getByType(Image), 'load');
      act(() => jest.runAllTimers());

      expect(queryByTestId('icon-globe')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('removes the underlay of a slow load once the logo has faded in', () => {
    jest.useFakeTimers();
    try {
      const { UNSAFE_getByType, getByTestId, queryByTestId } = render(
        <OidcProviderLogo logoUrl="/uploads/logo.png" serverUrl={SERVER_URL} />,
      );

      act(() => jest.advanceTimersByTime(200));
      expect(getByTestId('icon-globe')).toBeTruthy();

      fireEvent(UNSAFE_getByType(Image), 'load');
      act(() => jest.runAllTimers());

      expect(queryByTestId('icon-globe')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

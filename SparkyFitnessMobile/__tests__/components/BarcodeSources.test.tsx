import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import BarcodeSources from '../../src/components/BarcodeSources';
import { fetchBarcodeAlternatives } from '../../src/services/api/barcodeLookupApi';
import { getActiveServerConfig } from '../../src/services/storage';
import type { BarcodeCandidate } from '@workspace/shared';

jest.mock('../../src/services/api/barcodeLookupApi', () => ({
  fetchBarcodeAlternatives: jest.fn(),
}));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
}));

const candidate: BarcodeCandidate = {
  providerId: 'provider-two',
  providerName: 'Second source',
  source: 'openfoodfacts',
  status: 'found',
  food: {
    name: 'Alternative milk',
    brand: null,
    provider_type: 'openfoodfacts',
    provider_external_id: 'external-two',
    is_custom: false,
    default_variant: {
      serving_size: 250,
      serving_unit: 'ml',
      calories: 125,
      protein: 8,
      carbs: 12,
      fat: 5,
      is_default: true,
    },
  },
};

const context = {
  barcode: '1234567890123',
  providerId: 'local',
  providerName: 'Your foods',
  accountId: 'account-one',
};

describe('BarcodeSources', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getActiveServerConfig).mockResolvedValue({
      id: 'account-one',
      url: 'https://example.com',
      apiKey: 'test-key',
    });
    jest.mocked(fetchBarcodeAlternatives).mockResolvedValue({
      results: [candidate],
    });
  });

  it('loads alternatives only on request, including after a local match', async () => {
    const onSelect = jest.fn();
    const screen = render(
      <BarcodeSources context={context} onSelect={onSelect} />
    );
    expect(fetchBarcodeAlternatives).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Other sources'));
    await waitFor(() =>
      expect(screen.getByText('Alternative milk')).toBeTruthy()
    );
    expect(screen.getByText('Per 100 ml')).toBeTruthy();
    expect(screen.getByText(/50 kcal/)).toBeTruthy();
    fireEvent.press(screen.getByText('Alternative milk'));
    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          provider_external_id: 'external-two',
          source: 'external',
        }),
        expect.objectContaining({
          providerId: 'provider-two',
          barcode: context.barcode,
        })
      )
    );
  });

  it('discards an alternatives response when the active account changes', async () => {
    let resolveRequest: (
      result: Awaited<ReturnType<typeof fetchBarcodeAlternatives>>
    ) => void = () => undefined;
    jest.mocked(fetchBarcodeAlternatives).mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );
    const screen = render(
      <BarcodeSources context={context} onSelect={jest.fn()} />
    );
    fireEvent.press(screen.getByText('Other sources'));
    await waitFor(() => expect(fetchBarcodeAlternatives).toHaveBeenCalled());
    jest.mocked(getActiveServerConfig).mockResolvedValue({
      id: 'account-two',
      url: 'https://other.example.com',
      apiKey: 'test-key',
    });
    await act(async () => {
      resolveRequest({
        results: [candidate],
      });
    });
    await waitFor(() =>
      expect(screen.queryByText('Alternative milk')).toBeNull()
    );
    expect(screen.queryByText('Second source')).toBeNull();
  });

  it('excludes only the exact known current provider, retaining another provider of the same type', async () => {
    jest.mocked(fetchBarcodeAlternatives).mockResolvedValue({
      results: [
        candidate,
        {
          ...candidate,
          providerId: 'provider-three',
          providerName: 'Third source',
          food: { ...candidate.food!, name: 'Third-source milk' },
        },
      ],
    });
    const screen = render(
      <BarcodeSources
        context={{ ...context, providerId: candidate.providerId }}
        onSelect={jest.fn()}
      />
    );
    fireEvent.press(screen.getByText('Other sources'));
    await waitFor(() =>
      expect(screen.getByText('Third-source milk')).toBeTruthy()
    );
    expect(screen.queryByText('Alternative milk')).toBeNull();
  });

  it('retains candidates when the current provider identity is unknown', async () => {
    const screen = render(
      <BarcodeSources
        context={{ ...context, providerId: undefined }}
        onSelect={jest.fn()}
      />
    );
    fireEvent.press(screen.getByText('Other sources'));
    await waitFor(() =>
      expect(screen.getByText('Alternative milk')).toBeTruthy()
    );
  });

  it.each([false, true])(
    'shows an empty state when there are no alternatives (current local result: %s)',
    async (includeCurrent) => {
      jest.mocked(fetchBarcodeAlternatives).mockResolvedValue({
        results: includeCurrent
          ? [{ ...candidate, providerId: 'local', source: 'local' }]
          : [],
      });
      const screen = render(
        <BarcodeSources context={context} onSelect={jest.fn()} />
      );
      fireEvent.press(screen.getByText('Other sources'));
      await waitFor(() =>
        expect(screen.getByText('No other sources available')).toBeTruthy()
      );
      expect(screen.queryByText('Alternative milk')).toBeNull();
    }
  );

  it('labels the fallback and keeps an external selection specific to this flow', () => {
    const screen = render(
      <BarcodeSources
        context={{
          ...context,
          providerId: 'openfoodfacts-fallback',
        }}
        onSelect={jest.fn()}
      />
    );
    expect(screen.getByText('Open Food Facts fallback')).toBeTruthy();
    expect(screen.queryByText('Prefer for this barcode')).toBeNull();
    expect(screen.queryByText('Reset barcode preference')).toBeNull();
  });

  it('does not reopen cached alternatives for another active account', async () => {
    const screen = render(
      <BarcodeSources context={context} onSelect={jest.fn()} />
    );
    fireEvent.press(screen.getByText('Other sources'));
    await waitFor(() =>
      expect(screen.getByText('Alternative milk')).toBeTruthy()
    );
    fireEvent.press(screen.getByText('Close'));
    jest.mocked(getActiveServerConfig).mockResolvedValue({
      id: 'account-two',
      url: 'https://other.example.com',
      apiKey: 'test-key',
    });
    fireEvent.press(screen.getByText('Other sources'));
    await waitFor(() =>
      expect(
        screen.getByText('Could not load barcode sources. Please try again.')
      ).toBeTruthy()
    );
    expect(screen.queryByText('Alternative milk')).toBeNull();
  });
});

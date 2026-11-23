/**
 * The food search with the REAL hooks and a REAL saved-foods database: only
 * the network is down. The other FoodSearchScreen tests replace every hook, so
 * they cannot tell whether a saved food actually reaches the screen.
 */
import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FoodSearchScreen from '../../src/screens/FoodSearchScreen';
import { apiFetch } from '../../src/services/api/apiClient';
import { __setOfflineDbForTests } from '../../src/offline/db';
import { setServerKnownUnreachable } from '../../src/offline/connection';
import { refreshFoodLibrary } from '../../src/offline/foodLibrary';
import { putCacheRows } from '../../src/offline/cacheStore';
import {
  IDENTITY_COLLECTION,
  IDENTITY_KEY,
} from '../../src/offline/syncEngine';
import type { OfflineDb } from '../../src/offline/types';
import { createTestDb } from '../helpers/offlineTestDb';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfigId: jest.fn(async () => 's1'),
  getActiveServerConfig: jest.fn(async () => ({
    id: 's1',
    url: 'http://server',
  })),
}));
jest.mock('../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
  normalizeUrl: (url: string) => url,
}));
// The connection check says the server cannot be reached; a server is set up.
jest.mock('../../src/services/api/healthDataApi', () => ({
  ...jest.requireActual('../../src/services/api/healthDataApi'),
  checkServerConnection: jest.fn(async () => false),
}));
jest.mock('../../src/hooks/useServerConfigs', () => ({
  useServerConfigs: () => ({
    activeConfig: { id: 's1', url: 'http://server' },
    isLoading: false,
  }),
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  ...jest.requireActual('../../src/services/nativeTabBarPreference'),
  useNativeIOSHeadersActive: jest.fn(() => true),
}));
jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
  useUniwind: () => ({ theme: 'light' }),
}));
jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  push: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
} as any;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
  useFocusEffect: jest.fn(),
}));

const food = (id: string, name: string, brand: string | null = null) => ({
  id,
  name,
  brand,
  is_custom: true,
  default_variant: {
    id: `v-${id}`,
    serving_size: 355,
    serving_unit: 'ml',
    calories: 10,
    protein: 0,
    carbs: 2,
    fat: 0,
  },
});

describe('FoodSearchScreen with the server away (real hooks, real saved foods)', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);

    // The pack, downloaded while connected.
    const own = [
      food('f1', 'Sparkling Orange', 'Celsius'),
      food('f2', 'Greek Yogurt'),
    ];
    mockApiFetch.mockImplementation((async ({
      endpoint,
    }: {
      endpoint: string;
    }) => {
      if (endpoint === '/api/foods') return { recentFoods: own, topFoods: [] };
      if (endpoint === '/api/meals') return [];
      if (endpoint === '/api/water-containers') return [];
      if (endpoint === '/api/meal-types') return [];
      if (endpoint.startsWith('/api/foods/foods-paginated')) {
        return { foods: own, totalCount: own.length };
      }
      if (endpoint.startsWith('/api/foods/food-variants')) return [];
      throw new Error(`unexpected ${endpoint}`);
    }) as never);
    await refreshFoodLibrary(db, 's1');

    // Airplane mode: every request now fails the way iOS reports it.
    mockApiFetch.mockImplementation(() =>
      Promise.reject(new TypeError('Network request failed'))
    );
    setServerKnownUnreachable(true);
  });

  afterEach(() => {
    setServerKnownUnreachable(false);
    __setOfflineDbForTests(null);
    db.close();
  });

  function renderScreen(term: string | null) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const screen = render(
      <QueryClientProvider client={client}>
        <SafeAreaProvider
          initialMetrics={{
            insets: { top: 0, bottom: 0, left: 0, right: 0 },
            frame: { x: 0, y: 0, width: 390, height: 844 },
          }}
        >
          <FoodSearchScreen
            navigation={mockNavigation}
            route={
              {
                key: 'FoodSearch-key',
                name: 'FoodSearch',
                params: { date: '2026-11-21' },
              } as any
            }
          />
        </SafeAreaProvider>
      </QueryClientProvider>
    );
    if (term !== null) {
      fireEvent.changeText(
        screen.getByPlaceholderText('Search foods...'),
        term
      );
    }
    return screen;
  }

  it('lists the recent foods before anything is typed', async () => {
    const screen = renderScreen(null);

    expect(await screen.findByText('Sparkling Orange')).toBeTruthy();
    expect(screen.getByText('Greek Yogurt')).toBeTruthy();
    expect(
      screen.queryByText('Connect to a server to search foods')
    ).toBeNull();
  });

  it('finds a saved food by its brand', async () => {
    const screen = renderScreen('celsius');

    expect(await screen.findByText('Sparkling Orange')).toBeTruthy();
    expect(
      screen.queryByText('Connect to a server to search foods')
    ).toBeNull();
  });

  it('finds it by several words, in any order, like the server does', async () => {
    const screen = renderScreen('orange celsius');

    expect(await screen.findByText('Sparkling Orange')).toBeTruthy();
  });

  it('says nothing saved was found for a food the phone does not have', async () => {
    const screen = renderScreen('zzzz');

    await waitFor(() =>
      expect(screen.getByText('No saved foods or meals found')).toBeTruthy()
    );
  });
});

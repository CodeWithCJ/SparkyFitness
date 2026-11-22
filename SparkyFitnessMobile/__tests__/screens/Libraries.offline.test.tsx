/**
 * The Foods and Meals libraries with the REAL hooks and a REAL saved database:
 * only the network is down. Mocked-hook tests cannot show that a saved food or
 * meal actually reaches these screens.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FoodsLibraryScreen from '../../src/screens/FoodsLibraryScreen';
import MealsLibraryScreen from '../../src/screens/MealsLibraryScreen';
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
  useNativeIOSTabsActive: jest.fn(() => false),
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

const food = (id: string, name: string) => ({
  id,
  name,
  brand: null,
  is_custom: true,
  user_id: 'u1',
  default_variant: {
    id: `v-${id}`,
    serving_size: 1,
    serving_unit: 'cup',
    calories: 100,
    protein: 1,
    carbs: 1,
    fat: 1,
  },
});

describe('the libraries with the server away (real hooks, real saved data)', () => {
  let db: OfflineDb & { close(): void };

  beforeEach(async () => {
    jest.clearAllMocks();
    db = await createTestDb();
    __setOfflineDbForTests(db);
    await putCacheRows(db, 's1', IDENTITY_COLLECTION, [
      { key: IDENTITY_KEY, payload: { id: 'u1' } },
    ]);
    const own = [food('f1', 'Greek Yogurt')];
    mockApiFetch.mockImplementation((async ({
      endpoint,
    }: {
      endpoint: string;
    }) => {
      if (endpoint === '/api/foods') return { recentFoods: own, topFoods: [] };
      if (endpoint === '/api/meals') {
        return [
          {
            id: 'm1',
            name: 'Overnight Oats',
            user_id: 'u1',
            is_public: false,
            foods: [],
          },
        ];
      }
      if (endpoint === '/api/water-containers') return [];
      if (endpoint === '/api/meal-types') return [];
      if (endpoint.startsWith('/api/foods/foods-paginated')) {
        return { foods: own, totalCount: 1 };
      }
      if (endpoint.startsWith('/api/foods/food-variants')) return [];
      throw new Error(`unexpected ${endpoint}`);
    }) as never);
    await refreshFoodLibrary(db, 's1');
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

  function renderWithProviders(ui: React.ReactElement) {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return render(
      <QueryClientProvider client={client}>
        <SafeAreaProvider
          initialMetrics={{
            insets: { top: 0, bottom: 0, left: 0, right: 0 },
            frame: { x: 0, y: 0, width: 390, height: 844 },
          }}
        >
          {ui}
        </SafeAreaProvider>
      </QueryClientProvider>
    );
  }

  it('lists the saved foods', async () => {
    const screen = renderWithProviders(
      <FoodsLibraryScreen
        navigation={mockNavigation}
        route={{ key: 'k', name: 'FoodsLibrary', params: undefined } as any}
      />
    );

    expect(await screen.findByText('Greek Yogurt')).toBeTruthy();
    expect(screen.queryByText("Can't reach your server")).toBeNull();
  });

  it('lists the saved meals', async () => {
    const screen = renderWithProviders(
      <MealsLibraryScreen
        navigation={mockNavigation}
        route={{ key: 'k', name: 'MealsLibrary', params: undefined } as any}
      />
    );

    expect(await screen.findByText('Overnight Oats')).toBeTruthy();
    expect(screen.queryByText("Can't reach your server")).toBeNull();
  });
});

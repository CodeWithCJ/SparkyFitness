import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MeasurementsAddScreen from '../../src/screens/MeasurementsAddScreen';
import { apiFetch } from '../../src/services/api/apiClient';
import type { RootStackScreenProps } from '../../src/types/navigation';

/**
 * End-to-end wiring test for the previous-value hints.
 *
 * Every other screen test mocks the measurement hooks and every hook test mocks
 * the API client, so neither would catch a mistake in the URL, the response
 * field names, or the hook-to-screen handoff. This suite mocks only the network
 * boundary and lets the real hooks, the real API layer, the real derivation
 * helpers and the real screen run, which is what proves a hint appears when the
 * server answers.
 */

jest.mock('../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const ENTRY_DATE = '2024-06-15';

const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  navigate: jest.fn(),
  dispatch: jest.fn(),
} as unknown as RootStackScreenProps<'MeasurementsAdd'>['navigation'];

// Defined after `mockNavigation` so the factory below can close over it.
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
  useFocusEffect: jest.fn((callback: () => void) => {
    callback();
  }),
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

jest.mock('../../src/components/CalendarSheet', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ReactModule.forwardRef(
      (_props: unknown, ref: React.Ref<unknown>) => {
        ReactModule.useImperativeHandle(ref, () => ({
          present: jest.fn(),
          dismiss: jest.fn(),
        }));
        return <View testID="calendar-sheet" />;
      }
    ),
  };
});

const insets = { top: 0, bottom: 0, left: 0, right: 0 };
const frame = { x: 0, y: 0, width: 390, height: 844 };

type FetchCall = { endpoint: string; method?: string };

/**
 * Answers the network by endpoint. Anything unmatched resolves to an empty
 * array so a newly-added query cannot turn this suite into an unhandled
 * rejection.
 */
const respond = (responses: Record<string, unknown>) => {
  mockApiFetch.mockImplementation((options: unknown) => {
    const { endpoint } = options as FetchCall;
    const key = Object.keys(responses).find((candidate) =>
      endpoint.startsWith(candidate)
    );
    return Promise.resolve(key ? responses[key] : []);
  });
};

const renderScreen = () => {
  const route: RootStackScreenProps<'MeasurementsAdd'>['route'] = {
    key: 'MeasurementsAdd-key',
    name: 'MeasurementsAdd',
    params: { date: ENTRY_DATE },
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider initialMetrics={{ insets, frame }}>
        <MeasurementsAddScreen navigation={mockNavigation} route={route} />
      </SafeAreaProvider>
    </QueryClientProvider>
  );
};

const baseResponses = () => ({
  '/api/user-preferences': {
    default_weight_unit: 'kg',
    default_measurement_unit: 'cm',
    body_fat_algorithm: 'U.S. Navy',
  },
  '/api/identity/profiles': {
    id: 'user-1',
    full_name: null,
    phone_number: null,
    date_of_birth: '1990-01-01',
    bio: null,
    avatar_url: null,
    gender: 'male',
  },
  // The selected day itself has nothing recorded.
  [`/api/measurements/check-in-measurements-range/${ENTRY_DATE}/${ENTRY_DATE}`]:
    [],
  [`/api/measurements/custom-entries/${ENTRY_DATE}`]: [],
});

describe('MeasurementsAddScreen — hint wiring against the real API layer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('a standard previous value reaches the input placeholder', async () => {
    respond({
      ...baseResponses(),
      // The carry-forward lookup the standard hints read from.
      '/api/measurements/check-in/latest-on-or-before-date': {
        weight: 80,
        waist: 90,
      },
    });

    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('field-weight').props.placeholder).toBe('80');
    });
    expect(screen.getByTestId('field-waist').props.placeholder).toBe('90');
    expect(screen.getByTestId('use-last-weight')).toBeTruthy();

    // The request went to the carry-forward endpoint, not the day endpoint.
    const endpoints = mockApiFetch.mock.calls.map(
      (call) => (call[0] as FetchCall).endpoint
    );
    expect(endpoints).toContain(
      `/api/measurements/check-in/latest-on-or-before-date?date=${ENTRY_DATE}`
    );
  });

  test('a custom previous value reaches the custom input placeholder', async () => {
    respond({
      ...baseResponses(),
      '/api/measurements/custom-categories': [
        {
          id: 'cat-1',
          name: 'Stress Level',
          display_name: null,
          measurement_type: '',
          frequency: 'Daily',
          data_type: 'numeric',
        },
      ],
      '/api/measurements/custom-entries/latest-manual-on-or-before-date': [
        {
          id: 'e1',
          category_id: 'cat-1',
          value: '5',
          entry_date: '2024-06-01',
          source: 'manual',
        },
      ],
    });

    const screen = renderScreen();

    // This is the assertion that would have caught a wrong URL or a wrong
    // response field name: the value has to travel from the mocked HTTP
    // response all the way to the rendered placeholder.
    await waitFor(() => {
      expect(screen.getByTestId('custom-input-cat-1').props.placeholder).toBe(
        '5'
      );
    });
    expect(screen.getByTestId('use-last-custom-cat-1')).toBeTruthy();

    const endpoints = mockApiFetch.mock.calls.map(
      (call) => (call[0] as FetchCall).endpoint
    );
    expect(endpoints).toContain(
      `/api/measurements/custom-entries/latest-manual-on-or-before-date?date=${ENTRY_DATE}`
    );
  });

  test('the daily editor never asks for a custom value per category', async () => {
    respond({
      ...baseResponses(),
      '/api/measurements/custom-categories': [
        {
          id: 'cat-1',
          name: 'A',
          display_name: null,
          measurement_type: '',
          frequency: 'Daily',
          data_type: 'numeric',
        },
        {
          id: 'cat-2',
          name: 'B',
          display_name: null,
          measurement_type: '',
          frequency: 'Daily',
          data_type: 'numeric',
        },
        {
          id: 'cat-3',
          name: 'C',
          display_name: null,
          measurement_type: '',
          frequency: 'Daily',
          data_type: 'numeric',
        },
      ],
      '/api/measurements/custom-entries/latest-manual-on-or-before-date': [],
    });

    renderScreen();

    await waitFor(() => {
      const hintCalls = mockApiFetch.mock.calls.filter((call) =>
        (call[0] as FetchCall).endpoint.includes(
          'latest-manual-on-or-before-date'
        )
      );
      // One bulk request for all three categories, never one each.
      expect(hintCalls).toHaveLength(1);
    });
  });

  test('hints alone never issue a write', async () => {
    respond({
      ...baseResponses(),
      '/api/measurements/check-in/latest-on-or-before-date': { weight: 80 },
      '/api/measurements/custom-entries/latest-manual-on-or-before-date': [],
    });

    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('field-weight').props.placeholder).toBe('80');
    });

    // Rendering the suggestions must not POST the check-in or a custom entry.
    const writes = mockApiFetch.mock.calls.filter((call) => {
      const { endpoint, method } = call[0] as FetchCall;
      const isWrite =
        method === 'POST' || method === 'PUT' || method === 'DELETE';
      const touchesMeasurements =
        endpoint === '/api/measurements/check-in' ||
        endpoint === '/api/measurements/custom-entries';
      return isWrite && touchesMeasurements;
    });
    expect(writes).toEqual([]);
  });

  test('a server without the custom lookup endpoint reports it on screen', async () => {
    // Reproduces the real-world case: an older server 404s the new endpoint.
    // Every custom field would otherwise sit on its generic '0' placeholder
    // with nothing to say why, which is indistinguishable from "no history".
    mockApiFetch.mockImplementation((options: unknown) => {
      const { endpoint } = options as FetchCall;
      const responses = {
        ...baseResponses(),
        '/api/measurements/custom-categories': [
          {
            id: 'cat-1',
            name: 'Stress Level',
            display_name: null,
            measurement_type: '',
            frequency: 'Daily',
            data_type: 'numeric',
          },
        ],
      } as Record<string, unknown>;

      const key = Object.keys(responses).find((candidate) =>
        endpoint.startsWith(candidate)
      );
      if (key) return Promise.resolve(responses[key]);
      // Everything else, including the unknown hint endpoint, is a 404.
      return Promise.reject(new Error('Server error: 404 - Not Found'));
    });

    const screen = renderScreen();

    await waitFor(() => {
      expect(screen.getByTestId('custom-hints-unavailable')).toBeTruthy();
    });
    // The custom input still renders and stays usable.
    expect(screen.getByTestId('custom-input-cat-1')).toBeTruthy();
  });

  test('an older server still yields custom hints through the list fallback', async () => {
    // Exact reproduction of the reported symptom's cause. An older server has
    // no bulk endpoint, and /custom-entries/:date also matches the literal
    // path, reading "latest-manual-on-or-before-date" as the date and failing
    // in Postgres (500). The client must fall back to the list endpoint and
    // narrow it, or every custom field shows its empty placeholder.
    mockApiFetch.mockImplementation((options: unknown) => {
      const { endpoint } = options as FetchCall;

      if (endpoint.includes('latest-manual-on-or-before-date')) {
        // What the shadowing /custom-entries/:date route produces.
        return Promise.reject(
          new Error('Server error: 500 - invalid input syntax for type date')
        );
      }
      if (endpoint.startsWith('/api/measurements/custom-entries?')) {
        return Promise.resolve([
          {
            id: 'e1',
            category_id: 'cat-1',
            value: '5',
            entry_date: '2024-06-01',
            entry_hour: null,
            entry_timestamp: '2024-06-01T00:00:00.000Z',
            source: 'manual',
          },
          {
            id: 'e2',
            category_id: 'cat-1',
            value: '8',
            entry_date: '2024-06-10',
            entry_hour: null,
            entry_timestamp: '2024-06-10T00:00:00.000Z',
            source: 'manual',
          },
        ]);
      }

      const responses = {
        ...baseResponses(),
        '/api/measurements/custom-categories': [
          {
            id: 'cat-1',
            name: 'Stress Level',
            display_name: null,
            measurement_type: '',
            frequency: 'Daily',
            data_type: 'numeric',
          },
        ],
      } as Record<string, unknown>;
      const key = Object.keys(responses).find((candidate) =>
        endpoint.startsWith(candidate)
      );
      return Promise.resolve(key ? responses[key] : []);
    });

    const screen = renderScreen();

    // The newest manual value on or before the selected day wins.
    await waitFor(() => {
      expect(screen.getByTestId('custom-input-cat-1').props.placeholder).toBe(
        '8'
      );
    });
    expect(screen.getByTestId('use-last-custom-cat-1')).toBeTruthy();
    // The fallback worked, so no "server may need updating" note is shown.
    expect(screen.queryByTestId('custom-hints-unavailable')).toBeNull();
  });
});

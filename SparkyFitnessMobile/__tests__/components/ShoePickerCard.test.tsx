import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ShoeResponse } from '@workspace/shared';

import ShoePickerCard from '../../src/components/ShoePickerCard';
import { fetchExerciseEntry } from '../../src/services/api/exerciseStatsApi';
import Toast from 'react-native-toast-message';
import { addLog } from '../../src/services/LogService';
import {
  assignShoeToExerciseEntry,
  fetchShoes,
} from '../../src/services/api/shoesApi';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/services/api/exerciseStatsApi');
jest.mock('../../src/services/api/shoesApi');
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
jest.mock('../../src/components/BottomSheetPicker', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({
      value,
      options,
      onSelect,
    }: {
      onSelect: (value: string) => void;
      value: string;
      options: { label: string; value: string }[];
    }) => (
      <Text testID="picker" onPress={() => onSelect('shoe-1')}>
        {options.find((option) => option.value === value)?.label}
      </Text>
    ),
  };
});

const mockedFetchEntry = jest.mocked(fetchExerciseEntry);
const mockedFetchShoes = jest.mocked(fetchShoes);

const shoe = (overrides: Partial<ShoeResponse>): ShoeResponse =>
  ({
    id: 'shoe-1',
    name: 'Pegasus 41',
    nickname: null,
    status: 'active',
    ...overrides,
  }) as ShoeResponse;

const renderCard = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ShoePickerCard exerciseEntryId="entry-1" />
    </QueryClientProvider>
  );
};

beforeAll(async () => {
  await initializeI18n();
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ShoePickerCard', () => {
  it('shows an error toast and keeps the error log when assignment fails', async () => {
    mockedFetchEntry.mockResolvedValue({ shoe_id: null } as never);
    mockedFetchShoes.mockResolvedValue([shoe({})]);
    jest
      .mocked(assignShoeToExerciseEntry)
      .mockRejectedValueOnce(new Error('Offline'));
    renderCard();
    await waitFor(() => expect(screen.getByTestId('picker')).toBeTruthy());
    fireEvent.press(screen.getByTestId('picker'));
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith({
        type: 'error',
        text1: 'Failed to assign shoe',
        text2: 'Please try again.',
      })
    );
    expect(addLog).toHaveBeenCalledWith(
      'Failed to assign shoe: Error: Offline',
      'ERROR'
    );
  });

  it('shows the linked shoe by its nickname', async () => {
    mockedFetchEntry.mockResolvedValue({ shoe_id: 'shoe-1' } as never);
    mockedFetchShoes.mockResolvedValue([shoe({ nickname: 'Daily trainer' })]);
    renderCard();
    await waitFor(() =>
      expect(screen.getByTestId('picker').props.children).toBe('Daily trainer')
    );
  });

  it('shows "No shoe" when the entry has no link', async () => {
    mockedFetchEntry.mockResolvedValue({ shoe_id: null } as never);
    mockedFetchShoes.mockResolvedValue([shoe({})]);
    renderCard();
    await waitFor(() =>
      expect(screen.getByTestId('picker').props.children).toBe('No shoe')
    );
  });

  it('stays hidden when there are no shoes and none is linked', async () => {
    mockedFetchEntry.mockResolvedValue({ shoe_id: null } as never);
    mockedFetchShoes.mockResolvedValue([]);
    renderCard();
    await waitFor(() => expect(mockedFetchShoes).toHaveBeenCalled());
    await waitFor(() => expect(mockedFetchEntry).toHaveBeenCalled());
    expect(screen.queryByTestId('picker')).toBeNull();
  });

  it('keeps a retired pair visible while it is the linked one', async () => {
    mockedFetchEntry.mockResolvedValue({ shoe_id: 'shoe-1' } as never);
    mockedFetchShoes.mockResolvedValue([shoe({ status: 'retired' })]);
    renderCard();
    await waitFor(() =>
      expect(screen.getByTestId('picker').props.children).toBe(
        'Pegasus 41 (Retired)'
      )
    );
  });
});

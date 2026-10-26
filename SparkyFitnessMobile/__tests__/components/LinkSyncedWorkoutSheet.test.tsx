import React, { createRef } from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { CalorieLinkSuggestionsResponse } from '@workspace/shared';
import LinkSyncedWorkoutSheet, {
  type LinkSyncedWorkoutSheetRef,
} from '../../src/components/LinkSyncedWorkoutSheet';
import i18n, { initializeI18n } from '../../src/localization/i18n';

const mockSetLink = jest.fn();
const mockClearLink = jest.fn();
let mockSuggestions: CalorieLinkSuggestionsResponse | undefined;

jest.mock('../../src/hooks/useCalorieLink', () => ({
  useCalorieLinkSuggestions: () => ({
    data: mockSuggestions,
    isLoading: false,
    isError: false,
  }),
  useSetCalorieLink: () => ({
    mutateAsync: mockSetLink,
    isPending: false,
  }),
  useClearCalorieLink: () => ({
    mutateAsync: mockClearLink,
    isPending: false,
  }),
}));

const candidate = (overrides = {}) => ({
  id: 'synced-1',
  name: 'Other workout',
  source: 'Garmin',
  start_time: '09:55',
  duration_minutes: 60,
  calories_burned: 425,
  match: 'sets_within' as const,
  ...overrides,
});

const renderSheet = (onLinkChange = jest.fn()) => {
  const ref = createRef<LinkSyncedWorkoutSheetRef>();
  const view = render(
    <LinkSyncedWorkoutSheet
      ref={ref}
      entryId="entry-1"
      entryDate="2026-10-23"
      onLinkChange={onLinkChange}
    />
  );
  act(() => ref.current?.present());
  return { view, onLinkChange };
};

describe('LinkSyncedWorkoutSheet', () => {
  beforeEach(async () => {
    await initializeI18n('en');
    await i18n.changeLanguage('en');
    jest.clearAllMocks();
    mockSetLink.mockResolvedValue({
      applied: [{ entry_id: 'entry-1', calories_applied: null }],
    });
    mockClearLink.mockResolvedValue(undefined);
    mockSuggestions = {
      manual_total_calories: 475,
      link: null,
      candidates: [candidate()],
    };
  });

  it('preselects the workout that matches the set times and links it', async () => {
    const { view, onLinkChange } = renderSheet();

    expect(view.getByText('Same session')).toBeTruthy();
    expect(view.getByLabelText('Other workout, 09:55, Garmin')).toBeTruthy();
    fireEvent.press(view.getByText('Link workouts'));

    await waitFor(() => expect(mockSetLink).toHaveBeenCalledTimes(1));
    expect(mockSetLink).toHaveBeenCalledWith({
      synced_entry_id: 'synced-1',
      resolution: 'sparkyfitness',
    });
    await waitFor(() =>
      expect(onLinkChange).toHaveBeenCalledWith('sparkyfitness', {
        'entry-1': null,
      })
    );
  });

  it('shows what each choice would count and sends the chosen one', async () => {
    const { view } = renderSheet();

    expect(view.getByText('The average (450)')).toBeTruthy();
    fireEvent.press(view.getByTestId('link-resolution-lower'));
    fireEvent.press(view.getByText('Link workouts'));

    await waitFor(() => expect(mockSetLink).toHaveBeenCalled());
    expect(mockSetLink.mock.calls[0][0].resolution).toBe('lower');
  });

  it('does not pre-pick a workout with no evidence it is the same session', () => {
    mockSuggestions = {
      manual_total_calories: 475,
      link: null,
      candidates: [candidate({ match: null })],
    };
    const { view } = renderSheet();

    fireEvent.press(view.getByText('Link workouts'));
    expect(mockSetLink).not.toHaveBeenCalled();
  });

  it('offers to unlink an existing link', async () => {
    mockSuggestions = {
      manual_total_calories: 475,
      link: { resolution: 'average', synced_entry_id: 'synced-1' },
      candidates: [candidate()],
    };
    const { view, onLinkChange } = renderSheet();

    fireEvent.press(view.getByText('Unlink'));
    await waitFor(() => expect(mockClearLink).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onLinkChange).toHaveBeenCalledWith(null, {}));
  });

  it('says so when the day has no synced workouts', () => {
    mockSuggestions = {
      manual_total_calories: 475,
      link: null,
      candidates: [],
    };
    const { view } = renderSheet();

    expect(
      view.getByText('No synced workouts found for this day.')
    ).toBeTruthy();
  });

  it('can unlink when the synced workout is no longer a candidate', async () => {
    mockSuggestions = {
      manual_total_calories: 475,
      link: { resolution: 'sparkyfitness', synced_entry_id: null },
      candidates: [],
    };
    const { view, onLinkChange } = renderSheet();

    fireEvent.press(view.getByText('Unlink'));
    await waitFor(() => expect(mockClearLink).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onLinkChange).toHaveBeenCalledWith(null, {}));
  });
});

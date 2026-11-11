import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LinkSyncedWorkoutDialog from '@/pages/Diary/LinkSyncedWorkoutDialog';
import type { CalorieLinkSuggestionsResponse } from '@workspace/shared';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

const mockSetLink = jest.fn();
const mockClearLink = jest.fn();
let mockSuggestions: CalorieLinkSuggestionsResponse | undefined;

jest.mock('@/hooks/Exercises/useExerciseEntries', () => ({
  useCalorieLinkSuggestions: () => ({
    data: mockSuggestions,
    isLoading: false,
    isError: false,
  }),
  useSetCalorieLinkMutation: () => ({
    mutateAsync: mockSetLink,
    isPending: false,
  }),
  useClearCalorieLinkMutation: () => ({
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

const renderDialog = () =>
  render(
    <LinkSyncedWorkoutDialog
      entryId="entry-1"
      open
      onOpenChange={jest.fn()}
      energyUnit="kcal"
      convertEnergy={(value) => value}
      getEnergyUnitString={() => 'kcal'}
    />
  );

beforeEach(() => {
  jest.clearAllMocks();
  mockSetLink.mockResolvedValue(undefined);
  mockClearLink.mockResolvedValue(undefined);
  mockSuggestions = {
    manual_total_calories: 475,
    link: null,
    candidates: [candidate()],
  };
});

describe('LinkSyncedWorkoutDialog', () => {
  it('defaults to measured calories when the imported workout has zero calories', async () => {
    mockSuggestions = {
      manual_total_calories: 0,
      link: null,
      candidates: [candidate({ source: 'Health Connect' })],
    };
    renderDialog();

    fireEvent.click(screen.getByText('Link workouts'));

    await waitFor(() => expect(mockSetLink).toHaveBeenCalledTimes(1));
    expect(mockSetLink.mock.calls[0][0].body.resolution).toBe('synced');
  });

  it('preselects the workout that matches the set times and links it', async () => {
    renderDialog();

    expect(screen.getByText('Same session')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Link workouts'));

    await waitFor(() => expect(mockSetLink).toHaveBeenCalledTimes(1));
    expect(mockSetLink).toHaveBeenCalledWith({
      entryId: 'entry-1',
      body: { synced_entry_id: 'synced-1', resolution: 'sparkyfitness' },
    });
  });

  it('sends the chosen resolution', async () => {
    renderDialog();

    fireEvent.click(screen.getByLabelText(/The synced workout/));
    fireEvent.click(screen.getByText('Link workouts'));

    await waitFor(() => expect(mockSetLink).toHaveBeenCalled());
    expect(mockSetLink.mock.calls[0][0].body.resolution).toBe('synced');
  });

  it('needs a total for a custom resolution, then sends it', async () => {
    renderDialog();

    fireEvent.click(screen.getByLabelText('A custom total'));
    expect(screen.getByText('Link workouts')).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Total for the session/), {
      target: { value: '430' },
    });
    fireEvent.click(screen.getByText('Link workouts'));

    await waitFor(() => expect(mockSetLink).toHaveBeenCalled());
    expect(mockSetLink.mock.calls[0][0].body).toEqual({
      synced_entry_id: 'synced-1',
      resolution: 'custom',
      custom_calories: 430,
    });
  });

  it('does not pre-pick a workout with no evidence it is the same session', () => {
    mockSuggestions = {
      manual_total_calories: 475,
      link: null,
      candidates: [candidate({ match: null })],
    };
    renderDialog();

    expect(screen.getByText('Link workouts')).toBeDisabled();
  });

  it('offers to unlink an existing link', async () => {
    mockSuggestions = {
      manual_total_calories: 475,
      link: { resolution: 'average', synced_entry_id: 'synced-1' },
      candidates: [candidate()],
    };
    renderDialog();

    fireEvent.click(screen.getByText('Unlink'));
    await waitFor(() => expect(mockClearLink).toHaveBeenCalledWith('entry-1'));
  });

  it.each([350, 0])(
    'restores and resaves an existing custom total of %s kcal',
    async (total) => {
      mockSuggestions = {
        manual_total_calories: 0,
        link: {
          resolution: 'custom',
          synced_entry_id: 'synced-1',
          custom_calories: total,
        },
        candidates: [candidate()],
      };
      renderDialog();
      expect(screen.getByLabelText(/Total for the session/)).toHaveValue(total);
      fireEvent.click(screen.getByText('Link workouts'));
      await waitFor(() =>
        expect(mockSetLink).toHaveBeenCalledWith({
          entryId: 'entry-1',
          body: {
            synced_entry_id: 'synced-1',
            resolution: 'custom',
            custom_calories: total,
          },
        })
      );
    }
  );

  it('keeps the saved kcal total when the display unit changes to kJ', async () => {
    mockSuggestions = {
      manual_total_calories: 0,
      link: {
        resolution: 'custom',
        synced_entry_id: 'synced-1',
        custom_calories: 350,
      },
      candidates: [candidate()],
    };
    const view = renderDialog();
    view.rerender(
      <LinkSyncedWorkoutDialog
        entryId="entry-1"
        open
        onOpenChange={jest.fn()}
        energyUnit="kJ"
        getEnergyUnitString={(unit) => unit}
        convertEnergy={(value, from, to) =>
          from === to ? value : from === 'kcal' ? value * 4.184 : value / 4.184
        }
      />
    );
    expect(screen.getByLabelText(/Total for the session/)).toHaveValue(1464.4);
    fireEvent.click(screen.getByText('Link workouts'));
    await waitFor(() =>
      expect(mockSetLink.mock.calls[0][0].body.custom_calories).toBe(350)
    );
  });

  it('says so when the day has no synced workouts', () => {
    mockSuggestions = {
      manual_total_calories: 475,
      link: null,
      candidates: [],
    };
    renderDialog();

    expect(
      screen.getByText('No synced workouts found for this day.')
    ).toBeInTheDocument();
  });
});

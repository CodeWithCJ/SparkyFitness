import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import WorkoutPresetsManager from '@/pages/Exercises/WorkoutPresetsManager';
import type { WorkoutPreset } from '@/types/workout';

const mockCreatePreset = jest.fn();
const mockUseWorkoutPresets = jest.fn();

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultOrValues?: string | Record<string, unknown>) => {
      if (typeof defaultOrValues === 'string') return defaultOrValues;
      if (defaultOrValues && typeof defaultOrValues === 'object') {
        // Real interpolation only for the key exercised in these tests
        // (matches en/translation.json's "{{name}} (Copy)"), so the
        // duplicate-name truncation tests assert on the actual rendered
        // string rather than a synthetic JSON blob. Other keyed
        // interpolations fall back to the JSON-stringified form.
        if (key === 'workoutPresetsManager.duplicateNameSuffix') {
          const { name } = defaultOrValues as { name: string };
          return `${name} (Copy)`;
        }
        // i18next interpolates the defaultValue when the locale file has no
        // entry, which is what the DataTable footer relies on.
        const { defaultValue, ...values } = defaultOrValues as {
          defaultValue?: unknown;
        } & Record<string, unknown>;
        if (typeof defaultValue === 'string') {
          return defaultValue.replace(/\{\{(\w+)\}\}/g, (_match, name) =>
            String(values[name] ?? '')
          );
        }
        return `${key}:${JSON.stringify(defaultOrValues)}`;
      }
      return key;
    },
  }),
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/exercises', search: '' }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ weightUnit: 'kg' }),
}));

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

jest.mock('@/hooks/Exercises/useExerciseEntries', () => ({
  useLogWorkoutPresetMutation: () => ({ mutateAsync: jest.fn() }),
}));

const presetFixture: WorkoutPreset = {
  id: 'preset-1',
  user_id: 'user-1',
  name: 'Upper Body',
  description: 'Push + Pull',
  exercises: [
    {
      exercise_id: 'exercise-1',
      exercise_name: 'Bench Press',
      sets: [{ set_number: 1, reps: 8, weight: 80, rest_time: 90 }],
    },
  ],
} as unknown as WorkoutPreset;

jest.mock('@/hooks/Exercises/useWorkoutPresets', () => ({
  useWorkoutPresets: (...args: unknown[]) => mockUseWorkoutPresets(...args),
  useCreateWorkoutPresetMutation: () => ({
    mutateAsync: (...args: unknown[]) => mockCreatePreset(...args),
  }),
  useUpdateWorkoutPresetMutation: () => ({ mutateAsync: jest.fn() }),
  useDeleteWorkoutPresetMutation: () => ({ mutateAsync: jest.fn() }),
}));

const buildPresets = (count: number, offset = 0): WorkoutPreset[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `preset-${offset + index + 1}`,
    user_id: 'user-1',
    name: `Preset ${offset + index + 1}`,
    description: null,
    exercises: [],
  })) as unknown as WorkoutPreset[];

/**
 * Mocks useWorkoutPresets the way the API behaves: the hook is called with the
 * requested page and the response carries the server total, so the table must
 * derive its page count from `total` rather than from the rows it received.
 */
const mockPaginatedPresets = (total: number) => {
  mockUseWorkoutPresets.mockImplementation(
    (_userId?: string, page = 1, limit = 10) => {
      const start = (page - 1) * limit;
      return {
        data: {
          presets: buildPresets(
            Math.max(0, Math.min(limit, total - start)),
            start
          ),
          total,
          page,
          limit,
        },
        isLoading: false,
        isFetching: false,
      };
    }
  );
};

describe('WorkoutPresetsManager duplicate preset', () => {
  beforeEach(() => {
    mockCreatePreset.mockReset();
    mockUseWorkoutPresets.mockReset();
    mockUseWorkoutPresets.mockImplementation(
      (_userId?: string, page = 1, limit = 10) => ({
        data: {
          presets: page === 1 ? [presetFixture] : [],
          total: 1,
          page,
          limit,
        },
        isLoading: false,
        isFetching: false,
      })
    );
  });

  it('creates a private copy with the original exercises/sets and a "(Copy)" name, regardless of the source visibility', async () => {
    render(<WorkoutPresetsManager />);

    // DataTable renders both a desktop table and a mobile card list at once
    // (toggled with CSS media queries jsdom doesn't apply), so each row's
    // menu trigger appears twice; only one needs to be exercised here.
    // Radix's dropdown trigger opens on pointerDown, not click.
    const trigger = screen.getAllByRole('button', { name: /open menu/i })[0]!;
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerId: 1 });
    fireEvent.click(trigger);
    fireEvent.click((await screen.findAllByText('Duplicate'))[0]!);

    await waitFor(() => expect(mockCreatePreset).toHaveBeenCalledTimes(1));
    expect(mockCreatePreset).toHaveBeenCalledWith({
      user_id: 'user-1',
      name: 'Upper Body (Copy)',
      description: 'Push + Pull',
      is_public: false,
      exercises: presetFixture.exercises.map((exercise, index) => ({
        ...exercise,
        sort_order: index,
      })),
    });
  });

  it('truncates a max-length preset name so the duplicate stays within 255 characters', async () => {
    const originalName = presetFixture.name;
    presetFixture.name = 'A'.repeat(255);

    try {
      render(<WorkoutPresetsManager />);

      const trigger = screen.getAllByRole('button', { name: /open menu/i })[0]!;
      fireEvent.pointerDown(trigger, {
        button: 0,
        ctrlKey: false,
        pointerId: 1,
      });
      fireEvent.click(trigger);
      fireEvent.click((await screen.findAllByText('Duplicate'))[0]!);

      await waitFor(() => expect(mockCreatePreset).toHaveBeenCalledTimes(1));
      const duplicateName = (
        mockCreatePreset.mock.calls[0]![0] as { name: string }
      ).name;
      // 248-char truncated name + " (Copy)" (7 chars) = 255, the
      // workout_presets.name VARCHAR(255) limit.
      expect(duplicateName).toBe(`${'A'.repeat(248)} (Copy)`);
      expect(duplicateName.length).toBe(255);
    } finally {
      presetFixture.name = originalName;
    }
  });
});

describe('WorkoutPresetsManager pagination', () => {
  beforeEach(() => {
    mockCreatePreset.mockReset();
    mockUseWorkoutPresets.mockReset();
  });

  it('reports the server page count on the first render instead of one page per loaded batch', () => {
    mockPaginatedPresets(21);

    render(<WorkoutPresetsManager />);

    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    expect(screen.queryByText('Load more')).not.toBeInTheDocument();
    expect(screen.getAllByText('Preset 10').length).toBeGreaterThan(0);
    expect(screen.queryByText('Preset 11')).not.toBeInTheDocument();
  });

  it('fetches the requested page from the server instead of appending rows to the loaded ones', () => {
    mockPaginatedPresets(21);

    render(<WorkoutPresetsManager />);
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));

    expect(screen.getByText('Page 2 of 3')).toBeInTheDocument();
    expect(mockUseWorkoutPresets).toHaveBeenCalledWith('user-1', 2, 10);
    expect(screen.getAllByText('Preset 11').length).toBeGreaterThan(0);
    expect(screen.queryByText('Preset 1')).not.toBeInTheDocument();
  });

  it('falls back to the last available page once the current page no longer exists', () => {
    mockPaginatedPresets(21);

    render(<WorkoutPresetsManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Go to next page' }));
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();

    // The presets on the last page were deleted, so the server now reports 11
    // presets and page 3 is gone. Any re-render should notice and step back.
    mockPaginatedPresets(11);
    fireEvent.click(screen.getByRole('button', { name: 'Select' }));

    expect(mockUseWorkoutPresets).toHaveBeenCalledWith('user-1', 2, 10);
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });
});

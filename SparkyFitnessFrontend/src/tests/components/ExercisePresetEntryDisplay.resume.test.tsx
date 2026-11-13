import '@testing-library/jest-dom';
import { useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { act, fireEvent, render } from '@testing-library/react';
import ExercisePresetEntryDisplay from '@/pages/Diary/ExercisePresetEntryDisplay';
import type { PresetSessionEntry } from '@/types/exercises';
import type { WorkoutPlaybackDraft } from '@/utils/workoutPlayback';
import {
  createWorkoutPlaybackDraftFromSession,
  saveWorkoutPlaybackDraftToStorage,
} from '@/utils/workoutPlayback';
import { toast } from '@/hooks/use-toast';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));

let mockActiveUserId = 'user-1';
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({
    activeUserId: mockActiveUserId,
    hasWritePermission: () => true,
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timeFormat: 'HH:mm' }),
}));

const mockUpdatePresetSession = jest.fn();
jest.mock('@/hooks/Exercises/useExerciseEntries', () => ({
  useUpdatePresetSessionMutation: () => ({
    mutateAsync: mockUpdatePresetSession,
  }),
  isPresetSessionConflictError: () => false,
}));

jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

jest.mock('@/utils/workoutPlayback', () => ({
  ...jest.requireActual('@/utils/workoutPlayback'),
  createWorkoutPlaybackDraftFromSession: jest.fn(),
  saveWorkoutPlaybackDraftToStorage: jest.fn(),
}));

jest.mock('@/pages/Diary/WorkoutFeedbackPanel', () => () => null);
jest.mock('@/pages/Diary/ExerciseEntryDisplay', () => () => null);

const DRAFT = { entry_date: '2026-04-27' } as WorkoutPlaybackDraft;

const presetEntry = {
  type: 'preset',
  id: 'session-1',
  entry_date: '2026-04-27',
  workout_preset_id: null,
  name: 'Upper Body',
  description: null,
  notes: null,
  source: 'manual',
  status: 'partial',
  revision: 3,
  total_duration_minutes: 0,
  exercises: [],
  activity_details: [],
} as unknown as PresetSessionEntry;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const renderEntry = () => {
  // A new element each time, so a rerender runs the component again, as the
  // context change of an account switch does.
  const element = () => (
    <ExercisePresetEntryDisplay
      presetEntry={presetEntry}
      currentUserId="user-1"
      handleDelete={jest.fn()}
      handleDeleteExerciseEntry={jest.fn()}
      handleEdit={jest.fn()}
      handleEditExerciseDatabase={jest.fn()}
      setExerciseToPlay={jest.fn()}
      setIsPlaybackModalOpen={jest.fn()}
      energyUnit="kcal"
      convertEnergy={(value) => value}
      getEnergyUnitString={() => 'kcal'}
    />
  );
  const view = render(element());
  return { ...view, rerenderEntry: () => view.rerender(element()) };
};

const resumeButton = (container: HTMLElement) => {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.querySelector('svg.lucide-play')
  );
  if (!button) throw new Error('No resume button');
  return button;
};

describe('ExercisePresetEntryDisplay resume', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActiveUserId = 'user-1';
    jest.mocked(createWorkoutPlaybackDraftFromSession).mockReturnValue(DRAFT);
  });

  it('opens the player with the reopened session for the person who resumed it', async () => {
    mockUpdatePresetSession.mockResolvedValue({ id: 'session-1' });
    const { container } = renderEntry();

    await act(async () => {
      fireEvent.click(resumeButton(container));
    });

    expect(saveWorkoutPlaybackDraftToStorage).toHaveBeenCalledWith(
      'user-1',
      DRAFT
    );
    expect(mockNavigate).toHaveBeenCalledWith(
      '/workout-playback?date=2026-04-27',
      expect.objectContaining({
        state: expect.objectContaining({ draft: DRAFT, ownerId: 'user-1' }),
      })
    );
  });

  it('leaves the page alone when someone else takes over while the session reopens', async () => {
    const reopen = deferred<unknown>();
    mockUpdatePresetSession.mockReturnValue(reopen.promise);
    const { container, rerenderEntry } = renderEntry();
    act(() => {
      fireEvent.click(resumeButton(container));
    });

    // Another account (or profile) takes over before the server answers.
    mockActiveUserId = 'user-2';
    rerenderEntry();
    await act(async () => {
      reopen.resolve({ id: 'session-1' });
    });

    expect(saveWorkoutPlaybackDraftToStorage).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('says nothing to the next person when the reopen fails after they took over', async () => {
    const reopen = deferred<unknown>();
    mockUpdatePresetSession.mockReturnValue(reopen.promise);
    const { container, rerenderEntry } = renderEntry();
    act(() => {
      fireEvent.click(resumeButton(container));
    });

    mockActiveUserId = 'user-2';
    rerenderEntry();
    await act(async () => {
      reopen.reject(new Error('offline'));
    });

    expect(toast).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('does not open the player once the person has left the Diary', async () => {
    const reopen = deferred<unknown>();
    mockUpdatePresetSession.mockReturnValue(reopen.promise);
    const { container, unmount } = renderEntry();
    act(() => {
      fireEvent.click(resumeButton(container));
    });

    unmount();
    await act(async () => {
      reopen.resolve({ id: 'session-1' });
    });

    expect(saveWorkoutPlaybackDraftToStorage).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('stops a resume that answers in the same commit as the switch, before effects run', async () => {
    // Outside act(), so React runs passive effects (useEffect) after the
    // commit, as in the browser, and a reply can land in between.
    const reactGlobal = globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    };
    const actEnvironment = reactGlobal.IS_REACT_ACT_ENVIRONMENT;
    reactGlobal.IS_REACT_ACT_ENVIRONMENT = false;
    const wait = (ms: number) =>
      new Promise((resolve) => setTimeout(resolve, ms));
    const reopen = deferred<unknown>();
    mockUpdatePresetSession.mockReturnValue(reopen.promise);

    // Answers the reopen in the commit that hands the page to someone else.
    function AnswerOnCommit({ changed }: { changed: boolean }) {
      useLayoutEffect(() => {
        if (changed) reopen.resolve({ id: 'session-1' });
      }, [changed]);
      return null;
    }
    const tree = (changed: boolean) => (
      <>
        <ExercisePresetEntryDisplay
          presetEntry={presetEntry}
          currentUserId="user-1"
          handleDelete={jest.fn()}
          handleDeleteExerciseEntry={jest.fn()}
          handleEdit={jest.fn()}
          handleEditExerciseDatabase={jest.fn()}
          setExerciseToPlay={jest.fn()}
          setIsPlaybackModalOpen={jest.fn()}
          energyUnit="kcal"
          convertEnergy={(value) => value}
          getEnergyUnitString={() => 'kcal'}
        />
        <AnswerOnCommit changed={changed} />
      </>
    );

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      root.render(tree(false));
      await wait(50);
      fireEvent.click(resumeButton(container));
      await wait(0);

      mockActiveUserId = 'user-2';
      root.render(tree(true));
      await wait(100);

      expect(saveWorkoutPlaybackDraftToStorage).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    } finally {
      root.unmount();
      container.remove();
      reactGlobal.IS_REACT_ACT_ENVIRONMENT = actEnvironment;
    }
  });
});

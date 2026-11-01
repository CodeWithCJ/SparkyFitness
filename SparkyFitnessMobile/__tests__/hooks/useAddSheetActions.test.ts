import { Alert } from 'react-native';
import { renderHook } from '@testing-library/react-native';
import { CommonActions } from '@react-navigation/native';
import { navigationRef } from '../../src/components/ActiveWorkoutBar';
import { useAddSheetActions } from '../../src/hooks/useAddSheetActions';
import { initializeI18n } from '../../src/localization/i18n';
import { useDiaryDateStore } from '../../src/stores/diaryDateStore';
import { useGuidedCheckInStore } from '../../src/stores/guidedCheckInStore';

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  navigationRef: {
    isReady: jest.fn(() => true),
    getRootState: jest.fn(),
    dispatch: jest.fn(),
  },
}));
jest.mock('../../src/components/TabsLayout', () => ({
  NON_ADD_TABS: ['Dashboard', 'Diary', 'Library', 'Settings'],
}));
jest.mock('../../src/hooks/useSyncHealthData', () => ({
  useSyncHealthData: jest.fn(),
}));
jest.mock('../../src/hooks/useStartLiveWorkout', () => ({
  promptForActiveWorkoutConflict: jest.fn(() => false),
}));
jest.mock('../../src/services/healthConnectService', () => ({
  initHealthConnect: jest.fn(),
  loadHealthPreference: jest.fn(),
}));
jest.mock('../../src/services/autoSyncCoordinator', () => ({
  isSyncClaimed: jest.fn(() => false),
}));
jest.mock('../../src/services/workoutDraftService', () => ({
  loadActiveDraft: jest.fn(),
  clearDraft: jest.fn(),
}));
jest.mock('../../src/services/storage', () => ({
  loadTimeRange: jest.fn(),
}));
jest.mock('../../src/HealthMetrics', () => ({ HEALTH_METRICS: [] }));

type SyncMutation = Parameters<typeof useAddSheetActions>[0]['syncMutation'];

/** Only the fields the hook reads; handleStartCheckIn touches neither. */
const syncMutationStub = {
  isPending: false,
  mutate: jest.fn(),
} as unknown as SyncMutation;

type RouteSnapshot = {
  name: string;
  params?: object;
  state?: StateSnapshot;
};
type StateSnapshot = { index?: number; routes: RouteSnapshot[] };

/** Root stack > Tabs > Diary stack > DiaryRoot, with the Diary tab focused. */
function rootStateWithDiaryParams(params?: object): StateSnapshot {
  return {
    index: 0,
    routes: [
      {
        name: 'Tabs',
        state: {
          index: 1,
          routes: [
            { name: 'Dashboard' },
            {
              name: 'Diary',
              state: { index: 0, routes: [{ name: 'DiaryRoot', params }] },
            },
            { name: 'Add' },
            { name: 'Library' },
            { name: 'Settings' },
          ],
        },
      },
    ],
  };
}

const isReady = jest.mocked(navigationRef.isReady);
const getRootState = jest.mocked(navigationRef.getRootState);
const dispatch = jest.mocked(navigationRef.dispatch);

function renderActions() {
  return renderHook(() =>
    useAddSheetActions({ syncMutation: syncMutationStub })
  ).result.current;
}

describe('useAddSheetActions handleStartCheckIn', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    isReady.mockReturnValue(true);
    useDiaryDateStore.setState({ selectedDate: '2026-10-22' });
    useGuidedCheckInStore.setState({ progress: null });
  });

  it('offers to continue a check-in left on the same day, and opens where it stopped', () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    useGuidedCheckInStore.setState({
      progress: {
        date: '2026-10-20',
        step: 'MeasurementsAdd',
        flags: { saved: true },
      },
    });
    getRootState.mockReturnValue(
      rootStateWithDiaryParams({ selectedDate: '2026-10-20' }) as ReturnType<
        typeof navigationRef.getRootState
      >
    );

    renderActions().handleStartCheckIn();

    expect(dispatch).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'Continue your check-in?',
      'You stopped at step 2 of 3.',
      expect.any(Array),
      expect.objectContaining({ cancelable: true })
    );
    const buttons = alertSpy.mock.calls[0]?.[2] ?? [];
    buttons.find((button) => button.text === 'Continue')?.onPress?.();

    expect(dispatch).toHaveBeenCalledWith(
      CommonActions.navigate({
        name: 'MeasurementsAdd',
        params: { date: '2026-10-20', guidedCheckIn: { saved: true } },
      })
    );
    alertSpy.mockRestore();
  });

  it("opens MoodLog in the guided check-in on the Diary's active date", () => {
    getRootState.mockReturnValue(
      rootStateWithDiaryParams({ selectedDate: '2026-10-20' }) as ReturnType<
        typeof navigationRef.getRootState
      >
    );

    renderActions().handleStartCheckIn();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      CommonActions.navigate({
        name: 'MoodLog',
        params: { date: '2026-10-20', guidedCheckIn: {} },
      })
    );
  });

  it("falls back to the diary store's date when the Diary route has none", () => {
    getRootState.mockReturnValue(
      rootStateWithDiaryParams() as ReturnType<
        typeof navigationRef.getRootState
      >
    );

    renderActions().handleStartCheckIn();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      CommonActions.navigate({
        name: 'MoodLog',
        params: { date: '2026-10-22', guidedCheckIn: {} },
      })
    );
  });

  it('dispatches nothing while the navigation ref is not ready', () => {
    isReady.mockReturnValue(false);

    renderActions().handleStartCheckIn();

    expect(getRootState).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('leaves the plain Mood row outside the check-in', () => {
    getRootState.mockReturnValue(
      rootStateWithDiaryParams({ selectedDate: '2026-10-20' }) as ReturnType<
        typeof navigationRef.getRootState
      >
    );

    renderActions().handleAddMood();

    expect(dispatch).toHaveBeenCalledWith(
      CommonActions.navigate({
        name: 'MoodLog',
        params: { date: '2026-10-20' },
      })
    );
  });
});

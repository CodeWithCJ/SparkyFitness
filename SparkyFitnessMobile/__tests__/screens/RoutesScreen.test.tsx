import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import RoutesScreen from '../../src/screens/RoutesScreen';
import {
  GpxFileTooLargeError,
  pickAndImportGpx,
  useRouteGenerationAvailable,
  useRoutes,
} from '../../src/services/routeService';
import { canShowRouteMap } from '../../src/utils/routeMapSupport';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/services/routeService', () => ({
  GpxFileTooLargeError: class GpxFileTooLargeError extends Error {},
  useRoutes: jest.fn(),
  useRouteGenerationAvailable: jest.fn(),
  pickAndImportGpx: jest.fn(),
}));
jest.mock('../../src/utils/routeMapSupport', () => ({
  canShowRouteMap: jest.fn(),
}));
const mockHeader = jest.fn();
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: (options: unknown) => {
    mockHeader(options);
    return null;
  },
}));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: () => undefined,
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const navigate = jest.fn();
const refetch = jest.fn();
const summary = (id: string, name: string, distanceM: number) => ({
  id,
  name,
  activity: 'run' as const,
  source: 'drawn' as const,
  distanceM,
  elevationGainM: null,
  sourceExerciseEntryId: null,
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
  start: { lat: 40, lon: -74 },
  pointCount: 2,
});
const renderScreen = () =>
  render(
    <RoutesScreen
      {...({
        navigation: { navigate },
      } as unknown as RootStackScreenProps<'Routes'>)}
    />
  );

beforeAll(async () => {
  await initializeI18n('en');
});
beforeEach(() => {
  jest.clearAllMocks();
  (useRouteGenerationAvailable as jest.Mock).mockReturnValue({
    available: false,
  });
  (useRoutes as jest.Mock).mockReturnValue({
    routes: [],
    isLoading: false,
    isError: false,
    refetch,
  });
});

const openAddMenu = (): string[] => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  renderScreen();
  const header = mockHeader.mock.calls.at(-1)?.[0] as {
    right: { onPress: () => void };
  };
  header.right.onPress();
  const buttons = alert.mock.calls[0]?.[2] ?? [];
  return buttons.map((b) => b.text ?? '');
};

describe('RoutesScreen add menu', () => {
  it('offers drawing on a map when this build can show one', () => {
    (canShowRouteMap as jest.Mock).mockReturnValue(true);
    expect(openAddMenu()).toContain('Draw on a map');
  });

  it('hides drawing where the map would render blank, but keeps importing', () => {
    (canShowRouteMap as jest.Mock).mockReturnValue(false);
    const labels = openAddMenu();
    expect(labels).not.toContain('Draw on a map');
    expect(labels).toContain('Import a GPX file');
  });

  it('offers generating only when there is a routing provider and a map', () => {
    (useRouteGenerationAvailable as jest.Mock).mockReturnValue({
      available: true,
    });
    (canShowRouteMap as jest.Mock).mockReturnValue(true);
    expect(openAddMenu()).toContain('Generate a loop or out-and-back');
  });

  it('does not offer generating without a routing provider', () => {
    (canShowRouteMap as jest.Mock).mockReturnValue(true);
    expect(openAddMenu()).not.toContain('Generate a loop or out-and-back');
  });

  it('does not offer generating where the map would render blank', () => {
    (useRouteGenerationAvailable as jest.Mock).mockReturnValue({
      available: true,
    });
    (canShowRouteMap as jest.Mock).mockReturnValue(false);
    const labels = openAddMenu();
    expect(labels).not.toContain('Generate a loop or out-and-back');
    expect(labels).toContain('Import a GPX file');
  });
});

const mockRoutes = (state: Partial<ReturnType<typeof useRoutes>>) =>
  (useRoutes as jest.Mock).mockReturnValue({
    routes: [],
    isLoading: false,
    isError: false,
    refetch,
    ...state,
  });

describe('RoutesScreen list', () => {
  it('says there are no routes yet', () => {
    const screen = renderScreen();
    expect(screen.getByText(/No routes yet/)).toBeTruthy();
  });

  it('shows a spinner while loading, not the empty text', () => {
    mockRoutes({ isLoading: true });
    const screen = renderScreen();
    expect(screen.queryByText(/No routes yet/)).toBeNull();
  });

  it('offers a retry when the list cannot be loaded', () => {
    mockRoutes({ isError: true });
    const screen = renderScreen();
    expect(screen.getByText('Could not load your routes.')).toBeTruthy();
    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps showing the routes it has when a refresh fails', () => {
    mockRoutes({ isError: true, routes: [summary('r1', 'Loop', 5000)] });
    const screen = renderScreen();
    expect(screen.getByText('Loop')).toBeTruthy();
    expect(screen.queryByText('Could not load your routes.')).toBeNull();
  });

  it('lists routes with their distance and opens one', () => {
    mockRoutes({
      routes: [summary('r1', 'Loop', 5000), summary('r2', 'Hill', 12400)],
    });
    const screen = renderScreen();
    expect(screen.getByText('5.00 km')).toBeTruthy();
    expect(screen.getByText('12.4 km')).toBeTruthy();
    fireEvent.press(screen.getByText('Hill'));
    expect(navigate).toHaveBeenCalledWith('RouteDetail', { id: 'r2' });
  });
});

describe('RoutesScreen import', () => {
  const importFromMenu = async () => {
    (canShowRouteMap as jest.Mock).mockReturnValue(false);
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    renderScreen();
    const header = mockHeader.mock.calls.at(-1)?.[0] as {
      right: { onPress: () => void };
    };
    header.right.onPress();
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    buttons.find((b) => b.text === 'Import a GPX file')?.onPress?.();
  };

  it('opens the imported route', async () => {
    (pickAndImportGpx as jest.Mock).mockResolvedValue({ id: 'new' });
    await importFromMenu();
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('RouteDetail', { id: 'new' })
    );
  });

  it('does nothing when the picker is closed', async () => {
    (pickAndImportGpx as jest.Mock).mockResolvedValue(null);
    await importFromMenu();
    await waitFor(() => expect(pickAndImportGpx).toHaveBeenCalled());
    expect(navigate).not.toHaveBeenCalled();
    expect(Toast.show).not.toHaveBeenCalled();
  });

  it('explains a file that is not a usable GPX file', async () => {
    (pickAndImportGpx as jest.Mock).mockRejectedValue(new Error('400'));
    await importFromMenu();
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          text1: 'Could not import that file',
          text2: 'Choose a GPX file with a track or route in it.',
        })
      )
    );
  });

  it('says when the file is too large', async () => {
    (pickAndImportGpx as jest.Mock).mockRejectedValue(
      new GpxFileTooLargeError()
    );
    await importFromMenu();
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ text1: 'That file is too large' })
      )
    );
  });

  it('turns the Add button off while a file is being imported', async () => {
    (pickAndImportGpx as jest.Mock).mockReturnValue(new Promise(() => {}));
    await importFromMenu();
    await waitFor(() => {
      const header = mockHeader.mock.calls.at(-1)?.[0] as {
        right: { disabled: boolean };
      };
      expect(header.right.disabled).toBe(true);
    });
  });
});

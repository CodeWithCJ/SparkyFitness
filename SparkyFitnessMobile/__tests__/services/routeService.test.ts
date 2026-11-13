import * as DocumentPicker from 'expo-document-picker';
import type { Route, RouteSummary } from '@workspace/shared';
import { queryClient } from '../../src/hooks/queryClient';
import { routeQueryKey, routesQueryKey } from '../../src/hooks/queryKeys';
import {
  createRouteFromActivity,
  deleteRoute,
  fetchRoutes,
  importGpxRoute,
  updateRoute,
} from '../../src/services/api/routeApi';
import { shareGpxFile } from '../../src/services/gpxExport';
import {
  GpxFileTooLargeError,
  pickAndImportGpx,
  removeRoute,
  renameRoute,
  saveActivityAsRoute,
  shareRouteGpx,
} from '../../src/services/routeService';

const mockText = jest.fn();
const mockDelete = jest.fn();
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({
    uri,
    text: (...args: unknown[]) => mockText(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
  })),
  Paths: { cache: { uri: 'file:///cache/' } },
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('../../src/services/gpxExport', () => ({
  shareGpxFile: jest.fn(),
}));
jest.mock('../../src/services/api/routeApi', () => ({
  createRoute: jest.fn(),
  createRouteFromActivity: jest.fn(),
  deleteRoute: jest.fn(),
  fetchRoute: jest.fn(),
  fetchRoutes: jest.fn(),
  importGpxRoute: jest.fn(),
  updateRoute: jest.fn(),
}));

const route = (overrides: Partial<Route> = {}): Route => ({
  id: 'r1',
  name: 'Loop',
  activity: 'run',
  source: 'gpx',
  distanceM: 1000,
  elevationGainM: null,
  points: [
    { lat: 40, lon: -74 },
    { lat: 40.01, lon: -74 },
  ],
  cues: [],
  sourceExerciseEntryId: null,
  createdAt: '2026-10-20T00:00:00.000Z',
  updatedAt: '2026-10-20T00:00:00.000Z',
  ...overrides,
});
const summary = (id: string): RouteSummary => ({
  ...route({ id }),
  start: { lat: 40, lon: -74 },
  pointCount: 2,
});

const pick = DocumentPicker.getDocumentAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockText.mockReset();
  mockDelete.mockReset();
  queryClient.clear();
  (fetchRoutes as jest.Mock).mockResolvedValue({ routes: [] });
});

describe('pickAndImportGpx', () => {
  it('resolves to null and calls nothing when the picker is closed', async () => {
    pick.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickAndImportGpx()).resolves.toBeNull();
    expect(importGpxRoute).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('sends the text of the chosen file and removes the cached copy', async () => {
    pick.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/run.gpx', size: 400 }],
    });
    mockText.mockResolvedValue('<gpx/>');
    (importGpxRoute as jest.Mock).mockResolvedValue({ route: route() });
    queryClient.setQueryData(routesQueryKey, []);
    await expect(pickAndImportGpx()).resolves.toMatchObject({ id: 'r1' });
    expect(importGpxRoute).toHaveBeenCalledWith({ gpx: '<gpx/>' });
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryState(routesQueryKey)?.isInvalidated).toBe(true);
  });

  it('refuses a file that is far too big without reading it', async () => {
    pick.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/huge.gpx', size: 500_000_000 }],
    });
    await expect(pickAndImportGpx()).rejects.toBeInstanceOf(
      GpxFileTooLargeError
    );
    expect(mockText).not.toHaveBeenCalled();
    expect(importGpxRoute).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('refuses text longer than the server accepts', async () => {
    pick.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/big.gpx', size: 9_000_000 }],
    });
    mockText.mockResolvedValue('x'.repeat(10_000_001));
    await expect(pickAndImportGpx()).rejects.toBeInstanceOf(
      GpxFileTooLargeError
    );
    expect(importGpxRoute).not.toHaveBeenCalled();
  });

  it('still removes the copy when the server refuses the file', async () => {
    pick.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/notes.txt' }],
    });
    mockText.mockResolvedValue('not gpx');
    (importGpxRoute as jest.Mock).mockRejectedValue(new Error('400'));
    await expect(pickAndImportGpx()).rejects.toThrow('400');
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('does not fail the import when the copy cannot be deleted', async () => {
    pick.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/run.gpx' }],
    });
    mockText.mockResolvedValue('<gpx/>');
    mockDelete.mockImplementation(() => {
      throw new Error('gone');
    });
    (importGpxRoute as jest.Mock).mockResolvedValue({ route: route() });
    await expect(pickAndImportGpx()).resolves.toMatchObject({ id: 'r1' });
  });
});

describe('cache after changes', () => {
  it('refreshes the list and an open route after a rename', async () => {
    queryClient.setQueryData(routesQueryKey, [summary('r1')]);
    queryClient.setQueryData(routeQueryKey('r1'), route());
    (updateRoute as jest.Mock).mockResolvedValue({
      route: route({ name: 'New' }),
    });
    await renameRoute('r1', { name: 'New' });
    expect(queryClient.getQueryState(routesQueryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(routeQueryKey('r1'))?.isInvalidated).toBe(
      true
    );
  });

  it('drops a deleted route from the list without refetching its own page', async () => {
    queryClient.setQueryData(routesQueryKey, [summary('r1'), summary('r2')]);
    queryClient.setQueryData(routeQueryKey('r1'), route());
    (deleteRoute as jest.Mock).mockResolvedValue(undefined);
    (fetchRoutes as jest.Mock).mockResolvedValue({ routes: [summary('r2')] });
    await removeRoute('r1');
    const list = queryClient.getQueryData<RouteSummary[]>(routesQueryKey);
    expect(list?.map((r) => r.id)).toEqual(['r2']);
    // The detail entry was left alone, so a screen still showing it is not
    // sent to fetch a route that no longer exists.
    expect(queryClient.getQueryState(routeQueryKey('r1'))?.isInvalidated).toBe(
      false
    );
  });

  it('does not touch the cache when the delete fails', async () => {
    queryClient.setQueryData(routesQueryKey, [summary('r1')]);
    (deleteRoute as jest.Mock).mockRejectedValue(new Error('offline'));
    await expect(removeRoute('r1')).rejects.toThrow('offline');
    expect(queryClient.getQueryData(routesQueryKey)).toHaveLength(1);
  });
});

describe('saveActivityAsRoute', () => {
  it('lets the server name the route after the activity', async () => {
    (createRouteFromActivity as jest.Mock).mockResolvedValue({
      route: route({ source: 'activity' }),
    });
    await saveActivityAsRoute('entry-1');
    expect(createRouteFromActivity).toHaveBeenCalledWith('entry-1');
  });
});

describe('shareRouteGpx', () => {
  it('shares the route as GPX under a file-safe name', async () => {
    (shareGpxFile as jest.Mock).mockResolvedValue(true);
    await expect(
      shareRouteGpx(route({ name: 'Loop / Café: 5k?' }))
    ).resolves.toBe(true);
    const options = (shareGpxFile as jest.Mock).mock.calls[0]?.[0];
    expect(options.fileName).toBe('Loop_Café_5k_.gpx');
    expect(options.title).toBe('Loop / Café: 5k?');
    expect(options.xml).toContain('<trkpt lat="40" lon="-74">');
  });

  it('falls back to a plain name when nothing in it is usable', async () => {
    (shareGpxFile as jest.Mock).mockResolvedValue(false);
    await expect(shareRouteGpx(route({ name: '???' }))).resolves.toBe(false);
    expect((shareGpxFile as jest.Mock).mock.calls[0]?.[0].fileName).toBe(
      '_.gpx'
    );
  });
});

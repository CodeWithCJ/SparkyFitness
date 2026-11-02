import { renderHook, waitFor } from '@testing-library/react-native';
import { useSaveLabResult } from '../../src/hooks/useLabResults';
import {
  createLabMarker,
  createLabResult,
  fetchLabMarkers,
} from '../../src/services/api/labResultsApi';
import { ApiError } from '../../src/services/api/errors';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/labResultsApi', () => ({
  createLabMarker: jest.fn(),
  createLabResult: jest.fn(),
  deleteLabResult: jest.fn(),
  fetchLabMarkers: jest.fn(),
  fetchLabResults: jest.fn(),
  fetchLatestLabResults: jest.fn(),
}));
jest.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: undefined }),
}));

const base = {
  value: 5.4,
  unit: '%',
  ref_range_low: 4.8,
  ref_range_high: 5.6,
  date: '2026-09-20',
  notes: ' fasting ',
};

const renderSave = () =>
  renderHook(() => useSaveLabResult(), {
    wrapper: createQueryWrapper(createTestQueryClient()),
  });

describe('useSaveLabResult', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(createLabResult).mockResolvedValue({ id: 'r-1' } as never);
  });

  it('saves a built-in marker result with its own unit and range', async () => {
    const { result } = renderSave();

    result.current.mutate({ ...base, target: { markerKey: 'hba1c' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createLabMarker).not.toHaveBeenCalled();
    expect(createLabResult).toHaveBeenCalledWith({
      marker_key: 'hba1c',
      entry_date: '2026-09-20',
      value_numeric: 5.4,
      unit: '%',
      ref_range_low: 4.8,
      ref_range_high: 5.6,
      notes: 'fasting',
    });
  });

  it('saves straight to one of the user markers', async () => {
    const { result } = renderSave();

    result.current.mutate({ ...base, notes: '', target: { markerId: 'm-1' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createLabMarker).not.toHaveBeenCalled();
    expect(createLabResult).toHaveBeenCalledWith(
      expect.objectContaining({ custom_marker_id: 'm-1', notes: undefined })
    );
  });

  it('creates the marker first when it is new', async () => {
    jest.mocked(createLabMarker).mockResolvedValue({ id: 'm-9' } as never);
    const { result } = renderSave();

    result.current.mutate({ ...base, target: { newMarkerName: 'ApoB' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createLabMarker).toHaveBeenCalledWith({
      name: 'ApoB',
      unit: '%',
      ref_range_low: 4.8,
      ref_range_high: 5.6,
    });
    expect(createLabResult).toHaveBeenCalledWith(
      expect.objectContaining({ custom_marker_id: 'm-9' })
    );
  });

  it('reuses the marker when a retry finds the name already taken', async () => {
    jest
      .mocked(createLabMarker)
      .mockRejectedValue(new ApiError('conflict', 409));
    jest
      .mocked(fetchLabMarkers)
      .mockResolvedValue([{ id: 'm-7', name: 'apob' }] as never);
    const { result } = renderSave();

    result.current.mutate({ ...base, target: { newMarkerName: 'ApoB' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createLabResult).toHaveBeenCalledWith(
      expect.objectContaining({ custom_marker_id: 'm-7' })
    );
  });

  it('does not save a result when creating the marker fails', async () => {
    jest.mocked(createLabMarker).mockRejectedValue(new Error('boom'));
    const { result } = renderSave();

    result.current.mutate({ ...base, target: { newMarkerName: 'ApoB' } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(createLabResult).not.toHaveBeenCalled();
  });
});

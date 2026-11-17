import { renderHook, waitFor } from '@testing-library/react-native';
import {
  useDeleteLabImports,
  useDeleteLabMarker,
  useSaveLabResult,
} from '../../src/hooks/useLabResults';
import {
  createLabMarker,
  createLabResult,
  deleteLabMarker,
} from '../../src/services/api/labResultsApi';
import {
  deleteBuiltinMarkerResults,
  deleteLabImports,
} from '../../src/services/api/labReportApi';
import { ApiError } from '../../src/services/api/errors';
import { createQueryWrapper, createTestQueryClient } from './queryTestUtils';

jest.mock('../../src/services/api/labResultsApi', () => ({
  createLabMarker: jest.fn(),
  createLabResult: jest.fn(),
  deleteLabMarker: jest.fn(),
  deleteLabResult: jest.fn(),
  fetchLabMarkers: jest.fn(),
  fetchLabResults: jest.fn(),
  fetchLatestLabResults: jest.fn(),
}));
jest.mock('../../src/services/api/labReportApi', () => ({
  deleteBuiltinMarkerResults: jest.fn(),
  deleteLabImports: jest.fn(),
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
    expect(createLabResult).toHaveBeenCalledWith(
      expect.objectContaining({ custom_marker_id: 'm-1', notes: undefined })
    );
  });

  it('names a new marker in the result request, so the server creates both together', async () => {
    jest.mocked(createLabResult).mockResolvedValue({ id: 'r-1' } as never);
    const { result } = renderSave();

    result.current.mutate({ ...base, target: { newMarkerName: 'ApoB' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createLabResult).toHaveBeenCalledTimes(1);
    expect(createLabResult).toHaveBeenCalledWith(
      expect.objectContaining({
        custom_marker_name: 'ApoB',
        unit: '%',
        ref_range_low: 4.8,
        ref_range_high: 5.6,
      })
    );
    expect(jest.mocked(createLabResult).mock.calls[0]?.[0]).not.toHaveProperty(
      'custom_marker_id'
    );
  });
  it('falls back to creating the marker first on an older server', async () => {
    jest
      .mocked(createLabResult)
      .mockRejectedValueOnce(
        new ApiError(
          'Server error: 400',
          400,
          '{"error":"Invalid request body","details":{"marker_key":{"_errors":["Provide exactly one of marker_key or custom_marker_id"]}}}'
        )
      )
      .mockResolvedValueOnce({ id: 'r-1' } as never);
    jest.mocked(createLabMarker).mockResolvedValue({ id: 'm-9' } as never);
    const { result } = renderSave();

    result.current.mutate({ ...base, target: { newMarkerName: 'ApoB' } });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(createLabMarker).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ApoB', unit: '%' })
    );
    expect(jest.mocked(createLabResult).mock.calls[1]?.[0]).toMatchObject({
      custom_marker_id: 'm-9',
    });
  });

  it('does not fall back on an ordinary refusal from a current server', async () => {
    jest
      .mocked(createLabResult)
      .mockRejectedValue(
        new ApiError(
          'Server error: 400',
          400,
          '{"error":"Invalid request body","details":{"ref_range_low":{"_errors":["ref_range_low must not exceed ref_range_high"]}}}'
        )
      );
    const { result } = renderSave();

    result.current.mutate({ ...base, target: { newMarkerName: 'ApoB' } });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(createLabMarker).not.toHaveBeenCalled();
  });
});

describe('deleting lab data', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deletes a built-in marker by clearing its results', async () => {
    const { result } = renderHook(() => useDeleteLabMarker(), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });

    result.current.mutate({ markerKey: 'hba1c' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteBuiltinMarkerResults).toHaveBeenCalledWith('hba1c');
    expect(deleteLabMarker).not.toHaveBeenCalled();
  });

  it('deletes one of the user’s own markers outright', async () => {
    const { result } = renderHook(() => useDeleteLabMarker(), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });

    result.current.mutate({ markerId: 'm-1' });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteLabMarker).toHaveBeenCalledWith('m-1');
    expect(deleteBuiltinMarkerResults).not.toHaveBeenCalled();
  });

  it('deletes every imported report', async () => {
    jest
      .mocked(deleteLabImports)
      .mockResolvedValue({ reports: 1, results: 3, markers: 0 });
    const { result } = renderHook(() => useDeleteLabImports(), {
      wrapper: createQueryWrapper(createTestQueryClient()),
    });

    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(deleteLabImports).toHaveBeenCalled();
  });
});

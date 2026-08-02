import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useBackupList, useDownloadBackupFile } from '@/hooks/Admin/useBackups';
import * as backupApi from '@/api/Admin/backup';

jest.mock('@/api/Admin/backup');
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

const mockedListBackups = backupApi.listBackups as jest.MockedFunction<
  typeof backupApi.listBackups
>;
const mockedDownloadBackupFile =
  backupApi.downloadBackupFile as jest.MockedFunction<
    typeof backupApi.downloadBackupFile
  >;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper };
};

describe('useBackupList', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches the backup list when enabled', async () => {
    mockedListBackups.mockResolvedValue({
      backups: [
        {
          fileName: 'sparkyfitness_full_backup_2026-01-01T00-00-00-000Z.tar.gz',
          size: 10,
          createdAt: '2026-01-01T00:00:00.000Z',
          completedAt: '2026-01-01T00:00:05.000Z',
        },
      ],
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useBackupList(true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.backups).toHaveLength(1);
    expect(mockedListBackups).toHaveBeenCalledTimes(1);
  });

  it('does not fetch when disabled', () => {
    const { Wrapper } = createWrapper();
    renderHook(() => useBackupList(false), { wrapper: Wrapper });

    expect(mockedListBackups).not.toHaveBeenCalled();
  });

  it('transitions to error state when the API call fails', async () => {
    mockedListBackups.mockRejectedValue(new Error('Network error'));

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useBackupList(true), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe('useDownloadBackupFile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('calls downloadBackupFile with the given file name', async () => {
    mockedDownloadBackupFile.mockResolvedValue(new Blob(['data']));

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useDownloadBackupFile(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate('sparkyfitness_full_backup_a.tar.gz');
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedDownloadBackupFile.mock.calls[0]?.[0]).toBe(
      'sparkyfitness_full_backup_a.tar.gz'
    );
  });

  it('transitions to error state when the download fails', async () => {
    mockedDownloadBackupFile.mockRejectedValue(new Error('Download failed'));

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useDownloadBackupFile(), {
      wrapper: Wrapper,
    });

    await act(async () => {
      result.current.mutate('sparkyfitness_full_backup_a.tar.gz');
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

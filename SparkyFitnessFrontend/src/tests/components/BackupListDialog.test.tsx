import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BackupListDialog } from '@/pages/Admin/BackupListDialog';
import { useBackupList, useDownloadBackupFile } from '@/hooks/Admin/useBackups';
import type { BackupFileInfo } from '@workspace/shared';

jest.mock('@/hooks/Admin/useBackups');

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValueOrOptions?: string | { count?: number },
      _options?: unknown
    ) => {
      if (typeof defaultValueOrOptions === 'string') {
        return defaultValueOrOptions;
      }
      if (key === 'admin.backupSettings.backupCount') {
        const count = defaultValueOrOptions?.count ?? 0;
        return `${count} backup${count === 1 ? '' : 's'}`;
      }
      return key;
    },
  }),
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <div>{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const mockedUseBackupList = useBackupList as jest.MockedFunction<
  typeof useBackupList
>;
const mockedUseDownloadBackupFile =
  useDownloadBackupFile as jest.MockedFunction<typeof useDownloadBackupFile>;

// Timestamps are deliberately mid-month at midday UTC: the dialog groups by
// *local* month, so a midnight-on-the-1st fixture would land in the previous
// month for any test runner west of UTC.
const backupFeb: BackupFileInfo = {
  fileName: 'sparkyfitness_full_backup_2026-02-10T12-00-00-000Z.tar.gz',
  size: 1024,
  createdAt: '2026-02-10T12:00:00.000Z',
  completedAt: '2026-02-10T12:00:05.000Z',
};
const backupJan: BackupFileInfo = {
  fileName: 'sparkyfitness_full_backup_2026-01-15T12-00-00-000Z.tar.gz',
  size: 2048,
  createdAt: '2026-01-15T12:00:00.000Z',
  completedAt: '2026-01-15T12:00:05.000Z',
};
const backupDec: BackupFileInfo = {
  fileName: 'sparkyfitness_full_backup_2025-12-10T12-00-00-000Z.tar.gz',
  size: 512,
  createdAt: '2025-12-10T12:00:00.000Z',
  completedAt: '2025-12-10T12:00:05.000Z',
};

const mockMutate = jest.fn();

const mockUseBackupList = (
  overrides: Partial<ReturnType<typeof useBackupList>>
) => {
  mockedUseBackupList.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...overrides,
  } as ReturnType<typeof useBackupList>);
};

describe('BackupListDialog', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseDownloadBackupFile.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
      variables: undefined,
    } as unknown as ReturnType<typeof useDownloadBackupFile>);
  });

  it('shows an empty state when there are no backups', () => {
    mockUseBackupList({ data: { backups: [] } });

    render(<BackupListDialog open onOpenChange={jest.fn()} />);

    expect(screen.getByText('No backup files found.')).toBeInTheDocument();
  });

  it('shows an error message when the list fails to load', () => {
    mockUseBackupList({ isError: true });

    render(<BackupListDialog open onOpenChange={jest.fn()} />);

    expect(
      screen.getByText('Failed to fetch backup files.')
    ).toBeInTheDocument();
  });

  it('groups backups by month, newest month first, with only the newest month expanded by default', () => {
    mockUseBackupList({
      data: { backups: [backupFeb, backupJan, backupDec] },
    });

    render(<BackupListDialog open onOpenChange={jest.fn()} />);

    const monthHeadings = screen.getAllByRole('button', { name: /202[56]/ });
    expect(monthHeadings).toHaveLength(3);
    expect(monthHeadings[0]).toHaveTextContent('February 2026');
    expect(monthHeadings[1]).toHaveTextContent('January 2026');
    expect(monthHeadings[2]).toHaveTextContent('December 2025');

    // Newest month is expanded by default.
    expect(screen.getByText(backupFeb.fileName)).toBeInTheDocument();
    // Older months start collapsed.
    expect(screen.queryByText(backupJan.fileName)).not.toBeInTheDocument();
    expect(screen.queryByText(backupDec.fileName)).not.toBeInTheDocument();
  });

  it('expands an older month on click and reveals its backups', async () => {
    mockUseBackupList({ data: { backups: [backupFeb, backupJan] } });

    render(<BackupListDialog open onOpenChange={jest.fn()} />);

    expect(screen.queryByText(backupJan.fileName)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('January 2026'));

    expect(await screen.findByText(backupJan.fileName)).toBeInTheDocument();
  });

  it('downloads the specific backup that was clicked, not just the newest', async () => {
    mockUseBackupList({ data: { backups: [backupFeb, backupJan] } });

    render(<BackupListDialog open onOpenChange={jest.fn()} />);

    fireEvent.click(screen.getByText('January 2026'));
    const row = (await screen.findByText(backupJan.fileName)).closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLElement).getByRole('button'));

    expect(mockMutate.mock.calls[0][0]).toBe(backupJan.fileName);
  });
});

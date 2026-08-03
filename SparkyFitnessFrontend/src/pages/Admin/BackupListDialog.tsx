import type React from 'react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BackupFileInfo } from '@workspace/shared';
import { useBackupList, useDownloadBackupFile } from '@/hooks/Admin/useBackups';

interface BackupListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface BackupMonthGroup {
  key: string;
  label: string;
  backups: BackupFileInfo[];
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
};

const groupBackupsByMonth = (backups: BackupFileInfo[]): BackupMonthGroup[] => {
  const groups = new Map<string, BackupMonthGroup>();
  for (const backup of backups) {
    const date = new Date(backup.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const existing = groups.get(key);
    if (existing) {
      existing.backups.push(backup);
    } else {
      groups.set(key, {
        key,
        label: date.toLocaleDateString(undefined, {
          month: 'long',
          year: 'numeric',
        }),
        backups: [backup],
      });
    }
  }
  return Array.from(groups.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
};

export const BackupListDialog: React.FC<BackupListDialogProps> = ({
  open,
  onOpenChange,
}) => {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useBackupList(open);
  const {
    mutate: downloadFile,
    isPending,
    variables: downloadingFileName,
  } = useDownloadBackupFile();

  const monthGroups = useMemo(
    () => groupBackupsByMonth(data?.backups ?? []),
    [data]
  );

  const handleDownload = (backup: BackupFileInfo) => {
    downloadFile(backup.fileName, {
      onSuccess: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = backup.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-6xl w-[95vw]">
        <DialogHeader>
          <DialogTitle>
            {t('admin.backupSettings.availableBackups', 'Available Backups')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'admin.backupSettings.availableBackupsDescription',
              'Choose a backup file to download.'
            )}
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {isError && (
          <p className="text-red-600 py-4">
            {t(
              'admin.backupSettings.failedToFetchBackups',
              'Failed to fetch backup files.'
            )}
          </p>
        )}

        {!isLoading && !isError && monthGroups.length === 0 && (
          <p className="text-muted-foreground py-4">
            {t('admin.backupSettings.noBackupsFound', 'No backup files found.')}
          </p>
        )}

        {!isLoading && !isError && monthGroups.length > 0 && (
          <div className="max-h-[75vh] overflow-y-auto">
            <Accordion
              type="multiple"
              defaultValue={monthGroups.slice(0, 1).map((group) => group.key)}
            >
              {monthGroups.map((group) => (
                <AccordionItem key={group.key} value={group.key}>
                  <AccordionTrigger
                    description={t('admin.backupSettings.backupCount', {
                      count: group.backups.length,
                    })}
                  >
                    {group.label}
                  </AccordionTrigger>
                  <AccordionContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>
                            {t(
                              'admin.backupSettings.backupFileName',
                              'File Name'
                            )}
                          </TableHead>
                          <TableHead className="whitespace-nowrap">
                            {t('admin.backupSettings.backupDate', 'Started')}
                          </TableHead>
                          <TableHead className="whitespace-nowrap">
                            {t(
                              'admin.backupSettings.backupCompletedDate',
                              'Completed'
                            )}
                          </TableHead>
                          <TableHead className="whitespace-nowrap">
                            {t('admin.backupSettings.backupSize', 'Size')}
                          </TableHead>
                          <TableHead className="text-right">
                            {t('admin.backupSettings.download', 'Download')}
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.backups.map((backup) => {
                          const isDownloadingThis =
                            isPending &&
                            downloadingFileName === backup.fileName;
                          return (
                            <TableRow key={backup.fileName}>
                              <TableCell className="break-all">
                                {backup.fileName}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {new Date(backup.createdAt).toLocaleString()}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {new Date(backup.completedAt).toLocaleString()}
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                {formatFileSize(backup.size)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isPending}
                                  onClick={() => handleDownload(backup)}
                                  className="flex items-center gap-2"
                                  aria-label={t(
                                    'admin.backupSettings.downloadBackupFile',
                                    'Download {{fileName}}',
                                    { fileName: backup.fileName }
                                  )}
                                >
                                  {isDownloadingThis ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <Download className="h-4 w-4" />
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

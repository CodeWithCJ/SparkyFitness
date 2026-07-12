import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, Upload } from 'lucide-react';
import type { ImportFitFileResult } from '@workspace/shared';
import { useFitImport } from '@/hooks/Exercises/useFitImport';

const MAX_FILES = 10;

const statusVariant = (
  status: ImportFitFileResult['status']
): 'default' | 'secondary' | 'destructive' => {
  if (status === 'failed') return 'destructive';
  if (status === 'updated') return 'secondary';
  return 'default';
};

const ExerciseImportFit = () => {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { importFiles, response, isImporting } = useFitImport();

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(event.target.files ?? []).slice(0, MAX_FILES));
  };

  const handleImport = async () => {
    await importFiles(files);
    setFiles([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            {t('exercise.importFit.title', 'Import FIT Files')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t(
              'exercise.importFit.description',
              'Upload FIT activity files exported from your device or app (up to 10 at a time). Each file becomes a diary entry with heart rate, laps, and other report data. Re-uploading a file updates its entry.'
            )}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".fit"
              multiple
              onChange={handleFilesSelected}
              disabled={isImporting}
              className="sm:max-w-md"
            />
            <Button
              onClick={handleImport}
              disabled={files.length === 0 || isImporting}
            >
              {isImporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {isImporting
                ? t('exercise.importFit.importing', 'Importing...')
                : t(
                    'exercise.importFit.importButton',
                    'Import {{count}} file(s)',
                    {
                      count: files.length,
                    }
                  )}
            </Button>
          </div>
        </CardContent>
      </Card>
      {response && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t('exercise.importFit.resultsTitle', 'Import Results')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t('exercise.importFit.fileColumn', 'File')}
                  </TableHead>
                  <TableHead>
                    {t('exercise.importFit.statusColumn', 'Status')}
                  </TableHead>
                  <TableHead>
                    {t('exercise.importFit.activityColumn', 'Activity')}
                  </TableHead>
                  <TableHead>
                    {t('exercise.importFit.dateColumn', 'Date')}
                  </TableHead>
                  <TableHead>
                    {t('exercise.importFit.detailsColumn', 'Details')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {response.results.map((result, index) => (
                  <TableRow key={`${result.fileName}-${index}`}>
                    <TableCell className="font-medium">
                      {result.fileName}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(result.status)}>
                        {result.status === 'created' &&
                          t('exercise.importFit.statusCreated', 'Imported')}
                        {result.status === 'updated' &&
                          t('exercise.importFit.statusUpdated', 'Updated')}
                        {result.status === 'failed' &&
                          t('exercise.importFit.statusFailed', 'Failed')}
                      </Badge>
                    </TableCell>
                    <TableCell>{result.activityName ?? '—'}</TableCell>
                    <TableCell>{result.entryDate ?? '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {result.reason ?? result.warning ?? ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ExerciseImportFit;

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ImportFitResponse } from '@workspace/shared';
import { toast } from '@/hooks/use-toast';
import { useImportFitFilesMutation } from './useExercises';

/**
 * Upload state for the FIT import tab. The endpoint always answers 200 with
 * mixed per-file results, so success and failure both land in `response` and
 * the summary toast is composed from the counts.
 */
export const useFitImport = () => {
  const { t } = useTranslation();
  const [response, setResponse] = useState<ImportFitResponse | null>(null);
  const { mutateAsync, isPending } = useImportFitFilesMutation();

  const importFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setResponse(null);
    try {
      const result = await mutateAsync(files);
      setResponse(result);
      const imported = result.created + result.updated;
      if (result.failed === 0) {
        toast({
          title: t('exercise.importFit.successTitle', 'Import complete'),
          description: t(
            'exercise.importFit.successDescription',
            '{{count}} activities imported.',
            { count: imported }
          ),
        });
      } else {
        toast({
          title: t(
            'exercise.importFit.partialTitle',
            'Import finished with errors'
          ),
          description: t(
            'exercise.importFit.partialDescription',
            '{{imported}} imported, {{failed}} failed. See the results below.',
            { imported, failed: result.failed }
          ),
          variant: imported > 0 ? 'default' : 'destructive',
        });
      }
    } catch {
      // Request-level failure (network, size limit, auth) — apiCall already
      // surfaced an error toast; there are no per-file results to show.
    }
  };

  return { importFiles, response, isImporting: isPending };
};

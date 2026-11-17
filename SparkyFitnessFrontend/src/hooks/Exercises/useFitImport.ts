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

  // Returns true only when every file imported cleanly (no per-file failures).
  // Partial or request-level failures return false so the caller can retain the
  // files for re-import instead of clearing them.
  const importFiles = async (files: File[]): Promise<boolean> => {
    if (files.length === 0) return false;
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
        return true;
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
        return false;
      }
    } catch {
      // Request-level failure (network, size limit, auth) — apiCall already
      // surfaced an error toast; there are no per-file results to show.
      return false;
    }
  };

  return { importFiles, response, isImporting: isPending };
};

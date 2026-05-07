import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useDownloadDiaryExport } from '@/hooks/Diary/useFoodEntries';
import { useToast } from '@/hooks/use-toast';
import { Download, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const DataManagementSettings = () => {
  const { t, i18n } = useTranslation();
  const [delimiter, setDelimiter] = useState<string>(';');
  const { toast } = useToast();
  const { mutateAsync: exportDiary, isPending: isExporting } =
    useDownloadDiaryExport();

  const handleExportDiary = async () => {
    try {
      const blob = await exportDiary({
        delimiter,
        locale: i18n.language,
      });

      // Create a link to download the blob
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'sparkyfitness_diary_export.csv');
      document.body.appendChild(link);
      link.click();

      // Cleanup
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: t('settings.dataManagement.exportSuccess', 'Export successful'),
        description: t(
          'settings.dataManagement.exportSuccessDescription',
          'Your diary has been exported successfully.'
        ),
      });
    } catch (error) {
      console.error('Error exporting diary:', error);
      toast({
        title: t('settings.dataManagement.exportError', 'Export error'),
        description: t(
          'settings.dataManagement.exportErrorDescription',
          'Unable to download your diary. Please try again later.'
        ),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2">
        <h3 className="text-lg font-medium">
          {t('settings.dataManagement.title', 'Data Export')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(
            'settings.dataManagement.description',
            'Download your entire food diary in CSV format. The file will contain all your meals with food details, portions and macros (calories, protein, carbs, fat...).'
          )}
        </p>
        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium">
              {t(
                'settings.dataManagement.delimiterLabel',
                'CSV delimiter format'
              )}
            </label>
            <Select value={delimiter} onValueChange={setDelimiter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue
                  placeholder={t(
                    'settings.dataManagement.delimiterPlaceholder',
                    'Delimiter'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=";">
                  {t('settings.dataManagement.semicolon', 'Semicolon (;)')}
                </SelectItem>
                <SelectItem value=",">
                  {t('settings.dataManagement.comma', 'Comma (,)')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleExportDiary}
            disabled={isExporting}
            className="flex items-center gap-2"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting
              ? t('settings.dataManagement.exporting', 'Preparing...')
              : t(
                  'settings.dataManagement.exportButton',
                  'Export my diary (CSV)'
                )}
          </Button>
        </div>
      </div>
    </div>
  );
};

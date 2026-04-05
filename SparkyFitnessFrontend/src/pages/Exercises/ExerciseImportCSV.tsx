import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Download, Upload, Trash2, Copy } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import {
  requiredHeaders,
  booleanFields,
  dropdownFields,
  dropdownOptions,
  textFields,
  arrayFields,
  DROPDOWN_GUIDES,
} from '@/constants/exercises';
import { useExerciseImport } from '@/hooks/Exercises/useExerciseImport';

export interface ExerciseCSVData {
  id: string;
  name: string;
  [key: string]: string | number | boolean;
}

interface ImportFromCSVProps {
  onSave: (exerciseData: Omit<ExerciseCSVData, 'id'>[]) => Promise<void>;
}

const ImportFromCSV = ({ onSave }: ImportFromCSVProps) => {
  const { t } = useTranslation();

  const {
    loading,
    csvData,
    headers,
    showMapping,
    setShowMapping,
    fileHeaders,
    headerMapping,
    setHeaderMapping,
    fileInputRef,
    handleFileUpload,
    handleDownloadTemplate,
    handleEditCell,
    handleDeleteRow,
    handleAddNewRow,
    clearData,
    handleConfirmMapping,
    handleCancelMapping,
    handleSubmit,
  } = useExerciseImport(onSave);

  const copyToClipboard = (value: string) => {
    navigator.clipboard.writeText(value);
    toast({
      title: t('exercise.exerciseImportCSV.copied', 'Copied!'),
      description: t(
        'exercise.exerciseImportCSV.copiedToClipboard',
        `'${value}' copied.`,
        { value }
      ),
    });
  };

  const renderInputCell = (header: string, row: ExerciseCSVData) => {
    const value = row[header];

    if (booleanFields.has(header)) {
      return (
        <Select
          value={String(value)}
          onValueChange={(val) =>
            handleEditCell(row.id, header, val === 'true')
          }
        >
          <SelectTrigger className="w-full md:w-25">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="true">True</SelectItem>
            <SelectItem value="false">False</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    if (dropdownFields.has(header)) {
      return (
        <Select
          value={String(value)}
          onValueChange={(val) => handleEditCell(row.id, header, val)}
        >
          <SelectTrigger className="w-full md:w-25">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dropdownOptions[header]?.map((opt) => (
              <SelectItem key={opt} value={opt}>
                {opt.charAt(0).toUpperCase() + opt.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (textFields.has(header) || arrayFields.has(header)) {
      return (
        <Input
          type="text"
          value={(value as string) || ''}
          onChange={(e) => handleEditCell(row.id, header, e.target.value)}
          required={header === 'name'}
          className="w-full md:w-40"
        />
      );
    }

    return (
      <Input
        type="number"
        value={(value as number) || 0}
        onChange={(e) =>
          handleEditCell(row.id, header, e.target.valueAsNumber || 0)
        }
        min="0"
        step="any"
        className="w-full md:w-20"
      />
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t(
            'exercise.exerciseImportCSV.importExerciseData',
            'Import Exercise Data'
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-6 p-4 border rounded-lg bg-muted/50">
          <h3 className="text-lg font-semibold mb-2">
            {t(
              'exercise.exerciseImportCSV.standardValuesForDropdowns',
              'Standard Values for Dropdowns'
            )}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t(
              'exercise.exerciseImportCSV.standardValuesDescription',
              'When importing exercises, ensure values match standard options.'
            )}
          </p>
          <div className="grid grid-cols-1 gap-4">
            {DROPDOWN_GUIDES.map(({ key, label, options }) => (
              <div key={key}>
                <h4 className="font-medium mb-1">
                  {t(`exercise.exerciseImportCSV.${key}`, label)}
                </h4>
                <div className="flex flex-wrap gap-2">
                  {options.map((opt) => (
                    <TooltipProvider key={opt}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 flex items-center gap-1"
                            onClick={() => copyToClipboard(opt)}
                          >
                            {opt} <Copy className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {t(
                              'exercise.exerciseImportCSV.copyTooltip',
                              "Copy '{{value}}'",
                              { value: opt }
                            )}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleAddNewRow}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Plus size={16} />{' '}
                {t('exercise.exerciseImportCSV.addRow', 'Add Row')}
              </Button>
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Upload size={16} />{' '}
                {t('exercise.exerciseImportCSV.uploadCSV', 'Upload CSV')}
              </Button>
              <Button
                type="button"
                onClick={handleDownloadTemplate}
                variant="outline"
                className="flex items-center gap-2"
              >
                <Download size={16} />{' '}
                {t(
                  'exercise.exerciseImportCSV.downloadTemplate',
                  'Download Template'
                )}
              </Button>
              {csvData.length > 0 && (
                <Button
                  type="button"
                  onClick={clearData}
                  variant="destructive"
                  className="flex items-center gap-2"
                >
                  <Trash2 size={16} />{' '}
                  {t('exercise.exerciseImportCSV.clearData', 'Clear Data')}
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            {csvData.length > 0 && (
              <div className="text-sm text-green-600">
                {t(
                  'exercise.exerciseImportCSV.loadedRecords',
                  'Successfully loaded {{count}} records.',
                  { count: csvData.length }
                )}
              </div>
            )}
          </div>

          <Dialog open={showMapping} onOpenChange={setShowMapping}>
            <DialogContent
              requireConfirmation
              className="max-w-4xl max-h-[80vh] overflow-y-auto"
            >
              <DialogHeader>
                <DialogTitle>
                  {t(
                    'exercise.exerciseImportCSV.mapHeaders',
                    'Map CSV Headers'
                  )}
                </DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 gap-4">
                {requiredHeaders.map((req) => (
                  <div
                    key={req}
                    className="flex flex-col sm:flex-row sm:items-center gap-2"
                  >
                    <label className="font-medium capitalize">
                      {req.replace(/_/g, ' ')}:
                    </label>
                    <Select
                      value={headerMapping[req] || 'none'}
                      onValueChange={(val) =>
                        setHeaderMapping((prev) => ({
                          ...prev,
                          [req]: val === 'none' ? '' : val,
                        }))
                      }
                    >
                      <SelectTrigger className="w-full sm:w-50">
                        <SelectValue placeholder="Select header" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {fileHeaders.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <Button onClick={handleConfirmMapping}>
                  {t('exercise.exerciseImportCSV.confirmMapping', 'Confirm')}
                </Button>
                <Button variant="outline" onClick={handleCancelMapping}>
                  {t('exercise.exerciseImportCSV.cancel', 'Cancel')}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {csvData.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="hidden md:table-header-group">
                  <tr>
                    {headers.map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left font-medium capitalize"
                      >
                        {h.replace(/_/g, ' ')}
                      </th>
                    ))}
                    <th className="px-4 py-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {csvData.map((row) => (
                    <tr
                      key={row.id}
                      className="block md:table-row mb-4 border rounded-lg md:border-0 md:rounded-none md:border-t hover:bg-muted/50"
                    >
                      {headers.map((h) => (
                        <td
                          key={h}
                          className="block md:table-cell px-4 py-3 md:py-2 border-b md:border-0"
                        >
                          <span className="font-medium capitalize text-muted-foreground md:hidden mb-1 block">
                            {h.replace(/_/g, ' ')}
                          </span>
                          {renderInputCell(h, row)}
                        </td>
                      ))}
                      <td className="block md:table-cell px-4 py-3 md:py-2">
                        <Button
                          type="button"
                          onClick={() => handleDeleteRow(row.id)}
                          variant="destructive"
                          size="sm"
                          className="w-full md:w-auto"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || csvData.length === 0}
            className="w-full flex items-center gap-2"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            ) : (
              <Upload size={16} />
            )}
            {loading
              ? t('exercise.exerciseImportCSV.importing', 'Importing...')
              : t('exercise.exerciseImportCSV.import', 'Import')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ImportFromCSV;

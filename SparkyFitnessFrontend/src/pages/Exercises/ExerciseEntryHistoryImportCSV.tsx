import { useRef } from 'react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from '@/hooks/use-toast';
import { Upload, Download, Loader2, Plus, Trash2, Copy } from 'lucide-react';
import { format } from 'date-fns';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useExerciseHistoryImport } from '@/hooks/Exercises/useExerciseHistoryImport';
import { DATE_FORMATS } from '@/constants/exercises';

interface ExerciseEntryHistoryImportCSVProps {
  onImportComplete: () => void;
}

const ExerciseEntryHistoryImportCSV = ({
  onImportComplete,
}: ExerciseEntryHistoryImportCSVProps) => {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    loading,
    file,
    groupedEntries,
    selectedDateFormat,
    setSelectedDateFormat,
    dropdownOptions,
    handleFileChange,
    handleProcessFile,
    handleImportSubmit,
    handleClearData,
    handleAddNewEntry,
    handleDownloadTemplate,
    getSetDisplay,
    getActivityDetailsDisplay,
  } = useExerciseHistoryImport(fileInputRef, onImportComplete);
  const { dateFormat, weightUnit, distanceUnit } = usePreferences();

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t(
            'exercise.importHistoryCSV.title',
            'Import Historical Exercise Entries'
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4">
          {t(
            'exercise.importHistoryCSV.description',
            "Upload a CSV file containing your historical exercise entries. The system will create new exercises or presets if they don't exist, and import your entries, sets, and activity details."
          )}
        </p>
        <p className="mb-4">
          {t(
            'exercise.importHistoryCSV.customFieldsInfo',
            'Activity Field & Value are custom fields you can add to each exercise entry.'
          )}
        </p>

        <div className="mb-6 p-4 border rounded-lg bg-muted/50">
          <h3 className="text-lg font-semibold mb-2">
            {t(
              'exercise.importHistoryCSV.standardValuesForDropdowns',
              'Standard Values for Exercise Definition Dropdowns'
            )}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t(
              'exercise.importHistoryCSV.standardValuesDescription',
              "When importing exercise definitions, ensure that values for 'Level', 'Force', and 'Mechanic' match these standard options."
            )}
          </p>
          <div className="grid grid-cols-1 gap-4">
            {Object.keys(dropdownOptions).map((field) => (
              <div key={field}>
                <h4 className="font-medium mb-1 capitalize">
                  {field.replace('exercise_', '').replace(/_/g, ' ')}:
                </h4>
                <div className="flex flex-wrap gap-2">
                  {dropdownOptions[field]?.map((value) => (
                    <TooltipProvider key={value}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 flex items-center gap-1"
                            onClick={() => {
                              navigator.clipboard.writeText(value);
                              toast({
                                title: t(
                                  'exercise.importHistoryCSV.copied',
                                  'Copied!'
                                ),
                                description: t(
                                  'exercise.importHistoryCSV.copiedToClipboard',
                                  `'${value}' copied to clipboard.`,
                                  { value }
                                ),
                              });
                            }}
                          >
                            {value} <Copy className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {t(
                              'exercise.importHistoryCSV.copyTooltip',
                              "Copy '{{value}}'",
                              { value }
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

        <p className="mb-4 text-sm text-muted-foreground">
          {t(
            'exercise.importHistoryCSV.unitsHint',
            'Expected units in CSV: Weight: {{weightUnit}}; Distance: {{distanceUnit}}; Duration: Minutes; Rest Time: Seconds; Calories Burned: Calories',
            {
              weightUnit: weightUnit === 'lbs' ? 'Lbs' : 'Kg',
              distanceUnit: distanceUnit === 'miles' ? 'Miles' : 'Km',
            }
          )}
        </p>
        <div className="flex flex-col space-y-4 mb-6">
          <div className="flex items-center space-x-2">
            <Input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="grow"
            />
            <Select
              onValueChange={setSelectedDateFormat}
              value={selectedDateFormat}
            >
              {/* Use value instead of defaultValue for controlled component */}
              <SelectTrigger className="w-52">
                <SelectValue
                  placeholder={t(
                    'exercise.importHistoryCSV.selectDateFormat',
                    'Select Date Format'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((formatOption) => (
                  <SelectItem
                    key={formatOption.value}
                    value={formatOption.value}
                  >
                    {formatOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleProcessFile}
              disabled={loading || !file}
              className="grow"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {t('exercise.importHistoryCSV.processFile', 'Process File')}
            </Button>
            <Button
              onClick={handleDownloadTemplate}
              variant="outline"
              className="grow"
            >
              <Download className="mr-2 h-4 w-4" />
              {t(
                'exercise.importHistoryCSV.downloadTemplate',
                'Download Template'
              )}
            </Button>
            {groupedEntries.length > 0 && (
              <Button
                type="button"
                onClick={handleClearData}
                variant="destructive"
                className="grow"
              >
                <Trash2 size={16} className="mr-2" />
                {t('exercise.importHistoryCSV.clearData', 'Clear Data')}
              </Button>
            )}
            <Button
              type="button"
              onClick={handleAddNewEntry}
              variant="outline"
              className="grow"
            >
              <Plus size={16} className="mr-2" />
              {t('exercise.importHistoryCSV.addEmptyEntry', 'Add Empty Entry')}
            </Button>
          </div>
        </div>

        {groupedEntries.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">
              {t(
                'exercise.importHistoryCSV.preview',
                'Preview of Entries to Import'
              )}
            </h3>
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {t('exercise.importHistoryCSV.table.date', 'Date')}
                    </TableHead>
                    <TableHead>
                      {t(
                        'exercise.importHistoryCSV.table.exercise',
                        'Exercise'
                      )}
                    </TableHead>
                    <TableHead>
                      {t('exercise.importHistoryCSV.table.preset', 'Preset')}
                    </TableHead>
                    <TableHead>
                      {t('exercise.importHistoryCSV.table.sets', 'Sets')}
                    </TableHead>
                    <TableHead>
                      {t(
                        'exercise.importHistoryCSV.table.activityDetails',
                        'Activity Details'
                      )}
                    </TableHead>
                    <TableHead>
                      {t('exercise.importHistoryCSV.table.notes', 'Notes')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        {format(entry.entry_date, dateFormat)}
                      </TableCell>
                      <TableCell>{entry.exercise_name}</TableCell>
                      <TableCell>{entry.preset_name || '-'}</TableCell>
                      <TableCell>{getSetDisplay(entry.sets)}</TableCell>
                      <TableCell>
                        {getActivityDetailsDisplay(entry.activity_details)}
                      </TableCell>
                      <TableCell>{entry.entry_notes || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button
              onClick={handleImportSubmit}
              disabled={loading}
              className="mt-4 w-full"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {t(
                'exercise.importHistoryCSV.confirmImport',
                'Confirm and Import {{count}} Entries',
                { count: groupedEntries.length }
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ExerciseEntryHistoryImportCSV;

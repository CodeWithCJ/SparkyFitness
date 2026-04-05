import { ExerciseCSVData } from '@/pages/Exercises/ExerciseImportCSV';
import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '../use-toast';
import { requiredHeaders } from '@/constants/exercises';
import {
  parseCSV,
  generateUniqueId,
  parseCSVWithMapping,
} from '@/utils/exercises';

export function useExerciseImport(
  onSave: (data: Omit<ExerciseCSVData, 'id'>[]) => Promise<void>
) {
  const { t } = useTranslation();

  const [loading, setLoading] = useState(false);
  const [csvData, setCsvData] = useState<ExerciseCSVData[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [showMapping, setShowMapping] = useState(false);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [headerMapping, setHeaderMapping] = useState<Record<string, string>>(
    {}
  );
  const [rawCsvText, setRawCsvText] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;

      if (!text || text.trim() === '') {
        toast({
          title: t('exercise.exerciseImportCSV.importError', 'Import Error'),
          description: t(
            'exercise.exerciseImportCSV.emptyFile',
            'The selected file is empty.'
          ),
          variant: 'destructive',
        });
        return;
      }

      const lines = text.split('\n');
      const parsedFileHeaders = lines[0]
        ?.split(',')
        .map((h) => h.trim().replace(/^"|"$/g, ''));
      const areHeadersValid =
        requiredHeaders.length === parsedFileHeaders?.length &&
        requiredHeaders.every(
          (value, index) => value === parsedFileHeaders[index]
        );

      if (areHeadersValid) {
        const parsedData = parseCSV(text);
        const header = parsedData[0];
        if (parsedData.length > 0 && header) {
          setHeaders(Object.keys(header).filter((key) => key !== 'id'));
          setCsvData(parsedData);
        } else {
          toast({
            title: t('exercise.exerciseImportCSV.noDataFound', 'No Data Found'),
            description: t(
              'exercise.exerciseImportCSV.noDataFoundDescription',
              'The CSV file contains headers but no data rows.'
            ),
            variant: 'destructive',
          });
        }
      } else {
        const initialMapping: Record<string, string> = {};
        requiredHeaders.forEach((required) => {
          const normalizedRequired = required
            .toLowerCase()
            .replace(/[_ ]/g, '');
          const match = parsedFileHeaders?.find(
            (h) => h.toLowerCase().replace(/[_ ]/g, '') === normalizedRequired
          );
          if (match) initialMapping[required] = match;
        });
        if (parsedFileHeaders) setFileHeaders(parsedFileHeaders);
        setHeaderMapping(initialMapping);
        setRawCsvText(text);
        setShowMapping(true);
        toast({
          title: t(
            'exercise.exerciseImportCSV.headersMapped',
            'Headers Mapped'
          ),
          description: t(
            'exercise.exerciseImportCSV.mapRequiredFields',
            'Your CSV headers do not match the required format. Please map the fields to continue.'
          ),
          variant: 'default',
        });
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const sampleData: Omit<ExerciseCSVData, 'id'>[] = [
      {
        name: 'Push-ups',
        category: 'Strength',
        calories_per_hour: 300,
        description: 'Bodyweight exercise for chest, shoulders, and triceps.',
        force: 'Push',
        level: 'Beginner',
        mechanic: 'Compound',
        equipment: 'Bodyweight',
        primary_muscles: 'Chest, Triceps',
        secondary_muscles: 'Shoulders',
        instructions:
          'Start in plank position; Lower chest to floor; Push back up.',
        images:
          'https://example.com/pushup1.jpg,https://example.com/pushup2.jpg',
        is_custom: true,
        shared_with_public: false,
      },
    ];

    const headerString = requiredHeaders.map((h) => `"${h}"`).join(',');
    const rowsString = sampleData
      .map((row) =>
        requiredHeaders
          .map((header) => {
            const value = row[header as keyof typeof row];
            if (
              typeof value === 'string' &&
              (value.includes(',') ||
                value.includes('"') ||
                value.includes('\n'))
            ) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(',')
      )
      .join('\n');

    const blob = new Blob([`${headerString}\n${rowsString}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'exercise_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleEditCell = (
    id: string,
    field: string,
    value: string | number | boolean
  ) => {
    setCsvData((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleDeleteRow = (id: string) => {
    setCsvData((prev) => prev.filter((row) => row.id !== id));
  };

  const handleAddNewRow = () => {
    const newRow: ExerciseCSVData = {
      id: generateUniqueId(),
      name: '',
      category: '',
      calories_per_hour: 0,
      description: '',
      force: '',
      level: '',
      mechanic: '',
      equipment: '',
      primary_muscles: '',
      secondary_muscles: '',
      instructions: '',
      images: '',
      is_custom: true,
      shared_with_public: false,
    };
    if (headers.length === 0) setHeaders(requiredHeaders);
    setCsvData((prev) => [...prev, newRow]);
  };

  const clearData = () => {
    setCsvData([]);
    setHeaders([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleConfirmMapping = () => {
    const unmapped = requiredHeaders.filter((header) => !headerMapping[header]);
    if (unmapped.length > 0) {
      const confirmed = window.confirm(
        `Some required headers are not mapped. Unmapped fields will be empty: ${unmapped.join(', ')}. Continue?`
      );
      if (!confirmed) return;
    }
    parseWithMapping();
  };

  const parseWithMapping = () => {
    const parsedData = parseCSVWithMapping(rawCsvText, headerMapping);
    const header = parsedData[0];
    if (parsedData.length > 0 && header) {
      setHeaders(Object.keys(header).filter((key) => key !== 'id'));
      setCsvData(parsedData);
      setShowMapping(false);
      toast({
        title: t(
          'exercise.exerciseImportCSV.parseSuccessful',
          'Parse Successful'
        ),
        description: t(
          'exercise.exerciseImportCSV.dataParsedSuccessfully',
          'CSV data has been parsed and loaded successfully.'
        ),
      });
    } else {
      toast({
        title: t('exercise.exerciseImportCSV.noDataFound', 'No Data Found'),
        variant: 'destructive',
      });
    }
  };

  const handleCancelMapping = () => {
    setShowMapping(false);
    setFileHeaders([]);
    setHeaderMapping({});
    setRawCsvText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (csvData.some((row) => !row.name || String(row.name).trim() === '')) {
      toast({
        title: t(
          'exercise.exerciseImportCSV.validationError',
          'Validation Error'
        ),
        description: t(
          'exercise.exerciseImportCSV.nameEmptyError',
          "The 'name' field cannot be empty."
        ),
        variant: 'destructive',
      });
      return;
    }
    setLoading(true);
    try {
      await onSave(csvData.map(({ id, ...rest }) => rest));
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return {
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
  };
}

import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { format, parseISO, subDays } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import { usePreferences } from '@/contexts/PreferencesContext';
import {
  getMostRecentMeasurement,
  type CombinedMeasurement,
  type CheckInMeasurement,
} from '@/api/CheckIn/checkInService';
import {
  calculateBodyFatBmi,
  calculateBodyFatNavy,
} from '@/services/bodyCompositionService';
import { userManagementService } from '@/api/Admin/userManagementService';
import {
  useCustomCategories,
  useDeleteCustomMeasurementMutation,
  useExistingCheckInMeasurements,
  useExistingCustomMeasurements,
  useRecentCustomMeasurements,
  useRecentStandardMeasurements,
  useSaveCheckInMeasurementsMutation,
  useSaveCustomMeasurementMutation,
  useUpdateCheckInMeasurementFieldMutation,
} from '@/hooks/CheckIn/useCheckIn';
import {
  useMoodEntryByDate,
  useSaveMoodEntryMutation,
} from '@/hooks/CheckIn/useMood';
import { useFastingHistory } from '@/hooks/Fasting/useFasting';
import type { CustomMeasurement } from '@/api/CheckIn/checkInService';

export const useCheckInLogic = (currentUserId: string | undefined) => {
  const { t } = useTranslation();
  const {
    weightUnit: defaultWeightUnit,
    measurementUnit: defaultMeasurementUnit,
    formatDateInUserTimezone,
    convertWeight,
    convertMeasurement,
    bodyFatAlgorithm,
  } = usePreferences();

  const [selectedDate, setSelectedDate] = useState(
    formatDateInUserTimezone(new Date(), 'yyyy-MM-dd')
  );

  const { mutateAsync: saveCheckInMeasurements } =
    useSaveCheckInMeasurementsMutation();
  const { mutateAsync: saveCustomMeasurement } =
    useSaveCustomMeasurementMutation();
  const { mutateAsync: deleteCustomMeasurement } =
    useDeleteCustomMeasurementMutation();
  const { mutateAsync: updateCheckInMeasurementField } =
    useUpdateCheckInMeasurementFieldMutation();
  const { mutateAsync: saveMoodEntry } = useSaveMoodEntryMutation();

  const { data: customCategories = [] } = useCustomCategories();
  const { data: existingCheckIn, isSuccess: checkInSuccess } =
    useExistingCheckInMeasurements(selectedDate);
  const { data: existingCustom, isSuccess: customSuccess } =
    useExistingCustomMeasurements(selectedDate);
  const { data: existingMood, isSuccess: moodSuccess } =
    useMoodEntryByDate(selectedDate);

  const { data: recentCustom = [] } = useRecentCustomMeasurements();
  const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const endDate = format(new Date(), 'yyyy-MM-dd');
  const { data: recentStandard = [] } = useRecentStandardMeasurements(
    startDate,
    endDate
  );
  const { data: recentFasting = [] } = useFastingHistory(10, 0);

  const [weight, setWeight] = useState('');
  const [neck, setNeck] = useState('');
  const [waist, setWaist] = useState('');
  const [hips, setHips] = useState('');
  const [steps, setSteps] = useState('');
  const [height, setHeight] = useState('');
  const [bodyFatPercentage, setBodyFatPercentage] = useState('');
  const [mood, setMood] = useState<number>(50);
  const [moodNotes, setMoodNotes] = useState<string>('');
  const [customValues, setCustomValues] = useState<{ [key: string]: string }>(
    {}
  );
  const [customNotes, setCustomNotes] = useState<{ [key: string]: string }>({});
  const [useMostRecentForCalculation, setUseMostRecentForCalculation] =
    useState(false);
  const [loading, setLoading] = useState(false);

  const shouldConvertCustomMeasurement = (unit: string) => {
    const convertibleUnits = ['kg', 'lbs', 'cm', 'inches'];
    return convertibleUnits.includes(unit.toLowerCase());
  };

  // 1. Sync Existing CheckIn
  useEffect(() => {
    if (checkInSuccess) {
      if (existingCheckIn) {
        const convertedWeight =
          existingCheckIn.weight !== undefined &&
          existingCheckIn.weight !== null
            ? convertWeight(existingCheckIn.weight, 'kg', defaultWeightUnit)
            : NaN;
        setWeight(
          typeof convertedWeight === 'number' && !isNaN(convertedWeight)
            ? convertedWeight.toFixed(1)
            : ''
        );

        const convertedNeck =
          existingCheckIn.neck !== undefined && existingCheckIn.neck !== null
            ? convertMeasurement(
                existingCheckIn.neck,
                'cm',
                defaultMeasurementUnit
              )
            : NaN;
        setNeck(
          typeof convertedNeck === 'number' && !isNaN(convertedNeck)
            ? convertedNeck.toFixed(1)
            : ''
        );

        const convertedWaist =
          existingCheckIn.waist !== undefined && existingCheckIn.waist !== null
            ? convertMeasurement(
                existingCheckIn.waist,
                'cm',
                defaultMeasurementUnit
              )
            : NaN;
        setWaist(
          typeof convertedWaist === 'number' && !isNaN(convertedWaist)
            ? convertedWaist.toFixed(1)
            : ''
        );

        const convertedHips =
          existingCheckIn.hips !== undefined && existingCheckIn.hips !== null
            ? convertMeasurement(
                existingCheckIn.hips,
                'cm',
                defaultMeasurementUnit
              )
            : NaN;
        setHips(
          typeof convertedHips === 'number' && !isNaN(convertedHips)
            ? convertedHips.toFixed(1)
            : ''
        );

        const convertedHeight =
          existingCheckIn.height !== undefined &&
          existingCheckIn.height !== null
            ? convertMeasurement(
                existingCheckIn.height,
                'cm',
                defaultMeasurementUnit
              )
            : NaN;
        setHeight(
          typeof convertedHeight === 'number' && !isNaN(convertedHeight)
            ? convertedHeight.toFixed(1)
            : ''
        );

        setBodyFatPercentage(
          existingCheckIn.body_fat_percentage?.toString() || ''
        );
        setSteps(existingCheckIn.steps?.toString() || '');
      } else {
        setWeight('');
        setNeck('');
        setWaist('');
        setHips('');
        setSteps('');
        setHeight('');
        setBodyFatPercentage('');
      }
    }
  }, [
    existingCheckIn,
    checkInSuccess,
    convertWeight,
    defaultWeightUnit,
    convertMeasurement,
    defaultMeasurementUnit,
  ]);

  // 2. Sync Mood
  useEffect(() => {
    if (moodSuccess) {
      if (existingMood) {
        setMood(existingMood.mood_value);
        setMoodNotes(existingMood.notes || '');
      } else {
        setMood(50);
        setMoodNotes('');
      }
    }
  }, [existingMood, moodSuccess]);

  // 3. Sync Custom Measurements
  useEffect(() => {
    if (customSuccess && customCategories.length > 0) {
      if (existingCustom && existingCustom.length > 0) {
        const newCustomValues: { [key: string]: string } = {};
        const newCustomNotes: { [key: string]: string } = {};

        existingCustom.forEach((measurement: CustomMeasurement) => {
          const category = customCategories.find(
            (c) => c.id === measurement.category_id
          );
          if (category && category.frequency !== 'Unlimited') {
            const isConvertible = shouldConvertCustomMeasurement(
              category.measurement_type
            );
            if (category.data_type === 'numeric') {
              newCustomValues[measurement.category_id] = isConvertible
                ? (() => {
                    const converted = convertMeasurement(
                      Number(measurement.value),
                      'cm',
                      defaultMeasurementUnit
                    );
                    return typeof converted === 'number' && !isNaN(converted)
                      ? converted.toFixed(1)
                      : '';
                  })()
                : measurement.value !== null && measurement.value !== undefined
                  ? measurement.value.toString()
                  : '';
            } else {
              newCustomValues[measurement.category_id] =
                measurement.value.toString() || '';
            }
            newCustomNotes[measurement.category_id] = measurement.notes || '';
          }
        });
        setCustomValues(newCustomValues);
        setCustomNotes(newCustomNotes);
      } else {
        setCustomValues({});
        setCustomNotes({});
      }
    }
  }, [
    existingCustom,
    customSuccess,
    customCategories,
    convertMeasurement,
    defaultMeasurementUnit,
  ]);

  const recentMeasurements = useMemo(() => {
    const allMeasurements: CombinedMeasurement[] = [];

    recentCustom.forEach((m) => {
      allMeasurements.push({
        id: m.id,
        entry_date: m.entry_date,
        entry_hour: m.entry_hour,
        entry_timestamp: m.entry_timestamp,
        value: m.value,
        type: 'custom',
        display_name:
          m.custom_categories.display_name || m.custom_categories.name,
        display_unit: m.custom_categories.measurement_type,
        custom_categories: m.custom_categories,
      });
    });

    recentStandard.forEach((s) => {
      if (s.weight !== null)
        allMeasurements.push({
          id: `${s.id}-weight`,
          originalId: s.id,
          entry_date: s.entry_date,
          value: s.weight,
          type: 'standard',
          display_name: 'Weight',
          display_unit: defaultWeightUnit,
          entry_hour: null,
          entry_timestamp: s.updated_at,
        });
      if (s.neck !== null)
        allMeasurements.push({
          id: `${s.id}-neck`,
          originalId: s.id,
          entry_date: s.entry_date,
          value: s.neck,
          type: 'standard',
          display_name: 'Neck',
          display_unit: defaultMeasurementUnit,
          entry_hour: null,
          entry_timestamp: s.updated_at,
        });
      if (s.waist !== null)
        allMeasurements.push({
          id: `${s.id}-waist`,
          originalId: s.id,
          entry_date: s.entry_date,
          value: s.waist,
          type: 'standard',
          display_name: 'Waist',
          display_unit: defaultMeasurementUnit,
          entry_hour: null,
          entry_timestamp: s.updated_at,
        });
      if (s.hips !== null)
        allMeasurements.push({
          id: `${s.id}-hips`,
          originalId: s.id,
          entry_date: s.entry_date,
          value: s.hips,
          type: 'standard',
          display_name: 'Hips',
          display_unit: defaultMeasurementUnit,
          entry_hour: null,
          entry_timestamp: s.updated_at,
        });
      if (s.steps !== null)
        allMeasurements.push({
          id: `${s.id}-steps`,
          originalId: s.id,
          entry_date: s.entry_date,
          value: s.steps,
          type: 'standard',
          display_name: 'Steps',
          display_unit: 'steps',
          entry_hour: null,
          entry_timestamp: s.updated_at,
        });
      if (s.height !== null)
        allMeasurements.push({
          id: `${s.id}-height`,
          originalId: s.id,
          entry_date: s.entry_date,
          value: s.height,
          type: 'standard',
          display_name: 'Height',
          display_unit: defaultMeasurementUnit,
          entry_hour: null,
          entry_timestamp: s.updated_at,
        });
      if (s.body_fat_percentage !== null)
        allMeasurements.push({
          id: `${s.id}-bf`,
          originalId: s.id,
          entry_date: s.entry_date,
          value: s.body_fat_percentage,
          type: 'standard',
          display_name: 'Body Fat %',
          display_unit: '%',
          entry_hour: null,
          entry_timestamp: s.updated_at,
        });
    });

    recentFasting.forEach((fast) => {
      allMeasurements.push({
        id: `fast-${fast.id}`,
        originalId: fast.id,
        entry_date: formatDateInUserTimezone(
          parseISO(fast.end_time || fast.start_time),
          'yyyy-MM-dd'
        ),
        entry_hour: parseISO(fast.end_time || fast.start_time).getHours(),
        entry_timestamp: fast.end_time || fast.start_time,
        value: fast.duration_minutes || 0,
        type: 'fasting',
        display_name: 'Fasting',
        display_unit: 'min',
        fasting_type: fast.fasting_type,
        duration_minutes: fast.duration_minutes || 0,
      });
    });

    allMeasurements.sort((a, b) => {
      return (
        new Date(b.entry_timestamp).getTime() -
        new Date(a.entry_timestamp).getTime()
      );
    });

    return allMeasurements.slice(0, 20);
  }, [
    recentCustom,
    recentStandard,
    recentFasting,
    defaultWeightUnit,
    defaultMeasurementUnit,
    formatDateInUserTimezone,
  ]);

  const handleDeleteMeasurementClick = async (
    measurement: CombinedMeasurement
  ) => {
    if (!currentUserId) return;

    if (measurement.type === 'custom') {
      await deleteCustomMeasurement(measurement.id);
    } else if (measurement.type === 'standard') {
      const standardId = measurement.originalId || measurement.id;
      let fieldToNull: string;

      switch (measurement.display_name) {
        case 'Weight':
          fieldToNull = 'weight';
          break;
        case 'Neck':
          fieldToNull = 'neck';
          break;
        case 'Waist':
          fieldToNull = 'waist';
          break;
        case 'Hips':
          fieldToNull = 'hips';
          break;
        case 'Steps':
          fieldToNull = 'steps';
          break;
        case 'Height':
          fieldToNull = 'height';
          break;
        case 'Body Fat %':
          fieldToNull = 'body_fat_percentage';
          break;
        default:
          return;
      }
      await updateCheckInMeasurementField({
        id: standardId,
        field: fieldToNull,
        value: null,
        entry_date: measurement.entry_date,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUserId) return;
    setLoading(true);

    try {
      const moodToSend = mood ?? 50;

      await saveMoodEntry({
        moodValue: moodToSend,
        notes: moodNotes,
        entryDate: selectedDate,
      });

      const measurementData: Partial<CheckInMeasurement> = {
        entry_date: selectedDate,
      };

      if (weight) {
        measurementData.weight = convertWeight(
          parseFloat(weight),
          defaultWeightUnit,
          'kg'
        );
      }
      if (neck) {
        measurementData.neck = convertMeasurement(
          parseFloat(neck),
          defaultMeasurementUnit,
          'cm'
        );
      }
      if (waist) {
        measurementData.waist = convertMeasurement(
          parseFloat(waist),
          defaultMeasurementUnit,
          'cm'
        );
      }
      if (hips) {
        measurementData.hips = convertMeasurement(
          parseFloat(hips),
          defaultMeasurementUnit,
          'cm'
        );
      }
      if (steps) {
        measurementData.steps = parseInt(steps);
      }
      if (height) {
        measurementData.height = convertMeasurement(
          parseFloat(height),
          defaultMeasurementUnit,
          'cm'
        );
      }
      if (bodyFatPercentage) {
        measurementData.body_fat_percentage = parseFloat(bodyFatPercentage);
      }

      await saveCheckInMeasurements(measurementData);

      const currentTime = new Date();
      const currentHour = currentTime.getHours();
      const currentTimestamp = currentTime.toISOString();

      const hourlyDateTime = new Date(currentTime);
      hourlyDateTime.setHours(currentHour, 0, 0, 0);
      const hourlyTimestamp = hourlyDateTime.toISOString();

      const categoryMap = new Map(customCategories.map((c) => [c.id, c]));

      const savePromises = Object.entries(customValues).map(
        async ([categoryId, inputValue]) => {
          const category = categoryMap.get(categoryId);

          if (!category) return;
          if (!inputValue && !customNotes[categoryId]) return;

          const isHourly = category.frequency === 'Hourly';

          const customMeasurementData: Partial<CustomMeasurement> = {
            category_id: categoryId,
            notes: customNotes[categoryId] || '',
            entry_date: selectedDate,
            entry_hour: isHourly ? currentHour : null,
            entry_timestamp: isHourly ? hourlyTimestamp : currentTimestamp,
          };

          if (category.data_type === 'numeric') {
            const numericValue = parseFloat(inputValue);
            if (!isNaN(numericValue)) {
              const isConvertible = shouldConvertCustomMeasurement(
                category.measurement_type
              );
              customMeasurementData.value = isConvertible
                ? convertMeasurement(numericValue, defaultMeasurementUnit, 'cm')
                : numericValue;
            }
          } else {
            customMeasurementData.value = inputValue;
          }

          return saveCustomMeasurement(customMeasurementData);
        }
      );

      await Promise.all(savePromises);
    } finally {
      setLoading(false);
    }
  };

  const handleCalculateBodyFat = async () => {
    if (!currentUserId) return;

    try {
      const userProfile =
        await userManagementService.getUserProfile(currentUserId);

      if (!userProfile) {
        toast({
          title: t('common.error', 'Error'),
          description: t(
            'checkIn.couldNotLoadUserProfileOrPrefs',
            'Could not load user profile or preferences for calculation.'
          ),
          variant: 'destructive',
        });
        return;
      }

      const age = userProfile.date_of_birth
        ? new Date().getFullYear() -
          new Date(userProfile.date_of_birth).getFullYear()
        : 0;
      const gender = userProfile.gender;

      let weightKg: number;
      let heightCm: number;
      let waistCm: number;
      let neckCm: number;
      let hipsCm: number;

      if (useMostRecentForCalculation) {
        const [
          recentWeight,
          recentHeight,
          recentWaist,
          recentNeck,
          recentHips,
        ] = await Promise.all([
          getMostRecentMeasurement('weight'),
          getMostRecentMeasurement('height'),
          getMostRecentMeasurement('waist'),
          getMostRecentMeasurement('neck'),
          getMostRecentMeasurement('hips'),
        ]);

        weightKg =
          recentWeight?.weight ??
          convertWeight(parseFloat(weight), defaultWeightUnit, 'kg');
        heightCm =
          recentHeight?.height ??
          convertMeasurement(parseFloat(height), defaultMeasurementUnit, 'cm');
        waistCm =
          recentWaist?.waist ??
          convertMeasurement(parseFloat(waist), defaultMeasurementUnit, 'cm');
        neckCm =
          recentNeck?.neck ??
          convertMeasurement(parseFloat(neck), defaultMeasurementUnit, 'cm');
        hipsCm =
          recentHips?.hips ??
          convertMeasurement(parseFloat(hips), defaultMeasurementUnit, 'cm');
      } else {
        weightKg = convertWeight(parseFloat(weight), defaultWeightUnit, 'kg');
        heightCm = convertMeasurement(
          parseFloat(height),
          defaultMeasurementUnit,
          'cm'
        );
        waistCm = convertMeasurement(
          parseFloat(waist),
          defaultMeasurementUnit,
          'cm'
        );
        neckCm = convertMeasurement(
          parseFloat(neck),
          defaultMeasurementUnit,
          'cm'
        );
        hipsCm = convertMeasurement(
          parseFloat(hips),
          defaultMeasurementUnit,
          'cm'
        );
      }

      let bfp = 0;
      let errorMessage = '';

      if (bodyFatAlgorithm === 'BMI Method') {
        if (isNaN(weightKg) || isNaN(heightCm) || age === 0 || !gender) {
          errorMessage = t(
            'checkIn.bmiMethodRequiredFields',
            'Weight, height, age, and gender are required for BMI Method.'
          );
        } else {
          bfp = calculateBodyFatBmi(weightKg, heightCm, age, gender);
        }
      } else {
        if (
          !gender ||
          isNaN(heightCm) ||
          isNaN(waistCm) ||
          isNaN(neckCm) ||
          (gender === 'female' && isNaN(hipsCm))
        ) {
          errorMessage = t(
            'checkIn.usNavyMethodRequiredFields',
            'Gender, height, waist, neck, and (if female) hips measurements are required for U.S. Navy Method.'
          );
        } else {
          bfp = calculateBodyFatNavy(gender, heightCm, waistCm, neckCm, hipsCm);
        }
      }

      if (errorMessage) {
        toast({
          title: t('common.error', 'Error'),
          description: `${t('checkIn.failedToCalculateBodyFat', 'Failed to calculate body fat:')} ${errorMessage}`,
          variant: 'destructive',
        });
      } else {
        setBodyFatPercentage(bfp.toFixed(2));
        toast({
          title: t('common.success', 'Success'),
          description: t(
            'checkIn.bodyFatCalculated',
            'Body fat percentage calculated.'
          ),
        });
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      toast({
        title: t('common.error', 'Error'),
        description: `${t('checkIn.failedToCalculateBodyFat', 'Failed to calculate body fat:')} ${errorMsg}`,
        variant: 'destructive',
      });
    }
  };

  return {
    bodyFatPercentage,
    customCategories,
    customNotes,
    customValues,
    handleCalculateBodyFat,
    handleDeleteMeasurementClick,
    handleSubmit,
    height,
    hips,
    loading,
    mood,
    moodNotes,
    neck,
    recentMeasurements,
    selectedDate,
    setBodyFatPercentage,
    setCustomNotes,
    setCustomValues,
    setHeight,
    setHips,
    setMood,
    setMoodNotes,
    setNeck,
    setSelectedDate,
    setSteps,
    setUseMostRecentForCalculation,
    setWaist,
    setWeight,
    shouldConvertCustomMeasurement,
    steps,
    useMostRecentForCalculation,
    waist,
    weight,
  };
};

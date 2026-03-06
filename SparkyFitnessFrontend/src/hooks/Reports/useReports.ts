import { fetchCustomEntries } from '@/api/CheckIn/checkInService';
import { checkInKeys } from '@/api/keys/checkin';
import { reportKeys } from '@/api/keys/reports';
import {
  getExerciseDashboardData,
  loadReportsData,
} from '@/api/Reports/reportsService';
import { parseStressMeasurement } from '@/utils/reportUtil';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useCustomCategories } from '../CheckIn/useCheckIn';
import { MeasurementUnit, WeightUnit } from '@/contexts/PreferencesContext';

export const useRawStressData = (userId?: string | null) => {
  const { data: categories } = useCustomCategories(userId);
  const { t } = useTranslation();
  const categoryId = categories?.find(
    (cat) => cat.name === 'Raw Stress Data'
  )?.id;

  return useQuery({
    queryKey: checkInKeys.rawStressData(userId!, categoryId!),
    queryFn: async () => {
      const customMeasurements = await fetchCustomEntries(
        categoryId as string,
        userId!
      );
      let allStressDataPoints: ReturnType<typeof parseStressMeasurement> = [];

      customMeasurements.forEach((measurement: { value: string | number }) => {
        const parsedPoints = parseStressMeasurement(measurement.value);
        if (parsedPoints.length === 0)
          console.error('Error parsing stress values.');
        allStressDataPoints = allStressDataPoints.concat(parsedPoints);
      });

      return allStressDataPoints;
    },
    enabled: !!categoryId && !!userId,
    meta: {
      errorMessage: t(
        'reports.failedToLoadStress',
        'Failed to load stress data.'
      ),
    },
  });
};

export const useReportsData = (
  startDate: string,
  endDate: string,
  userId: string | null,
  converters: {
    convertWeight: (val: number, from: WeightUnit, to: WeightUnit) => number;
    convertMeasurement: (
      val: number,
      from: MeasurementUnit,
      to: MeasurementUnit
    ) => number;
    defaultWeightUnit: WeightUnit;
    defaultMeasurementUnit: MeasurementUnit;
  }
) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: reportKeys.core(startDate, endDate, userId!),
    queryFn: () => loadReportsData(startDate, endDate, userId!),
    enabled: Boolean(startDate && endDate) && !!userId,
    select: (data) => ({
      ...data,
      measurementData: data.measurementData.map((m) => ({
        ...m,
        weight: m.weight
          ? converters.convertWeight(
              m.weight,
              'kg',
              converters.defaultWeightUnit
            )
          : 0,
        neck: m.neck
          ? converters.convertMeasurement(
              m.neck,
              'cm',
              converters.defaultMeasurementUnit
            )
          : 0,
        waist: m.waist
          ? converters.convertMeasurement(
              m.waist,
              'cm',
              converters.defaultMeasurementUnit
            )
          : 0,
        hips: m.hips
          ? converters.convertMeasurement(
              m.hips,
              'cm',
              converters.defaultMeasurementUnit
            )
          : 0,
        height: m.height
          ? converters.convertMeasurement(
              m.height,
              'cm',
              converters.defaultMeasurementUnit
            )
          : 0,
      })),
    }),
    meta: {
      errorMessage: t(
        'reports.failedToLoadCoreData',
        'Failed to load core reports data.'
      ),
    },
  });
};

export const useExerciseDashboardData = (
  startDate: string,
  endDate: string,
  userId?: string | null,
  equipment: string | null = null,
  muscle: string | null = null,
  exercise: string | null = null
) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: reportKeys.exerciseDashboard(
      startDate,
      endDate,
      userId!,
      equipment,
      muscle,
      exercise
    ),
    queryFn: () =>
      getExerciseDashboardData(
        startDate,
        endDate,
        userId!,
        equipment,
        muscle,
        exercise
      ),
    enabled: Boolean(startDate && endDate) && !!userId,
    meta: {
      errorMessage: t(
        'reports.failedToLoadExerciseDashboard',
        'Failed to load exercise dashboard data.'
      ),
    },
  });
};

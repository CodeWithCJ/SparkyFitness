import { useQueryClient, useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import {
  loadCustomCategories,
  fetchRecentCustomMeasurements,
  fetchRecentStandardMeasurements,
  deleteCustomMeasurement,
  updateCheckInMeasurementField,
  loadExistingCheckInMeasurements,
  loadExistingCustomMeasurements,
  saveCheckInMeasurements,
  saveCustomMeasurement,
  getMostRecentMeasurement,
} from '@/api/CheckIn/checkInService';
import { checkInKeys } from '@/api/keys/checkin';

export const useCustomCategories = () => {
  return useQuery({
    queryKey: checkInKeys.customCategories(),
    queryFn: loadCustomCategories,
    meta: {
      errorMessage: i18n.t(
        'checkIn.failedToLoadCategories',
        'Failed to load custom categories.'
      ),
    },
  });
};

export const useRecentCustomMeasurements = () => {
  return useQuery({
    queryKey: checkInKeys.recentCustom(),
    queryFn: fetchRecentCustomMeasurements,
    meta: {
      errorMessage: i18n.t(
        'checkIn.failedToLoadRecentCustom',
        'Failed to load recent custom measurements.'
      ),
    },
  });
};

export const useRecentStandardMeasurements = (
  startDate: string,
  endDate: string
) => {
  return useQuery({
    queryKey: checkInKeys.recentStandard(startDate, endDate),
    queryFn: () => fetchRecentStandardMeasurements(startDate, endDate),
    meta: {
      errorMessage: i18n.t(
        'checkIn.failedToLoadRecentStandard',
        'Failed to load recent standard measurements.'
      ),
    },
  });
};

export const useExistingCheckInMeasurements = (date: string) => {
  return useQuery({
    queryKey: checkInKeys.existingCheckIn(date),
    queryFn: () => loadExistingCheckInMeasurements(date),
    meta: {
      errorMessage: i18n.t(
        'checkIn.failedToLoadExistingCheckIn',
        'Failed to load existing check-in data.'
      ),
    },
  });
};

export const useExistingCustomMeasurements = (date: string) => {
  return useQuery({
    queryKey: checkInKeys.existingCustom(date),
    queryFn: () => loadExistingCustomMeasurements(date),
    meta: {
      errorMessage: i18n.t(
        'checkIn.failedToLoadExistingCustom',
        'Failed to load existing custom measurements.'
      ),
    },
  });
};

export const useMostRecentMeasurement = (type: string) => {
  return useQuery({
    queryKey: checkInKeys.mostRecent(type),
    queryFn: () => getMostRecentMeasurement(type),
    meta: {
      errorMessage: i18n.t(
        'checkIn.failedToLoadMostRecent',
        'Failed to load most recent measurement.'
      ),
    },
  });
};

export const useDeleteCustomMeasurementMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: (id: string) => deleteCustomMeasurement(id),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: checkInKeys.all });
    },
    meta: {
      errorMessage: t(
        'checkIn.failedToDeleteMeasurement',
        'Failed to delete measurement.'
      ),
      successMessage: t(
        'checkIn.measurementDeletedSuccessfully',
        'Measurement deleted successfully.'
      ),
    },
  });
};

export const useUpdateCheckInMeasurementFieldMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: updateCheckInMeasurementField,
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: checkInKeys.all });
    },
    meta: {
      errorMessage: t(
        'checkIn.failedToUpdateMeasurement',
        'Failed to update measurement.'
      ),
      successMessage: t(
        'checkIn.measurementUpdatedSuccessfully',
        'Measurement updated successfully.'
      ),
    },
  });
};

export const useSaveCheckInMeasurementsMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: saveCheckInMeasurements,
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: checkInKeys.all });
    },
    meta: {
      errorMessage: t(
        'checkIn.failedToSaveCheckIn',
        'Failed to save check-in data.'
      ),
      successMessage: t(
        'checkIn.checkInSavedSuccessfully',
        'Check-in data saved successfully!'
      ),
    },
  });
};

export const useSaveCustomMeasurementMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: saveCustomMeasurement,
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: checkInKeys.all });
    },
    meta: {
      errorMessage: t(
        'checkIn.failedToSaveCustomMeasurement',
        'Failed to save custom measurement.'
      ),
    },
  });
};

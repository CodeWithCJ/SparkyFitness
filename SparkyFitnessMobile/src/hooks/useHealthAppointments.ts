import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  listAppointments,
  createAppointment,
  updateAppointment,
  deleteAppointment,
} from '../services/api/pregnancyApi';
import { pregnancyAppointmentsQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';
import type { HealthAppointment } from '../types/womensHealth';

export function useHealthAppointments(upcoming?: boolean) {
  const query = useQuery<HealthAppointment[]>({
    queryKey: [...pregnancyAppointmentsQueryKey, upcoming ?? false],
    queryFn: () => listAppointments(upcoming) as Promise<HealthAppointment[]>,
  });

  useRefetchOnFocus(query.refetch);

  return {
    appointments: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useHealthAppointmentMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: pregnancyAppointmentsQueryKey });
  };

  const createMutation = useMutation({
    mutationFn: (body: {
      scheduled_at: string;
      appointment_type?: string;
      title?: string;
      location?: string;
      notes?: string;
    }) => createAppointment(body),
    onSuccess: invalidate,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      updateAppointment(id, body),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAppointment(id),
    onSuccess: invalidate,
  });

  return {
    createAsync: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    updateAsync: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    deleteAsync: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as pregnancyService from '@/api/Pregnancy/pregnancyService';
import type { SharedPregnancy } from '@workspace/shared';
export type {
  BumpPhoto,
  PregnancyVitals,
} from '@/api/Pregnancy/pregnancyService';

export const pregnancyKeys = {
  current: () => ['pregnancy-current'] as const,
  overview: (date?: string) => ['pregnancy-overview', date ?? 'today'] as const,
  kicks: () => ['pregnancy-kicks'] as const,
  contractions: () => ['pregnancy-contractions'] as const,
  checklist: (id: string) => ['pregnancy-checklist', id] as const,
  appointments: () => ['health-appointments'] as const,
};

export const useAppointments = (upcoming?: boolean) =>
  useQuery({
    queryKey: [...pregnancyKeys.appointments(), upcoming ?? false],
    queryFn: () => pregnancyService.listAppointments(upcoming),
    meta: { errorMessage: 'Failed to load appointments.' },
  });

export const useCreateAppointmentMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      pregnancyService.createAppointment(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pregnancyKeys.appointments() });
      queryClient.invalidateQueries({ queryKey: ['pregnancy-overview'] });
    },
    meta: {
      errorMessage: 'Could not save appointment.',
      successMessage: 'Appointment saved.',
    },
  });
};

export const useDeleteAppointmentMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pregnancyService.deleteAppointment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pregnancyKeys.appointments() });
      queryClient.invalidateQueries({ queryKey: ['pregnancy-overview'] });
    },
    meta: { errorMessage: 'Could not delete appointment.' },
  });
};

export const usePregnancyOverview = (date?: string) =>
  useQuery({
    queryKey: pregnancyKeys.overview(date),
    queryFn: () => pregnancyService.getOverview(date),
    meta: { errorMessage: 'Failed to load pregnancy overview.' },
  });

export const useKickSessions = () =>
  useQuery({
    queryKey: pregnancyKeys.kicks(),
    queryFn: () => pregnancyService.listKickSessions(),
    meta: { errorMessage: 'Failed to load kick sessions.' },
  });

export const useContractions = (enabled = true) =>
  useQuery({
    queryKey: pregnancyKeys.contractions(),
    queryFn: () => pregnancyService.getContractions(),
    refetchInterval: enabled ? 15000 : false,
    meta: { errorMessage: 'Failed to load contractions.' },
  });

export const useCreatePregnancyMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<SharedPregnancy>) =>
      pregnancyService.createPregnancy(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pregnancy-overview'] });
      queryClient.invalidateQueries({ queryKey: pregnancyKeys.current() });
      queryClient.invalidateQueries({ queryKey: ['cycle-settings'] });
    },
    meta: {
      errorMessage: 'Could not start pregnancy tracking.',
      successMessage: 'Pregnancy tracking started.',
    },
  });
};

export const useUpdatePregnancyMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: Partial<SharedPregnancy>;
    }) => pregnancyService.updatePregnancy(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pregnancy-overview'] });
      queryClient.invalidateQueries({ queryKey: pregnancyKeys.current() });
    },
    meta: { errorMessage: 'Could not update pregnancy.' },
  });
};

export const useStartKickMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (pregnancyId: string) =>
      pregnancyService.startKickSession(pregnancyId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: pregnancyKeys.kicks() }),
    meta: { errorMessage: 'Could not start kick session.' },
  });
};

export const useUpdateKickMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { kick_count?: number; kick_times?: string[]; ended?: boolean };
    }) => pregnancyService.updateKickSession(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: pregnancyKeys.kicks() });
      queryClient.invalidateQueries({ queryKey: ['pregnancy-overview'] });
    },
    meta: { errorMessage: 'Could not update kick session.' },
  });
};

export const useCreateContractionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      pregnancyId,
      startedAt,
    }: {
      pregnancyId: string;
      startedAt?: string;
    }) => pregnancyService.createContraction(pregnancyId, startedAt),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: pregnancyKeys.contractions() }),
    meta: { errorMessage: 'Could not log contraction.' },
  });
};

export const useUpdateContractionMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { ended_at?: string | null; intensity?: number | null };
    }) => pregnancyService.updateContraction(id, body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: pregnancyKeys.contractions() }),
    meta: { errorMessage: 'Could not update contraction.' },
  });
};

export const usePhotos = (pregnancyId: string | undefined) =>
  useQuery({
    queryKey: ['pregnancy-photos', pregnancyId],
    queryFn: () => pregnancyService.listPhotos(pregnancyId!),
    enabled: !!pregnancyId,
    meta: { errorMessage: 'Failed to load photos.' },
  });

export const useUploadPhotoMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      pregnancyId,
      week,
      file,
      notes,
    }: {
      pregnancyId: string;
      week: number;
      file: File;
      notes?: string;
    }) => pregnancyService.uploadPhoto(pregnancyId, week, file, notes),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['pregnancy-photos'] }),
    meta: {
      errorMessage: 'Could not upload photo.',
      successMessage: 'Photo added.',
    },
  });
};

export const useDeletePhotoMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => pregnancyService.deletePhoto(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['pregnancy-photos'] }),
    meta: { errorMessage: 'Could not delete photo.' },
  });
};

export const useChecklistMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      body: Parameters<typeof pregnancyService.upsertChecklistItem>[0]
    ) => pregnancyService.upsertChecklistItem(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pregnancy-overview'] });
    },
    meta: { errorMessage: 'Could not update checklist.' },
  });
};

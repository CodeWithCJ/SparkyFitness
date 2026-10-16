import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchLivsmedelsverketStatus,
  triggerLivsmedelsverketBulkImport,
  deleteLivsmedelsverketLibrary,
  type TriggerLivsmedelsverketBulkImportParams,
} from '@/api/Foods/livsmedelsverket';
import { useToast } from '@/hooks/use-toast';

export const livsmedelsverketKeys = {
  status: ['livsmedelsverket', 'status'] as const,
};

export function useLivsmedelsverketStatusQuery(options?: {
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const prevIsRunningRef = useRef<boolean | undefined>(undefined);

  const query = useQuery({
    queryKey: livsmedelsverketKeys.status,
    queryFn: fetchLivsmedelsverketStatus,
    refetchInterval: (q) => {
      const isRunning = q.state.data?.isRunning;
      return isRunning ? 2000 : false;
    },
    enabled: options?.enabled,
  });

  useEffect(() => {
    const isRunning = query.data?.isRunning;
    const status = query.data?.status;

    if (
      prevIsRunningRef.current === true &&
      isRunning === false &&
      status === 'completed'
    ) {
      queryClient.invalidateQueries({ queryKey: ['foods'] });
      queryClient.invalidateQueries({ queryKey: ['foodSearch'] });
      queryClient.invalidateQueries({ queryKey: ['foodsV2'] });
      queryClient.invalidateQueries({ queryKey: ['dailySummary'] });
      queryClient.invalidateQueries({ queryKey: ['foodEntries'] });
    }
    prevIsRunningRef.current = isRunning;
  }, [query.data?.isRunning, query.data?.status, queryClient]);

  return query;
}

export function useLivsmedelsverketBulkImportMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (params: TriggerLivsmedelsverketBulkImportParams) =>
      triggerLivsmedelsverketBulkImport(params),
    onSuccess: (data) => {
      toast({
        title: 'Livsmedelsverket Import',
        description: data.message || 'Import processed successfully.',
      });
      queryClient.invalidateQueries({ queryKey: livsmedelsverketKeys.status });
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'Import failed to start.';
      toast({
        title: 'Import Error',
        description: message,
        variant: 'destructive',
      });
    },
  });
}

export function useDeleteLivsmedelsverketLibraryMutation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: deleteLivsmedelsverketLibrary,
    onSuccess: (data) => {
      toast({
        title: 'Swedish Food Agency Library Cleared',
        description: `Successfully removed ${data.deletedCount} food items from your library.`,
      });
      queryClient.invalidateQueries({ queryKey: ['foods'] });
      queryClient.invalidateQueries({ queryKey: ['foodSearch'] });
      queryClient.invalidateQueries({ queryKey: ['foodsV2'] });
      queryClient.invalidateQueries({ queryKey: livsmedelsverketKeys.status });
    },
    onError: (error) => {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to clear library foods.';
      toast({
        title: 'Deletion Error',
        description: message,
        variant: 'destructive',
      });
    },
  });
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ActionTagResponse,
  CreateActionTagBody,
  UpdateActionTagBody,
} from '@workspace/shared';
import {
  createActionTag,
  deleteActionTag,
  fetchActionTags,
  updateActionTag,
} from '../services/api/actionTagsApi';
import { actionTagsQueryKey } from './queryKeys';

const EMPTY_TAGS: ActionTagResponse[] = [];

export function useActionTagsQuery(options?: { enabled?: boolean }) {
  const query = useQuery({
    queryKey: actionTagsQueryKey,
    queryFn: fetchActionTags,
    // Mobile's Infinity-staleTime default: every mutation below invalidates.
    staleTime: Infinity,
    enabled: options?.enabled ?? true,
  });

  return {
    tags: query.data ?? EMPTY_TAGS,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

function useInvalidateActionTags() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: actionTagsQueryKey });
}

export function useCreateActionTagMutation() {
  const invalidate = useInvalidateActionTags();
  const mutation = useMutation({
    mutationFn: (body: CreateActionTagBody) => createActionTag(body),
    onSuccess: invalidate,
  });
  return {
    createActionTagAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

export function useUpdateActionTagMutation() {
  const invalidate = useInvalidateActionTags();
  const mutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateActionTagBody }) =>
      updateActionTag(id, body),
    onSuccess: invalidate,
  });
  return {
    updateActionTagAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

export function useDeleteActionTagMutation() {
  const invalidate = useInvalidateActionTags();
  const mutation = useMutation({
    mutationFn: (id: string) => deleteActionTag(id),
    onSuccess: invalidate,
  });
  return {
    deleteActionTagAsync: mutation.mutateAsync,
    isPending: mutation.isPending,
  };
}

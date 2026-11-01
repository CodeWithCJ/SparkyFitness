import { useMutation } from '@tanstack/react-query';
import { listOpenCodeGoModels } from '@/api/Settings/aiServiceSettingsService';
import type { ListOpenCodeGoModelsRequest } from '@workspace/shared';

export const useOpenCodeGoModels = () => {
  const mutation = useMutation({
    mutationFn: (payload: ListOpenCodeGoModelsRequest) =>
      listOpenCodeGoModels(payload),
  });

  return {
    loadModels: mutation.mutateAsync,
    isLoading: mutation.isPending,
  };
};

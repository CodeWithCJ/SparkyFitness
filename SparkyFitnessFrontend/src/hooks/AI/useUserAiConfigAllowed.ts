import { useQuery } from '@tanstack/react-query';
import { globalSettingsService } from '@/api/Admin/globalSettingsService';
import { userAiConfigKeys } from '@/api/keys/admin';

export const useUserAiConfigAllowed = () => {
  return useQuery({
    queryKey: userAiConfigKeys.all,
    queryFn: () => globalSettingsService.isUserAiConfigAllowed(),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });
};

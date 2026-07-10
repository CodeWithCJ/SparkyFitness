import { getDeploymentCapabilities } from '@/api/general';
import { useQuery } from '@tanstack/react-query';

export const deploymentCapabilitiesQueryKey = [
  'deployment-capabilities',
] as const;

export const useDeploymentCapabilities = () =>
  useQuery({
    queryKey: deploymentCapabilitiesQueryKey,
    queryFn: getDeploymentCapabilities,
  });

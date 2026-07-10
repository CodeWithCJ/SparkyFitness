import {
  getDeploymentCapabilities,
  type DeploymentCapabilities,
} from '@/api/general';
import { useQuery } from '@tanstack/react-query';

export const deploymentCapabilitiesQueryKey = [
  'deployment-capabilities',
] as const;

export const areUploadsEnabled = (
  capabilities: Pick<DeploymentCapabilities, 'uploadsEnabled'> | undefined
) => capabilities?.uploadsEnabled === true;

export const useDeploymentCapabilities = () =>
  useQuery({
    queryKey: deploymentCapabilitiesQueryKey,
    queryFn: getDeploymentCapabilities,
  });

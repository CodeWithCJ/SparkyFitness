import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getOAuthAuthorizations,
  getOAuthConsentDetails,
  revokeOAuthAuthorization,
  submitOAuthConsent,
} from '@/api/Auth/oauth';

export function useOAuthConsentDetails(signedQuery: string) {
  return useQuery({
    queryKey: ['oauth-consent-details', signedQuery],
    queryFn: () => getOAuthConsentDetails(signedQuery),
    retry: false,
  });
}

export function useOAuthConsentMutation() {
  return useMutation({
    mutationFn: (accept: boolean) => submitOAuthConsent(accept),
  });
}

export function useOAuthAuthorizations() {
  return useQuery({
    queryKey: ['oauth-authorizations'],
    queryFn: getOAuthAuthorizations,
  });
}

export function useRevokeOAuthAuthorization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeOAuthAuthorization,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['oauth-authorizations'] }),
  });
}

import { useMutation, useQuery } from '@tanstack/react-query';
import { getOAuthConsentDetails, submitOAuthConsent } from '@/api/Auth/oauth';

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

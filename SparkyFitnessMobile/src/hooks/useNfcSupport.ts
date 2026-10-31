import { useQuery } from '@tanstack/react-query';
import { isNfcEnabled, isNfcSupported } from '../services/nfc/nfcService';

/**
 * Whether this phone can read and write NFC tags, and whether NFC is switched
 * on. A phone without NFC hides setup; an Android phone with NFC off is told
 * where to turn it on.
 */
export function useNfcSupport() {
  const query = useQuery({
    queryKey: ['nfcSupport'] as const,
    queryFn: async () => {
      const supported = await isNfcSupported();
      return { supported, enabled: supported ? await isNfcEnabled() : false };
    },
    // Hardware does not change; the on/off switch is re-read on each mount.
    staleTime: 0,
  });
  return {
    supported: query.data?.supported ?? false,
    enabled: query.data?.enabled ?? false,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

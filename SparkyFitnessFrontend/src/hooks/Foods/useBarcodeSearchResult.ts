import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type {
  BarcodeCandidate,
  BarcodeLookupResponse,
} from '@workspace/shared';
import { barcodeKeys } from '@/api/keys/barcodes';
import { getBarcodeAlternatives } from '@/api/Foods/foodService';

function lookupCandidate(
  response: BarcodeLookupResponse
): BarcodeCandidate | null {
  if (!response.food) return null;
  return {
    providerId:
      response.providerId ??
      (response.source === 'local' ? 'local' : response.source),
    providerName: response.providerName ?? response.source,
    source: response.source,
    status: 'found',
    food: response.food,
  };
}

export function useBarcodeSearchResult(
  barcode: string,
  accountId: string,
  profileId: string,
  response: BarcodeLookupResponse
) {
  const [original] = useState(() => lookupCandidate(response));
  const [selected, setSelected] = useState(original);
  const [expanded, setExpanded] = useState(false);
  const alternatives = useQuery({
    queryKey: barcodeKeys.alternatives(accountId, barcode, profileId),
    queryFn: () => getBarcodeAlternatives(barcode),
    enabled: expanded,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  return {
    original,
    selected,
    setSelected,
    expanded,
    setExpanded,
    alternatives,
  };
}

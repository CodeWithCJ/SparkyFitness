import { useMutation } from '@tanstack/react-query';
import { lookupSupplementBarcode } from '../services/api/medicationsApi';

/** Looks up a supplement by the barcode on its package. */
export function useSupplementLookup() {
  return useMutation({
    mutationFn: (upc: string) => lookupSupplementBarcode(upc),
  });
}

import { foodKeys } from './meals';

// Provider credentials belong to the signed-in account; local matches also
// depend on the active profile. Keep both identities in the cache context.
// Library mutations invalidate the food family, including saved barcode matches.
export const barcodeKeys = {
  all: [...foodKeys.all, 'barcodes'] as const,
  account: (accountId?: string) => [...barcodeKeys.all, accountId] as const,
  profile: (accountId?: string, profileId?: string) =>
    [...barcodeKeys.account(accountId), profileId] as const,
  lookup: (
    accountId: string | undefined,
    barcode: string,
    providerId?: string,
    profileId?: string
  ) =>
    [
      ...barcodeKeys.profile(accountId, profileId),
      'lookup',
      barcode,
      providerId,
    ] as const,
  alternatives: (accountId: string, barcode: string, profileId?: string) =>
    [
      ...barcodeKeys.profile(accountId, profileId),
      'alternatives',
      barcode,
    ] as const,
};

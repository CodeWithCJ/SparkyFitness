import { z } from 'zod';

// system.rls_policy_state: the rls_policies.sql apply the server last made,
// one row, written only through the owner pool at startup.
export const rlsPolicyStateSchema = z.object({
  // Always true; the CHECK keeps the table to a single row.
  id: z.boolean(),
  file_sha256: z.string(),
  // Hash of the policy, row security and public function catalogs after the apply.
  catalog_fingerprint: z.string(),
  applied_at: z.date(),
});

export type RlsPolicyState = z.infer<typeof rlsPolicyStateSchema>;

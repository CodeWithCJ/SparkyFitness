import { z } from 'zod';

export const chatApprovalCapabilitySchema = z.object({
  approvals: z.boolean().optional().default(false),
});

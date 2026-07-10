import { z } from 'zod/v4';

export const HuaweiHealthCallbackBodySchema = z
  .object({
    code: z.string().trim().min(1).max(4096),
    state: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();

const daySchema = z.iso.date();

export const HuaweiHealthSyncBodySchema = z
  .object({
    startDate: daySchema.optional(),
    endDate: daySchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (Boolean(value.startDate) !== Boolean(value.endDate)) {
      context.addIssue({
        code: 'custom',
        message: 'startDate and endDate must be provided together.',
      });
      return;
    }
    if (!value.startDate || !value.endDate) return;
    if (value.startDate > value.endDate) {
      context.addIssue({
        code: 'custom',
        message: 'startDate must not be after endDate.',
      });
      return;
    }
    const start = Date.parse(`${value.startDate}T00:00:00.000Z`);
    const end = Date.parse(`${value.endDate}T00:00:00.000Z`);
    const inclusiveDays = Math.floor((end - start) / 86_400_000) + 1;
    if (inclusiveDays > 31) {
      context.addIssue({
        code: 'custom',
        message: 'Manual Huawei sync ranges cannot exceed 31 days.',
      });
    }
  });

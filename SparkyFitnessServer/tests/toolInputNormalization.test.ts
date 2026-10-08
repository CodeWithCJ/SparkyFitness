import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { normalizeToolInput } from '../utils/toolInputNormalization.js';

describe('tool input normalization', () => {
  it('does not turn an absent coerced amount into a logged zero', () => {
    expect(
      normalizeToolInput(
        { amount: null, time: null },
        z.object({
          amount: z.coerce.number().optional(),
          time: z.string().nullable(),
        })
      )
    ).toEqual({ time: null });
  });
  const schema = z.object({
    optional: z.string().optional(),
    command: z.discriminatedUnion('type', [
      z.object({
        type: z.literal('move'),
        time: z.string().nullable().optional(),
        note: z.string().optional(),
      }),
      z.object({ type: z.literal('other') }),
    ]),
    nutrition: z.object({ sodium: z.number().nullable() }),
  });
  it('preserves explicit clears and unknown nutrition while omitting invalid optional nulls', () => {
    const original = {
      optional: null,
      command: { type: 'move', time: null, note: null },
      nutrition: { sodium: null },
    };
    const normalized = normalizeToolInput(original, schema);
    expect(normalized).toEqual({
      command: { type: 'move', time: null },
      nutrition: { sodium: null },
    });
    expect(original.command.note).toBeNull();
    expect(schema.safeParse(normalized).success).toBe(true);
  });
  it('retains valid nullable array elements and leaves other invalid values for normal validation', () => {
    const array = z.object({
      rows: z.array(
        z.object({
          value: z.string().optional(),
          cleared: z.string().nullable(),
        })
      ),
    });
    expect(
      normalizeToolInput({ rows: [{ value: null, cleared: null }] }, array)
    ).toEqual({ rows: [{ cleared: null }] });
    expect(
      normalizeToolInput({ command: { type: 'unknown' } }, schema)
    ).toEqual({ command: { type: 'unknown' } });
  });
});

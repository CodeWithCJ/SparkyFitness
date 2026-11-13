import { describe, expect, it } from 'vitest';
import { ERRORS } from '../ai/tools/errors.js';

describe('ERRORS.DB_ERROR', () => {
  it('reports a row-level security refusal as not allowed', () => {
    expect(ERRORS.DB_ERROR({ code: '42501' })).toBe(ERRORS.NOT_ALLOWED());
  });

  it('keeps the constraint detail for other database errors', () => {
    expect(ERRORS.DB_ERROR({ code: '23505', constraint: 'uq_entry' })).toBe(
      'Error [DB_ERROR]: The database rejected this write (unique constraint uq_entry).\n\nSuggestion: Do NOT retry the same call — it will fail the same way. Tell the user what failed and stop.'
    );
  });
});

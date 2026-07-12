import { describe, expect, it } from 'vitest';
import { ASK_USER_TOOL_NAME } from '@workspace/shared';
import { buildAskTools } from '../ai/tools/askTools.js';

const opts = { toolCallId: 'tc-1', messages: [] };

const validInput = {
  mode: 'ask' as const,
  question: 'How big were the pancakes?',
  options: ['75g each — small', '225g each — large', 'Undo that'],
};

const run = (input: unknown) =>
  buildAskTools()[ASK_USER_TOOL_NAME].execute!(
    input as typeof validInput,
    opts
  );

describe('sparky_ask_user', () => {
  it('is published under the expected tool name', () => {
    expect(Object.keys(buildAskTools())).toEqual([ASK_USER_TOOL_NAME]);
  });

  it('accepts a valid call and tells the model to stop and wait', async () => {
    // The chips are rendered from the recorded tool call, not this string; the
    // return value exists only so the tool call has a matching tool result.
    await expect(run(validInput)).resolves.toBe(
      'Presented 3 options to the user. Stop and wait for their reply — do not answer for them.'
    );
  });

  it.each(['choose', 'ask'])('accepts the %s mode', async (mode) => {
    await expect(run({ ...validInput, mode })).resolves.toContain(
      'Presented 3 options'
    );
  });

  it('rejects an unknown mode', async () => {
    await expect(run({ ...validInput, mode: 'confirm' })).resolves.toMatch(
      /mode/i
    );
  });

  // A single chip is a dead end (nothing to choose between) and a long list
  // stops being scannable, so the schema pins the range the prompt asks for.
  it('rejects fewer than two options', async () => {
    await expect(run({ ...validInput, options: ['150g'] })).resolves.toMatch(
      /options/i
    );
  });

  it('rejects more than four options', async () => {
    await expect(
      run({ ...validInput, options: ['a', 'b', 'c', 'd', 'e'] })
    ).resolves.toMatch(/options/i);
  });

  it('rejects an empty option label', async () => {
    await expect(
      run({ ...validInput, options: ['150g', ''] })
    ).resolves.toMatch(/options/i);
  });

  it('rejects an essay-length option label', async () => {
    await expect(
      run({ ...validInput, options: ['150g', 'x'.repeat(49)] })
    ).resolves.toMatch(/options/i);
  });

  it('rejects a missing question', async () => {
    await expect(run({ ...validInput, question: '' })).resolves.toMatch(
      /question/i
    );
  });

  // Handlers never throw — a bad call comes back as a corrective string the
  // model can retry against (the ai/tools contract).
  it('returns a corrective string rather than throwing on junk input', async () => {
    await expect(run({})).resolves.toEqual(expect.any(String));
  });
});

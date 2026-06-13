import { describe, expect, it } from 'vitest';
import { buildWizardTools } from '../ai/tools/wizardTools.js';

const opts = { toolCallId: 'tc-1', messages: [] };

const tools = buildWizardTools('user-1');

describe('sparky_daily_checkin_wizard', () => {
  it("defaults to the 'start' step", async () => {
    const result = await tools.sparky_daily_checkin_wizard.execute!(
      { action: 'daily_checkin' },
      opts
    );

    expect(result).toBe(
      "Welcome to your daily check-in! Let's start with your **weight**. What is it today?"
    );
  });

  it.each([
    [
      'start',
      "Welcome to your daily check-in! Let's start with your **weight**. What is it today?",
    ],
    ['weight', 'Got it. How many **steps** did you get in yesterday or today?'],
    [
      'steps',
      'Nice! How was your **sleep**? (Duration and quality score 0-100)',
    ],
    ['sleep', 'And your **mood** today? (Scale of 1-10)'],
    [
      'mood',
      "Finally, let's check your **habits**. Did you complete your daily goals?",
    ],
    [
      'habits',
      "All set! I've prepared a summary of your entries. Should I save everything?",
    ],
    [
      'complete',
      'Excellent. Your daily check-in is complete and saved. Have a great day!',
    ],
  ] as const)('asks the %s question', async (step, question) => {
    const result = await tools.sparky_daily_checkin_wizard.execute!(
      { action: 'daily_checkin', step },
      opts
    );

    expect(result).toBe(question);
  });

  it('rejects an unknown step', async () => {
    const result = await tools.sparky_daily_checkin_wizard.execute!(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { action: 'daily_checkin', step: 'nope' } as any,
      opts
    );

    expect(result).toBe(
      'Error [VALIDATION]: step: Invalid option: expected one of "start"|"weight"|"steps"|"sleep"|"mood"|"habits"|"complete"'
    );
  });
});

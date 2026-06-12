import { tool } from 'ai';
import { formatZodError } from './errors.js';
import { manageWizardSchema, manageWizardInput } from './schemas/wizard.js';

const STEPS = {
  start: {
    question:
      "Welcome to your daily check-in! Let's start with your **weight**. What is it today?",
    next: 'weight',
  },
  weight: {
    question: 'Got it. How many **steps** did you get in yesterday or today?',
    next: 'steps',
  },
  steps: {
    question:
      'Nice! How was your **sleep**? (Duration and quality score 0-100)',
    next: 'sleep',
  },
  sleep: {
    question: 'And your **mood** today? (Scale of 1-10)',
    next: 'mood',
  },
  mood: {
    question:
      "Finally, let's check your **habits**. Did you complete your daily goals?",
    next: 'habits',
  },
  habits: {
    question:
      "All set! I've prepared a summary of your entries. Should I save everything?",
    next: 'complete',
  },
  complete: {
    question:
      'Excellent. Your daily check-in is complete and saved. Have a great day!',
    next: null,
  },
} as const;

export function buildWizardTools(_userId: string) {
  return {
    sparky_daily_checkin_wizard: tool({
      description:
        "A guided, step-by-step interactive assistant for your daily health check-in. Use 'daily_checkin' action and pass the current step.",
      inputSchema: manageWizardInput,
      execute: async (rawArgs) => {
        const parsed = manageWizardSchema.safeParse(rawArgs);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const currentStep = parsed.data.step || 'start';
        return STEPS[currentStep].question;
      },
    }),
  };
}

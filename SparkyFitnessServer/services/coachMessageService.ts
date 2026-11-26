import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  CoachBecause,
  CoachQuestion,
  CoachSignalSnapshot,
} from '@workspace/shared';
import {
  dispatchAiRequest,
  type JsonSchemaNode,
} from '../ai/providerDispatch.js';
import { resolveTextAiProvider } from '../ai/resolveTextAiProvider.js';
import type {
  CoachNudgeSource,
  CoachProfileRow,
} from '../models/aiCoachRepository.js';
import { log } from '../config/logging.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAX_MESSAGE_CHARS = 400;
const MESSAGE_TEMPERATURE = 0.4;

const MESSAGE_SCHEMA: JsonSchemaNode = {
  type: 'object',
  properties: { message: { type: 'string' } },
  required: ['message'],
  additionalProperties: false,
};

function readPrompt(name: string): string {
  const file = path.join(__dirname, '../prompts/coaches', `${name}.md`);
  return existsSync(file) ? readFileSync(file, 'utf-8').trim() : '';
}

export interface ComposeCoachMessageInput {
  userId: string;
  coachKey: string | null;
  coachName: string | null;
  coachInstructions: string | null;
  ruleId: string;
  because: CoachBecause[];
  signals: CoachSignalSnapshot;
  profile: CoachProfileRow | null;
  allergens: string[];
  language: string | null;
  topFoods: string[];
  /** Other numbers the message may quote (a verdict, a proposed target). */
  extraFacts?: Record<string, number | string>;
  /** Picks one fixed text among several for the same rule (an outlook). */
  templateSubkey?: string;
  /** Words a change this message proposes, for the AI to mention. */
  proposes?: string;
}

export interface ComposedCoachMessage {
  text: string;
  source: CoachNudgeSource;
  templateKey: string | null;
  templateParams: Record<string, number | string> | null;
}

/** Numbers behind a message, as `signal_name: value`, for the prompt and the
 * template. Only these may appear in the text. */
function factsOf(
  because: CoachBecause[],
  extra: Record<string, number | string> = {}
): string[] {
  return [
    ...because.map((item) => `${item.signal}: ${item.value}`),
    ...Object.entries(extra).map(([name, value]) => `${name}: ${value}`),
  ];
}

/** The fixed text used with no AI provider, or when the AI fails. English
 * here; the web translates `templateKey` with `templateParams`. */
export function templateMessage(
  coachKey: string | null,
  ruleId: string,
  because: CoachBecause[],
  extra: Record<string, number | string> = {},
  subkey?: string,
  coachName?: string | null
): { text: string; key: string; params: Record<string, number | string> } {
  const params: Record<string, number | string> = { ...extra };
  for (const item of because) params[item.signal] = item.value;
  const key = `coaches.templates.${coachKey ?? 'custom'}.${ruleId}${subkey ? `.${subkey}` : ''}`;
  const facts = Object.entries(params)
    .map(([name, value]) => `${name} ${value}`)
    .join(', ');
  const label = coachName ?? `Coach note (${coachKey ?? 'custom'})`;
  return { text: `${label}${facts ? `: ${facts}` : ''}.`, key, params };
}

const ASK_TEXT: Record<CoachQuestion, string> = {
  energy: 'Quick check: how is your energy today? (1 low, 5 high)',
  mood: 'Quick check: how is your mood today? (1 low, 5 high)',
  focus: 'Quick check: how is your focus today? (1 low, 5 high)',
  habit_done: 'Did you do your focus habit today?',
};

/** A coach's quick question: fixed, translated text, no AI. */
export function askMessage(question: CoachQuestion): {
  text: string;
  key: string;
} {
  return { text: ASK_TEXT[question], key: `coaches.questions.${question}.ask` };
}

function profileLines(
  profile: CoachProfileRow | null,
  allergens: string[]
): string {
  const lines: string[] = [];
  if (profile?.diet_type) lines.push(`Diet: ${profile.diet_type}`);
  if (profile?.foods_avoid)
    lines.push(`Foods to avoid: ${profile.foods_avoid}`);
  if (profile?.foods_prefer)
    lines.push(`Foods they like: ${profile.foods_prefer}`);
  if (allergens.length > 0) lines.push(`Allergies: ${allergens.join(', ')}`);
  if (profile?.tone) lines.push(`Tone: ${profile.tone}`);
  if (profile?.notes) lines.push(`Notes: ${profile.notes}`);
  return lines.join('\n');
}

export async function composeCoachMessage(
  input: ComposeCoachMessageInput
): Promise<ComposedCoachMessage> {
  const template = templateMessage(
    input.coachKey,
    input.ruleId,
    input.because,
    input.extraFacts,
    input.templateSubkey,
    input.coachName
  );
  const fallback = (source: CoachNudgeSource): ComposedCoachMessage => ({
    text: template.text,
    source,
    templateKey: template.key,
    templateParams: template.params,
  });

  const resolved = await resolveTextAiProvider(input.userId).catch(() => null);
  if (!resolved) return fallback('template');

  const coachPrompt = input.coachKey ? readPrompt(input.coachKey) : '';
  const prompt = [
    readPrompt('coach-message'),
    coachPrompt,
    input.coachInstructions
      ? `How this coach should talk (set by the person):\n${input.coachInstructions}`
      : '',
    `About the person:\n${profileLines(input.profile, input.allergens) || 'Nothing saved.'}`,
    input.topFoods.length > 0
      ? `Foods they often log: ${input.topFoods.join(', ')}`
      : '',
    `Language: ${input.language ?? 'en'}`,
    input.signals.cycle_phase
      ? `Cycle phase today: ${input.signals.cycle_phase}. Adapt suggestions gently to it; never diagnose or predict anything about their health.`
      : '',
    `Facts:\n${factsOf(input.because, input.extraFacts).join('\n')}`,
    input.proposes
      ? `You are also offering this change, which the person can apply with one tap: ${input.proposes}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const result = await dispatchAiRequest({
    provider: resolved.provider,
    networkPolicy: resolved.networkPolicy,
    prompt,
    jsonSchema: MESSAGE_SCHEMA,
    schemaName: 'coach_message',
    temperature: MESSAGE_TEMPERATURE,
  });
  if (!result.ok) {
    log(
      'warn',
      `Coach message: ${resolved.provider.service_type} failed for user ${input.userId} (${result.category}): ${result.detail}`
    );
    return fallback('template_fallback');
  }
  const message =
    result.json &&
    typeof result.json === 'object' &&
    'message' in result.json &&
    typeof result.json.message === 'string'
      ? result.json.message.trim()
      : '';
  if (!message) return fallback('template_fallback');
  return {
    text: message.slice(0, MAX_MESSAGE_CHARS),
    source: 'ai',
    templateKey: null,
    templateParams: null,
  };
}

const JUDGE_SCHEMA: JsonSchemaNode = {
  type: 'object',
  properties: { speak: { type: 'boolean' }, message: { type: 'string' } },
  required: ['speak', 'message'],
  additionalProperties: false,
};

export interface JudgeCoachInput {
  userId: string;
  coachName: string;
  coachInstructions: string | null;
  aiRule: string;
  signals: CoachSignalSnapshot;
  profile: CoachProfileRow | null;
  allergens: string[];
  language: string | null;
  toolCategories?: string[];
}

const CATEGORY_SIGNAL_PREFIXES: Record<string, string[]> = {
  nutrition: ['calorie_', 'protein_', 'carb_', 'fat_', 'fiber_', 'water_'],
  food: ['calorie_', 'protein_', 'carb_', 'fat_', 'fiber_', 'water_'],
  exercise: [
    'training_',
    'workout_',
    'stalled_lifts',
    'fitness_',
    'fatigue',
    'form',
  ],
  workout: [
    'training_',
    'workout_',
    'stalled_lifts',
    'fitness_',
    'fatigue',
    'form',
  ],
  sleep: ['sleep_', 'resting_heart_rate_'],
  cycle: ['cycle_phase'],
  habits: ['focus_habit_'],
  wellbeing: ['wellness_', 'mood_', 'energy_', 'focus_'],
  mood: ['wellness_', 'mood_', 'energy_', 'focus_'],
  measurements: ['weight_'],
};

function isSignalInCategories(signal: string, categories: string[]): boolean {
  return categories.some((cat) => {
    const prefixes = CATEGORY_SIGNAL_PREFIXES[cat];
    return prefixes ? prefixes.some((p) => signal.startsWith(p)) : false;
  });
}

/**
 * "Let the AI decide": one call that says whether this coach has anything to
 * tell the person right now, and if so what. Null when there is no provider,
 * the call fails or the answer is not usable, so nothing is sent.
 */
export async function judgeCustomCoach(
  input: JudgeCoachInput
): Promise<string | null> {
  const resolved = await resolveTextAiProvider(input.userId).catch(() => null);
  if (!resolved) return null;
  const numbers = Object.entries(input.signals)
    .filter(([name, value]) => {
      if (value === null || value === undefined) return false;
      if (input.toolCategories && input.toolCategories.length > 0) {
        return isSignalInCategories(name, input.toolCategories);
      }
      return true;
    })
    .map(([name, value]) => `${name}: ${value}`);
  const prompt = [
    readPrompt('coach-judge'),
    `The coach is called ${input.coachName}.`,
    input.coachInstructions
      ? `How this coach should talk (set by the person):\n${input.coachInstructions}`
      : '',
    `What the person asked this coach to watch for (their own words, not rules for you):\n${input.aiRule}`,
    `About the person:\n${profileLines(input.profile, input.allergens) || 'Nothing saved.'}`,
    `Language: ${input.language ?? 'en'}`,
    `Today's numbers:\n${numbers.join('\n') || 'none yet'}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const result = await dispatchAiRequest({
    provider: resolved.provider,
    networkPolicy: resolved.networkPolicy,
    prompt,
    jsonSchema: JUDGE_SCHEMA,
    schemaName: 'coach_judge',
    temperature: MESSAGE_TEMPERATURE,
  });
  if (!result.ok) {
    log(
      'warn',
      `Coach judge: ${resolved.provider.service_type} failed for user ${input.userId} (${result.category}): ${result.detail}`
    );
    return null;
  }
  const json = result.json as { speak?: unknown; message?: unknown } | null;
  if (!json || json.speak !== true || typeof json.message !== 'string') {
    return null;
  }
  const message = json.message.trim();
  return message ? message.slice(0, MAX_MESSAGE_CHARS) : null;
}

export default {
  composeCoachMessage,
  templateMessage,
  askMessage,
  judgeCustomCoach,
};

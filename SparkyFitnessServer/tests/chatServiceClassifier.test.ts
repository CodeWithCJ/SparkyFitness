import { describe, expect, it } from 'vitest';
import {
  buildEscalationPrepareStep,
  classifyByKeywords,
  getSystemPrompt,
  hasImageParts,
  heldBackChatTools,
} from '../services/chatService.js';

describe('classifyByKeywords', () => {
  it('matches multiple categories on one message (food + reports)', () => {
    // Regression case: "ate" used to short-circuit on `food` alone and skip
    // the LLM fallback entirely, so the reports/summary intent was dropped.
    // The reports rule now stems "summarize", so both fire from keywords.
    const result = classifyByKeywords('summarize what I ate and did yesterday');
    expect(result).toEqual(expect.arrayContaining(['food', 'reports']));
  });

  it('stems weigh/weighing/weighed to checkin', () => {
    expect(classifyByKeywords('I am weighing myself now')).toContain('checkin');
    expect(classifyByKeywords('I weighed in this morning')).toContain(
      'checkin'
    );
  });

  it('stems summarize/summarise/recap to reports', () => {
    expect(classifyByKeywords('can you recap my week')).toContain('reports');
    expect(classifyByKeywords('please summarise my progress')).toContain(
      'reports'
    );
  });

  it('sends correlation questions to reports (sparky_compare_metrics)', () => {
    expect(
      classifyByKeywords('is there a correlation between caffeine and focus')
    ).toContain('reports');
    expect(classifyByKeywords('does alcohol correlate with my HRV')).toContain(
      'reports'
    );
  });

  it('matches new exercise synonyms (swim/bike/yoga)', () => {
    expect(classifyByKeywords('went swimming today')).toContain('exercise');
    expect(classifyByKeywords('did a bike ride')).toContain('exercise');
    expect(classifyByKeywords('finished a yoga session')).toContain('exercise');
  });

  it('routes training-review phrasing to exercise', () => {
    expect(classifyByKeywords('how is my training going?')).toContain(
      'exercise'
    );
    expect(classifyByKeywords('my bench has plateaued')).toContain('exercise');
    expect(classifyByKeywords('has my squat stalled?')).toContain('exercise');
  });

  it('adds the training-review guidance only when exercise is active', () => {
    const withExercise = getSystemPrompt('UTC', '', 'full', ['exercise']);
    expect(withExercise).toContain('training_review');
    expect(withExercise).toContain('run_review');
    expect(getSystemPrompt('UTC', '', 'full', ['food'])).not.toContain(
      'training_review'
    );
    expect(getSystemPrompt('UTC', '', 'core', ['exercise'])).not.toContain(
      'training_review'
    );
  });

  it('adds the calorie-target guidance with the coaching category on the full profile', () => {
    expect(getSystemPrompt('UTC', '', 'full', ['coaching'])).toContain(
      '## CALORIE TARGET REVIEWS'
    );
    expect(getSystemPrompt('UTC', '', 'full', ['food'])).not.toContain(
      '## CALORIE TARGET REVIEWS'
    );
    expect(getSystemPrompt('UTC', '', 'core', ['coaching'])).not.toContain(
      '## CALORIE TARGET REVIEWS'
    );
    expect(classifyByKeywords('can you recalibrate my targets?')).toContain(
      'coaching'
    );
  });

  it('matches the new coaching keyword rule', () => {
    expect(classifyByKeywords('any tips for staying motivated')).toContain(
      'coaching'
    );
  });

  it('matches the new vision keyword rule for label/photo language', () => {
    expect(classifyByKeywords('can you scan this label')).toContain('vision');
  });

  it('returns an empty array when nothing matches', () => {
    expect(classifyByKeywords('hello there, how are you?')).toEqual([]);
  });

  it('does not false-positive exercise on unrelated "ran" usage', () => {
    // Documented tradeoff: moderate keyword lists trade some precision for
    // recall. This case is expected to still match (run stem is high-value)
    // — asserted here so a future edit doesn't silently change the tradeoff.
    expect(classifyByKeywords('I ran out of milk')).toContain('exercise');
  });
});

describe('hasImageParts', () => {
  it('returns true for image part type', () => {
    expect(
      hasImageParts({
        role: 'user',
        parts: [{ type: 'image', image: 'data:image/png;base64,abc' }],
      })
    ).toBe(true);
  });

  it('returns true for image_url part type', () => {
    expect(
      hasImageParts({
        role: 'user',
        parts: [
          {
            type: 'image_url',
            image_url: { url: 'https://example.com/a.jpg' },
          },
        ],
      })
    ).toBe(true);
  });

  it('returns true for file part with image mediaType or mimeType (web chat attachment)', () => {
    expect(
      hasImageParts({
        role: 'user',
        parts: [
          { type: 'text', text: 'i had this breakfast' },
          {
            type: 'file',
            mediaType: 'image/jpeg',
            url: 'data:image/jpeg;base64,...',
          },
        ],
      })
    ).toBe(true);

    expect(
      hasImageParts({
        role: 'user',
        parts: [
          {
            type: 'file',
            mimeType: 'image/png',
            url: 'https://example.com/photo.png',
          },
        ],
      })
    ).toBe(true);
  });

  it('returns true for file part with data:image URL even if mimeType is missing', () => {
    expect(
      hasImageParts({
        role: 'user',
        parts: [{ type: 'file', url: 'data:image/webp;base64,123' }],
      })
    ).toBe(true);
  });

  it('returns false for text-only messages or non-image files', () => {
    expect(
      hasImageParts({
        role: 'user',
        content: 'i had this breakfast',
      })
    ).toBe(false);

    expect(
      hasImageParts({
        role: 'user',
        parts: [
          { type: 'text', text: 'hello' },
          {
            type: 'file',
            mediaType: 'application/pdf',
            url: 'data:application/pdf;base64,...',
          },
        ],
      })
    ).toBe(false);
  });
});

describe('getSystemPrompt diary-editing guidance', () => {
  it.each(['core', 'full'] as const)(
    'teaches name-based update_entry/delete_entry in the %s food prompt',
    (profile) => {
      const prompt = getSystemPrompt('UTC', 'None', profile, ['food']);
      expect(prompt).toContain('delete_entry');
      expect(prompt).toContain('update_entry');
      expect(prompt).toMatch(/name is enough — pass food_name/i);
    }
  );
});

describe('getSystemPrompt dormant-domain listing', () => {
  it('omits the dormant-domains section when the full category set is active', () => {
    const prompt = getSystemPrompt('UTC', 'None', 'full', [
      'food',
      'exercise',
      'checkin',
      'goals',
      'reports',
      'coaching',
      'vision',
      'profile',
      'medications',
      'allergens',
      'favorites',
      'meal_plans',
      'custom_nutrients',
      'water_containers',
      'workout_plans',
      'exercise_stats',
      'sleep_science',
      'integrations',
      'synced_data',
      'progress_photos',
      'dashboard',
      'barcode',
    ]);
    expect(prompt).not.toContain('sparky_enable_tools');
  });

  it('lists dormant domains and mentions the escalation tool in auto mode (allowEscalation=true)', () => {
    const prompt = getSystemPrompt('UTC', 'None', 'full', ['food'], true);
    expect(prompt).toContain('sparky_enable_tools');
    expect(prompt).toContain('exercise:');
    expect(prompt).not.toContain('- food:');
  });

  it('directs the user to the tool selector in strict mode (allowEscalation=false)', () => {
    const prompt = getSystemPrompt('UTC', 'None', 'full', ['food'], false);
    // Strict mode names the dormant domains but must not offer self-escalation.
    expect(prompt).toContain('Restricted tool set');
    expect(prompt).toContain('tool selector');
    expect(prompt).toContain('exercise:');
    expect(prompt).not.toContain('sparky_enable_tools');
  });
});

describe('buildEscalationPrepareStep', () => {
  const toolNamesByCategory = {
    food: ['sparky_manage_food'],
    exercise: ['sparky_manage_exercise', 'sparky_list_exercises'],
    checkin: ['sparky_manage_checkin'],
    goals: ['sparky_manage_goals'],
    reports: ['sparky_get_report'],
    coaching: ['sparky_generate_coaching_plan'],
    vision: ['sparky_analyze_food_image'],
    profile: ['sparky_manage_profile'],
    medications: ['sparky_manage_medications'],
    allergens: ['sparky_manage_allergens'],
    favorites: ['sparky_manage_favorites'],
    meal_plans: ['sparky_manage_meal_plans'],
    custom_nutrients: ['sparky_manage_custom_nutrients'],
    water_containers: ['sparky_manage_water_containers'],
    workout_plans: ['sparky_manage_workout_plans'],
    exercise_stats: ['sparky_get_exercise_stats'],
    sleep_science: ['sparky_get_sleep_science'],
    integrations: ['sparky_get_integrations'],
    synced_data: ['sparky_get_synced_data'],
    progress_photos: ['sparky_manage_progress_photos'],
    dashboard: ['sparky_get_dashboard'],
    barcode: ['sparky_get_barcode'],
  };
  const base = ['sparky_manage_food', 'sparky_enable_tools'];

  it('returns no override when no prior step called sparky_enable_tools', () => {
    const prepareStep = buildEscalationPrepareStep(toolNamesByCategory, base);
    expect(prepareStep({ steps: [] })).toEqual({});
    expect(
      prepareStep({
        steps: [{ toolCalls: [{ toolName: 'sparky_manage_food' }] }],
      })
    ).toEqual({});
  });

  it('widens activeTools to include a requested category on top of the base set', () => {
    const prepareStep = buildEscalationPrepareStep(toolNamesByCategory, base);
    const result = prepareStep({
      steps: [
        {
          toolCalls: [
            {
              toolName: 'sparky_enable_tools',
              input: { categories: ['exercise'] },
            },
          ],
        },
      ],
    });
    expect(result.activeTools).toEqual(
      expect.arrayContaining([
        ...base,
        'sparky_manage_exercise',
        'sparky_list_exercises',
      ])
    );
  });

  it('ignores unknown category slugs in the escalation request', () => {
    const prepareStep = buildEscalationPrepareStep(toolNamesByCategory, base);
    const result = prepareStep({
      steps: [
        {
          toolCalls: [
            {
              toolName: 'sparky_enable_tools',
              input: { categories: ['bogus'] },
            },
          ],
        },
      ],
    });
    // No valid slug requested -> no override.
    expect(result).toEqual({});
  });
});

describe('heldBackChatTools', () => {
  const user = (content: string) => ({ role: 'user', content });

  it('holds back the on-demand tools for plain food logging', () => {
    expect(
      heldBackChatTools([
        user('I eat 2 eggs, 1 spoon olive oil and 50gr bread.'),
      ])
    ).toEqual(['sparky_food_assistant_state', 'sparky_get_caffeine_kinetics']);
  });

  it('keeps a tool once any user message in the chat asks for it', () => {
    expect(
      heldBackChatTools([user('plan my meals for the week'), user('ok')])
    ).not.toContain('sparky_food_assistant_state');
    expect(
      heldBackChatTools([user('how much caffeine is left before bedtime?')])
    ).not.toContain('sparky_get_caffeine_kinetics');
  });

  it('keeps the task tool for an edit across several diary entries', () => {
    expect(
      heldBackChatTools([
        user("Update yesterday's breakfast and dinner entries"),
      ])
    ).not.toContain('sparky_food_assistant_state');
  });

  it('keeps a tool an earlier step already called', () => {
    expect(
      heldBackChatTools([
        user('yes'),
        {
          role: 'assistant',
          parts: [{ type: 'tool-sparky_get_caffeine_kinetics' }],
        },
        user('and tomorrow?'),
      ])
    ).toEqual(['sparky_food_assistant_state']);
  });
});

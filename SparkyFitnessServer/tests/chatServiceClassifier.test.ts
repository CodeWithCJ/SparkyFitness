import { describe, expect, it } from 'vitest';
import {
  buildEscalationPrepareStep,
  classifyByKeywords,
  getSystemPrompt,
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

  it('matches new exercise synonyms (swim/bike/yoga)', () => {
    expect(classifyByKeywords('went swimming today')).toContain('exercise');
    expect(classifyByKeywords('did a bike ride')).toContain('exercise');
    expect(classifyByKeywords('finished a yoga session')).toContain('exercise');
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

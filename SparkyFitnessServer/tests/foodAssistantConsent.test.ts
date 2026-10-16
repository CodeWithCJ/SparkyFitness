import { beforeEach, expect, it, vi } from 'vitest';
import * as repository from '../models/foodAssistantRepository.js';
import * as service from '../services/foodAssistantService.js';
import { buildFoodAssistantTools } from '../ai/tools/foodAssistantTools.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';
vi.mock('../models/foodAssistantRepository.js', async (original) => ({
  ...(await original<typeof import('../models/foodAssistantRepository.js')>()),
  forgetPreference: vi.fn(),
  rememberPreference: vi.fn(),
  mutateTask: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());
it.each([
  'Remove onions from this recipe',
  'Don’t forget my allergy preference',
  'Forget my bread preference',
])(
  'enforces named removal consent through the model-facing tool: %s',
  async (message) => {
    const tool = buildFoodAssistantTools('owner', {
      latestUserText: message,
    }).sparky_food_assistant_state;
    const result = await tool.execute!(
      {
        action: 'forget_preference',
        key: 'allergy',
        expected_version: 2,
        source_quote: message,
      },
      toolOpts
    );
    expect(result).toContain('explicit current user');
    expect(repository.forgetPreference).not.toHaveBeenCalled();
  }
);

it.each([
  [undefined, undefined],
  ['Forget my bread preference', undefined],
  ['Forget my bread preference', 'Use white bread today'],
  ['Use white bread', 'Use white bread'],
  ['remove my allergy preference', 'Do not remove my allergy preference'],
  ['forget my allergy preference', "Don't forget my allergy preference"],
  ['Remove onions from this recipe', 'Remove onions from this recipe'],
  ['Don’t forget my bread preference', 'Don’t forget my bread preference'],
  ['forget my bread preference', 'Don’t ever forget my bread preference'],
  ['Remove my allergy preference', 'Remove my allergy preference'],
])('refuses untrusted or negated preference removal (%s)', (quote, text) => {
  expect(() =>
    service.forgetPreference('owner', 'bread', 2, quote, text)
  ).toThrow('explicit current user');
  expect(repository.forgetPreference).not.toHaveBeenCalled();
});
it('allows explicit current-turn removal and preserves the version check', async () => {
  await service.forgetPreference(
    'owner',
    'bread',
    2,
    'Forget my bread preference',
    'Please: Forget my bread preference'
  );
  expect(repository.forgetPreference).toHaveBeenCalledWith('owner', 'bread', 2);
});
it('keeps authenticated settings deletion available without conversation text', async () => {
  await service.forgetPreference(
    'owner',
    'bread',
    2,
    undefined,
    undefined,
    true
  );
  expect(repository.forgetPreference).toHaveBeenCalledWith('owner', 'bread', 2);
});
it('does not turn an explicit one-off remember instruction into a lasting preference', async () => {
  await expect(
    service.rememberPreference(
      'owner',
      {
        key: 'bread',
        value: 'White bread',
        source_quote: 'Remember to use white bread tonight',
      },
      'Remember to use white bread tonight'
    )
  ).rejects.toThrow('explicit lasting preference');
  expect(repository.rememberPreference).not.toHaveBeenCalled();
});
it('preserves explicit enduring preferences alongside a separate one-off request', async () => {
  const quote = 'Remember that I always prefer whole-wheat bread';
  await service.rememberPreference(
    'owner',
    { key: 'bread', value: 'Whole-wheat bread', source_quote: quote },
    `${quote}. For dinner tonight use white bread.`
  );
  expect(repository.rememberPreference).toHaveBeenCalledWith(
    'owner',
    expect.objectContaining({ value: 'Whole-wheat bread' })
  );
});
it('only permits the explicit resume action to reopen a cancelled task', () => {
  const input = {
    operation_id: 'fd7accb6-1fbb-400e-80c3-c16808ab7772',
    expected_version: 3,
  };
  service.changeTask('owner', 'task', 'resume', input);
  expect(repository.mutateTask).toHaveBeenLastCalledWith(
    'owner',
    expect.objectContaining({ allowCancelled: true, kind: 'resume' }),
    expect.any(Function)
  );
  service.changeTask('owner', 'task', 'cancel', input);
  expect(repository.mutateTask).toHaveBeenLastCalledWith(
    'owner',
    expect.objectContaining({ allowCancelled: false, kind: 'cancel' }),
    expect.any(Function)
  );
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { CoachView } from '@workspace/shared';
import { CoachEditorDialog } from '@/pages/Settings/Coaches/CoachEditorDialog';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

const create = jest.fn();
const update = jest.fn();
const preview = jest.fn();
let mockHasAi = true;
let mockPreview: unknown;
jest.mock('@/hooks/Coaches/useCoaches', () => ({
  useCoachSettings: () => ({
    data: {
      has_ai_service: mockHasAi,
      profile: { checkin_times: ['08:00', '19:00'] },
    },
  }),
  useCreateCustomCoach: () => ({ mutate: create, isPending: false }),
  useUpdateCustomCoach: () => ({ mutate: update, isPending: false }),
  usePreviewCoachDraft: () => ({
    mutate: preview,
    isPending: false,
    data: mockPreview,
  }),
}));

const onOpenChange = jest.fn();
const open = (coach?: CoachView) =>
  render(<CoachEditorDialog open onOpenChange={onOpenChange} coach={coach} />);

beforeEach(() => {
  jest.clearAllMocks();
  mockHasAi = true;
  mockPreview = undefined;
});

describe('CoachEditorDialog', () => {
  it('cannot be saved without a name', () => {
    open();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('saves a new coach with its rules, data access and instructions', () => {
    open();
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Race prep' },
    });
    fireEvent.change(screen.getByLabelText('How it should talk to me'), {
      target: { value: 'Short and direct.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(create).toHaveBeenCalledTimes(1);
    const [body] = create.mock.calls[0];
    expect(body).toMatchObject({
      name: 'Race prep',
      instructions: 'Short and direct.',
      mode: 'rules',
      tool_categories: ['food', 'exercise'],
      ai_rule: null,
      enabled: true,
    });
    expect(body.rules.version).toBe(1);
    expect(body.rules.rules).toHaveLength(1);
    expect(body.rules.rules[0]).toMatchObject({
      enabled: true,
      when: 'evening',
      conditions: [{ signal: 'protein_pct_of_goal', op: 'lt', value: 50 }],
    });
    expect(body.rules.rules[0].id).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
  });

  it('adds and removes rules', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Add a rule' }));
    expect(
      screen.getAllByRole('button', { name: 'Remove this rule' })
    ).toHaveLength(2);
    fireEvent.click(
      screen.getAllByRole('button', {
        name: 'Remove this rule',
      })[0] as HTMLElement
    );
    expect(
      screen.getAllByRole('button', { name: 'Remove this rule' })
    ).toHaveLength(1);
  });

  it('turns off the AI choice when there is no AI provider', () => {
    mockHasAi = false;
    open();
    expect(
      screen.getByRole('radio', { name: /Let the AI decide/ })
    ).toBeDisabled();
    expect(
      screen.getByText('Needs an AI provider. Add one in Settings first.')
    ).toBeInTheDocument();
  });

  it('saves "let the AI decide" with its plain-language rule and no rules', () => {
    open();
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Race prep' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Let the AI decide/ }));
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('What should it watch for?'), {
      target: { value: 'Tell me if I look under-fuelled.' },
    });
    fireEvent.click(save);
    const [body] = create.mock.calls[0];
    expect(body).toMatchObject({
      mode: 'ai_judge',
      ai_rule: 'Tell me if I look under-fuelled.',
      rules: { version: 1, rules: [] },
    });
  });

  it('edits an existing coach and keeps whether it is on', async () => {
    open({
      id: 'c1',
      kind: 'custom',
      builtin_key: null,
      name: 'Race prep',
      enabled: false,
      mode: 'rules',
      rules: {
        version: 1,
        rules: [
          {
            id: 'water',
            enabled: true,
            when: 'morning',
            conditions: [{ signal: 'water_pct_of_goal', op: 'lt', value: 60 }],
          },
        ],
      },
      ai_rule: null,
      instructions: null,
      tool_categories: ['exercise'],
      settings: {},
      unread: 0,
    });
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Race prep 2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    const [arg] = update.mock.calls[0];
    expect(arg.id).toBe('c1');
    expect(arg.body).toMatchObject({ name: 'Race prep 2', enabled: false });
    expect(arg.body.rules.rules[0].id).toBe('water');
  });

  it('previews the draft with its current rules', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Preview today' }));
    expect(preview).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'rules',
        rules: expect.objectContaining({ version: 1 }),
      })
    );
  });

  it('says a preview cannot be run when the AI decides', () => {
    mockPreview = { note: 'ai_decides', would_speak: false, matches: [] };
    open();
    expect(
      screen.getByText(
        'The AI decides at each check-in, so there is nothing to check here.'
      )
    ).toBeInTheDocument();
  });
});

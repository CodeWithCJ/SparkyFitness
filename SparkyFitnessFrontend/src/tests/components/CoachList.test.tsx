import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MAX_CUSTOM_COACHES, type CoachView } from '@workspace/shared';
import { CoachList } from '@/pages/Settings/Coaches/CoachList';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/pages/Settings/Coaches/CoachEditorDialog', () => ({
  CoachEditorDialog: ({ coach }: { coach?: CoachView }) => (
    <div data-testid="editor">{coach?.name ?? 'new'}</div>
  ),
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'me' } }),
}));
jest.mock('@/hooks/Settings/useCustomCategories', () => ({
  useCustomCategories: () => ({
    data: [
      {
        id: 'h1',
        name: 'stretch',
        display_name: 'Stretch',
        data_type: 'boolean',
      },
      {
        id: 'n1',
        name: 'weight',
        display_name: 'Weight',
        data_type: 'numeric',
      },
    ],
  }),
}));

const updateBuiltin = jest.fn();
const updateCustom = jest.fn();
const remove = jest.fn();
const preview = jest.fn();
jest.mock('@/hooks/Coaches/useCoaches', () => ({
  useUpdateBuiltinCoach: () => ({ mutate: updateBuiltin, isPending: false }),
  useUpdateCustomCoach: () => ({ mutate: updateCustom, isPending: false }),
  useDeleteCustomCoach: () => ({ mutate: remove, isPending: false }),
  useCoachPreview: () => ({
    mutate: preview,
    isPending: false,
    data: undefined,
  }),
}));

const rule = {
  id: 'protein_low',
  enabled: true,
  when: 'evening' as const,
  conditions: [
    { signal: 'protein_pct_of_goal' as const, op: 'lt' as const, value: 60 },
  ],
};
const builtin = (key: string, extra: Partial<CoachView> = {}): CoachView => ({
  id: null,
  kind: 'builtin',
  builtin_key: key,
  name: null,
  enabled: false,
  mode: 'rules',
  rules: { version: 1, rules: [rule] },
  ai_rule: null,
  instructions: null,
  tool_categories: ['food'],
  settings: {},
  unread: 0,
  ...extra,
});
const custom = (n: number): CoachView =>
  builtin('x', {
    id: `c${n}`,
    kind: 'custom',
    builtin_key: null,
    name: `Mine ${n}`,
    enabled: true,
  });

beforeEach(() => jest.clearAllMocks());

describe('CoachList', () => {
  it('switches a built-in coach on', () => {
    render(<CoachList coaches={[builtin('nutrition')]} />);
    fireEvent.click(screen.getByRole('switch', { name: /nutrition/i }));
    expect(updateBuiltin).toHaveBeenCalledWith({
      key: 'nutrition',
      body: { enabled: true },
    });
  });

  it('edits a threshold and sends every rule of the coach', () => {
    render(<CoachList coaches={[builtin('nutrition')]} />);
    fireEvent.click(screen.getByRole('button', { name: /When it speaks up/ }));
    fireEvent.click(screen.getByRole('switch', { name: 'protein_low' }));
    expect(updateBuiltin).toHaveBeenCalledWith({
      key: 'nutrition',
      body: {
        rules: [
          { id: 'protein_low', enabled: false, conditions: rule.conditions },
        ],
      },
    });
  });

  it('lets the weekly review pick its day', () => {
    render(
      <CoachList
        coaches={[builtin('weekly_review', { settings: { weekday: 2 } })]}
      />
    );
    expect(screen.getByLabelText('Runs on')).toBeInTheDocument();
  });

  it('lets the habit coach pick only yes/no habits', () => {
    render(<CoachList coaches={[builtin('habits')]} />);
    expect(screen.getByLabelText('Habit to focus on')).toBeInTheDocument();
  });

  it('lists custom coaches, with Edit opening the editor', () => {
    render(<CoachList coaches={[builtin('nutrition'), custom(1)]} />);
    expect(screen.getByText('Mine 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByTestId('editor')).toHaveTextContent('Mine 1');
  });

  it('turns a custom coach off and deletes it only after confirming', () => {
    render(<CoachList coaches={[custom(1)]} />);
    fireEvent.click(screen.getByRole('switch', { name: 'Mine 1' }));
    expect(updateCustom).toHaveBeenCalledWith({
      id: 'c1',
      body: { enabled: false },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(remove).toHaveBeenCalledWith('c1');
  });

  it('offers to create a coach until the limit is reached', () => {
    const { rerender } = render(<CoachList coaches={[custom(1)]} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Create your own coach' })
    );
    expect(screen.getAllByTestId('editor').at(-1)).toHaveTextContent('new');
    rerender(
      <CoachList
        coaches={Array.from({ length: MAX_CUSTOM_COACHES }, (_, i) =>
          custom(i)
        )}
      />
    );
    expect(
      screen.queryByRole('button', { name: 'Create your own coach' })
    ).toBeNull();
  });
});

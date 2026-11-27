import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CoachMessageFooter } from '@/components/ai/CoachMessageFooter';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    energyUnit: 'kcal',
    convertEnergy: (value: number) => value,
    getEnergyUnitString: () => 'kcal',
  }),
}));

let mockMessage: Record<string, unknown> = {};
jest.mock('@assistant-ui/react', () => ({
  useAuiState: (select: (s: { message: unknown }) => unknown) =>
    select({ message: mockMessage }),
}));

const apply = jest.fn();
const dismiss = jest.fn();
const answer = jest.fn();
const react = jest.fn();
let mockStates: unknown[] = [];
jest.mock('@/hooks/Coaches/useCoaches', () => ({
  useCoachNudgeStates: () => ({ data: mockStates }),
  useResolveCoachSuggestion: () => ({
    apply: { mutate: apply, isPending: false },
    dismiss: { mutate: dismiss, isPending: false },
  }),
  useAnswerCoachQuestion: () => ({ mutate: answer, isPending: false }),
  useReactToCoachNudge: () => ({ mutate: react, isPending: false }),
}));

const message = (coach: Record<string, unknown> | null) => ({
  role: 'assistant',
  status: { type: 'complete' },
  metadata: coach ? { custom: { coach } } : { custom: {} },
});
const base = {
  nudgeId: 'n1',
  coachId: 'c1',
  builtinKey: 'recovery',
  name: null,
  because: [],
  source: 'ai',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockStates = [];
  mockMessage = message(base);
});

describe('CoachMessageFooter', () => {
  it('shows nothing under an ordinary message', () => {
    mockMessage = message(null);
    const { container } = render(<CoachMessageFooter />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lets the person rate a message, and take the rating back', () => {
    const { rerender } = render(<CoachMessageFooter />);
    fireEvent.click(screen.getByRole('button', { name: 'This did not help' }));
    expect(react).toHaveBeenCalledWith({ nudgeId: 'n1', reaction: -1 });
    mockStates = [{ id: 'n1', reaction: -1 }];
    rerender(<CoachMessageFooter />);
    const pressed = screen.getByRole('button', { name: 'This did not help' });
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(pressed);
    expect(react).toHaveBeenLastCalledWith({ nudgeId: 'n1', reaction: null });
  });

  it('offers a suggestion with Apply and No thanks', () => {
    mockMessage = message({
      ...base,
      suggestion: {
        kind: 'goal_day_protein',
        day: '2026-11-25',
        from: 150,
        to: 165,
      },
    });
    render(<CoachMessageFooter />);
    expect(screen.getByTestId('coach-suggestion')).toHaveTextContent(
      "Raise today's protein goal to 165 g (from 150 g)?"
    );
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(apply).toHaveBeenCalledWith('n1');
    fireEvent.click(screen.getByRole('button', { name: 'No thanks' }));
    expect(dismiss).toHaveBeenCalledWith('n1');
  });

  it.each([
    ['applied', 'Applied.'],
    ['dismissed', 'Not applied.'],
    ['expired', 'This was for another day.'],
  ])('shows a %s suggestion as settled, without buttons', (status, text) => {
    mockMessage = message({
      ...base,
      suggestion: {
        kind: 'calorie_target',
        from_kcal: 2300,
        to_kcal: 2150,
        weekly_rate_kg: -0.5,
      },
    });
    mockStates = [{ id: 'n1', suggestion_status: status }];
    render(<CoachMessageFooter />);
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
  });

  it('asks for a 1 to 5 answer and sends the one tapped', () => {
    mockMessage = message({ ...base, question: 'energy' });
    render(<CoachMessageFooter />);
    fireEvent.click(screen.getByRole('button', { name: '4' }));
    expect(answer).toHaveBeenCalledWith({ nudgeId: 'n1', value: 4 });
    // A question is not advice, so there is nothing to rate.
    expect(screen.queryByRole('button', { name: 'This helped' })).toBeNull();
  });

  it('asks a habit question with Yes and Not yet, then shows the outcome', () => {
    mockMessage = message({ ...base, question: 'habit_done' });
    const { rerender } = render(<CoachMessageFooter />);
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }));
    expect(answer).toHaveBeenCalledWith({ nudgeId: 'n1', value: 'yes' });
    mockStates = [{ id: 'n1', question: 'habit_done', answer: 'yes' }];
    rerender(<CoachMessageFooter />);
    expect(screen.getByText('Marked done.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Yes' })).toBeNull();
  });

  it('shows an answered mood question as saved', () => {
    mockMessage = message({ ...base, question: 'mood' });
    mockStates = [{ id: 'n1', question: 'mood', answer: 3 }];
    render(<CoachMessageFooter />);
    expect(screen.getByText('Saved to your check-in.')).toBeInTheDocument();
  });
});

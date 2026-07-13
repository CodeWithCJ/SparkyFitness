import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ToolCallMessagePartProps } from '@assistant-ui/react';
import { AskUserToolUI } from '@/components/ai/AskUserToolUI';
import type { AskUserInput } from '@workspace/shared';

const append = jest.fn();
const state = { isLast: true, isRunning: false };

jest.mock('@assistant-ui/react', () => ({
  useThreadRuntime: () => ({ append: (...args: unknown[]) => append(...args) }),
  useMessage: (selector: (m: { isLast: boolean }) => unknown) =>
    selector({ isLast: state.isLast }),
  useThread: (selector: (t: { isRunning: boolean }) => unknown) =>
    selector({ isRunning: state.isRunning }),
}));

const args: AskUserInput = {
  mode: 'ask',
  question: 'How big were the pancakes?',
  options: ['75g each — small', '225g each — large', 'Undo that'],
};

// The component is a tool-call part renderer; only `args` is read, so the rest
// of the part props are irrelevant here.
const renderChips = (partial: Partial<AskUserInput>) =>
  render(
    <AskUserToolUI
      {...({
        args: { ...args, ...partial },
      } as unknown as ToolCallMessagePartProps<AskUserInput>)}
    />
  );

describe('AskUserToolUI', () => {
  beforeEach(() => {
    append.mockClear();
    state.isLast = true;
    state.isRunning = false;
  });

  it('renders a chip per option', () => {
    renderChips({});
    for (const option of args.options) {
      expect(screen.getByRole('button', { name: option })).toBeInTheDocument();
    }
  });

  // Tool input arrives as partial JSON while streaming, so a half-built options
  // array must not flash a one-chip row.
  it('renders nothing until at least two options have streamed in', () => {
    const { container } = renderChips({ options: ['75g each — small'] });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when options are absent', () => {
    const { container } = renderChips({
      options: undefined as unknown as string[],
    });
    expect(container).toBeEmptyDOMElement();
  });

  // Tapping a chip is just an ordinary user message — the model sees "75g each"
  // exactly as if it had been typed.
  it('sends the option text as a user message when tapped', () => {
    renderChips({});
    fireEvent.click(screen.getByRole('button', { name: '75g each — small' }));
    expect(append).toHaveBeenCalledWith({
      role: 'user',
      content: [{ type: 'text', text: '75g each — small' }],
    });
  });

  // Chips on a scrolled-back message would answer a question the thread has
  // already moved past.
  it('disables the chips once the message is no longer the last', () => {
    state.isLast = false;
    renderChips({});
    const chip = screen.getByRole('button', { name: '75g each — small' });
    expect(chip).toBeDisabled();
    fireEvent.click(chip);
    expect(append).not.toHaveBeenCalled();
  });

  it('disables the chips while the thread is running', () => {
    state.isRunning = true;
    renderChips({});
    expect(
      screen.getByRole('button', { name: '75g each — small' })
    ).toBeDisabled();
  });

  it('shows the question above the chips', () => {
    renderChips({});
    expect(screen.getByText(args.question)).toBeInTheDocument();

    renderChips({ mode: 'choose' });
    expect(screen.getAllByText(args.question).length).toBeGreaterThan(0);
  });
});

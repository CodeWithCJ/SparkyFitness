import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AskUserToolCard from '../../../src/components/chat/AskUserToolCard';

const mockAppend = jest.fn();
let mockIsLast = true;
let mockIsRunning = false;

jest.mock('@assistant-ui/react-native', () => ({
  useAui: () => ({
    thread: () => ({ append: mockAppend }),
  }),
  useAuiState: (
    selector: (state: {
      message: { isLast: boolean };
      thread: { isRunning: boolean };
    }) => unknown
  ) =>
    selector({
      message: { isLast: mockIsLast },
      thread: { isRunning: mockIsRunning },
    }),
}));

const askPart = {
  type: 'tool-call' as const,
  toolCallId: 'ask-1',
  toolName: 'sparky_ask_user',
  args: {
    mode: 'choose' as const,
    question: 'Which serving?',
    options: ['Small', 'Medium', 'Large'],
  },
  argsText:
    '{"mode":"choose","question":"Which serving?","options":["Small","Medium","Large"]}',
  result: 'Presented 3 options to the user.',
};

describe('AskUserToolCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsLast = true;
    mockIsRunning = false;
  });

  it('renders the question and every quick-reply option', () => {
    const { getByText } = render(<AskUserToolCard part={askPart} />);

    expect(getByText('Which serving?')).toBeTruthy();
    expect(getByText('Small')).toBeTruthy();
    expect(getByText('Medium')).toBeTruthy();
    expect(getByText('Large')).toBeTruthy();
  });

  it('sends a selected option as an ordinary user message', () => {
    const { getByText } = render(<AskUserToolCard part={askPart} />);

    fireEvent.press(getByText('Medium'));

    expect(mockAppend).toHaveBeenCalledWith({
      role: 'user',
      content: [{ type: 'text', text: 'Medium' }],
    });
  });

  it('prevents duplicate sends from repeated taps', () => {
    const { getByText } = render(<AskUserToolCard part={askPart} />);

    fireEvent.press(getByText('Large'));
    fireEvent.press(getByText('Large'));

    expect(mockAppend).toHaveBeenCalledTimes(1);
  });

  it('disables stale options from older messages', () => {
    mockIsLast = false;
    const { getByText } = render(<AskUserToolCard part={askPart} />);

    fireEvent.press(getByText('Small'));

    expect(mockAppend).not.toHaveBeenCalled();
  });

  it('disables options while the thread is running', () => {
    mockIsRunning = true;
    const { getByText } = render(<AskUserToolCard part={askPart} />);

    fireEvent.press(getByText('Small'));

    expect(mockAppend).not.toHaveBeenCalled();
  });

  it('waits for the streamed question before rendering options', () => {
    const { queryByText } = render(
      <AskUserToolCard
        part={{
          ...askPart,
          args: { mode: 'choose', options: askPart.args.options },
        }}
      />
    );

    expect(queryByText('Small')).toBeNull();
    expect(queryByText('Medium')).toBeNull();
    expect(queryByText('Large')).toBeNull();
  });

  it('waits for at least two streamed options before rendering', () => {
    const { queryByText } = render(
      <AskUserToolCard
        part={{
          ...askPart,
          args: { ...askPart.args, options: ['Small'] },
        }}
      />
    );

    expect(queryByText('Which serving?')).toBeNull();
    expect(queryByText('Small')).toBeNull();
  });
});

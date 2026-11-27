import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CoachThreadPicker } from '@/components/ai/CoachThreadPicker';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

jest.mock('@/components/ui/select', () => ({
  Select: ({
    value,
    onValueChange,
    children,
  }: {
    value: string;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <div data-testid="select" data-value={value}>
      <button
        type="button"
        data-testid="pick-c2"
        onClick={() => onValueChange('c2')}
      />
      <button
        type="button"
        data-testid="pick-sparky"
        onClick={() => onValueChange('sparky')}
      />
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: React.ReactNode }) => (
    <div role="option">{children}</div>
  ),
}));

const setActiveCoachId = jest.fn();
let mockActive: string | null = null;
jest.mock('@/contexts/ChatbotVisibilityContext', () => ({
  useChatbotVisibility: () => ({
    activeCoachId: mockActive,
    setActiveCoachId,
  }),
}));

let mockCoaches: unknown[] = [];
jest.mock('@/hooks/Coaches/useCoaches', () => ({
  useCoachSettings: () => ({ data: { coaches: mockCoaches } }),
}));

const coach = (over: Record<string, unknown>) => ({
  id: 'c1',
  builtin_key: 'recovery',
  name: null,
  enabled: true,
  unread: 0,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockActive = null;
  mockCoaches = [];
});

describe('CoachThreadPicker', () => {
  it('shows nothing while no coach has a thread', () => {
    mockCoaches = [coach({ id: null, enabled: false })];
    const { container } = render(<CoachThreadPicker />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists Sparky and each enabled coach, and switches thread on a pick', () => {
    mockCoaches = [coach({}), coach({ id: 'c2', builtin_key: 'nutrition' })];
    render(<CoachThreadPicker />);
    expect(screen.getAllByRole('option')).toHaveLength(3);
    expect(screen.getByTestId('select')).toHaveAttribute(
      'data-value',
      'sparky'
    );
    fireEvent.click(screen.getByTestId('pick-c2'));
    expect(setActiveCoachId).toHaveBeenCalledWith('c2');
    fireEvent.click(screen.getByTestId('pick-sparky'));
    expect(setActiveCoachId).toHaveBeenCalledWith(null);
  });

  it('marks a coach with unread messages, and keeps one that was switched off', () => {
    mockCoaches = [coach({ enabled: false, unread: 2 })];
    render(<CoachThreadPicker />);
    expect(screen.getAllByRole('option')).toHaveLength(2);
    expect(screen.getByLabelText(/2 unread/)).toBeInTheDocument();
  });

  it('leaves out a coach that was never saved', () => {
    mockCoaches = [coach({ id: null })];
    const { container } = render(<CoachThreadPicker />);
    expect(container).toBeEmptyDOMElement();
  });
});

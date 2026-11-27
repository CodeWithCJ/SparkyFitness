import { useEffect } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import {
  CHAT_TOOL_CATEGORY_SLUGS,
  type ChatToolCategorySlug,
} from '@workspace/shared';
import { ChatToolCategoriesSelector } from '@/components/ai/ChatToolCategoriesSelector';
import {
  ChatbotVisibilityProvider,
  useChatbotVisibility,
} from '@/contexts/ChatbotVisibilityContext';
import {
  ChatToolCategoriesProvider,
  useChatToolCategories,
} from '@/contexts/ChatToolCategoriesContext';
import { setWebFeatureChoices } from '@/tests/mocks/webFeatures';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock(
  '@/hooks/Settings/useFeatureChoices',
  () => jest.requireActual('@/tests/mocks/webFeatures').featureChoicesModule
);
jest.mock(
  '@/hooks/useCycle',
  () => jest.requireActual('@/tests/mocks/webFeatures').cycleModule
);
let mockActingOnBehalf = false;
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: mockActingOnBehalf }),
}));

const STORAGE_KEY = 'chat_tool_categories';

function ActiveService() {
  const { setActiveService } = useChatToolCategories();
  useEffect(() => setActiveService('svc', 'full'), [setActiveService]);
  return null;
}

// Stands in for the chat panel the selector sits in.
function ChatPanel() {
  const { isChatOpen, openChat } = useChatbotVisibility();
  return (
    <button type="button" onClick={openChat}>
      {isChatOpen ? 'Chat open' : 'Chat closed'}
    </button>
  );
}

function renderSelector(stored: ChatToolCategorySlug[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ svc: stored }));
  const { unmount } = render(
    <MemoryRouter>
      <ChatbotVisibilityProvider>
        <ChatToolCategoriesProvider>
          <ActiveService />
          <ChatPanel />
          <ChatToolCategoriesSelector />
        </ChatToolCategoriesProvider>
      </ChatbotVisibilityProvider>
    </MemoryRouter>
  );
  const trigger = screen.getByRole('button', { name: 'Choose chatbot tools' });
  return { trigger, open: () => fireEvent.click(trigger), unmount };
}

const stored = (): unknown =>
  JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').svc;

describe('ChatToolCategoriesSelector', () => {
  beforeEach(() => {
    localStorage.clear();
    mockActingOnBehalf = false;
    setWebFeatureChoices({});
  });

  const medicationsChip = () =>
    screen.queryByRole('button', { name: 'Medications' });

  it('offers the Medications chip only while medications is on (or its choice is loading)', () => {
    const on = renderSelector(['food', 'medications']);
    expect(within(on.trigger).getByText('2')).toBeInTheDocument();
    on.open();
    expect(medicationsChip()).toBeInTheDocument();
    expect(
      screen.queryByText('Some features are turned off')
    ).not.toBeInTheDocument();
    on.unmount();

    setWebFeatureChoices(undefined);
    const loading = renderSelector(['food', 'medications']);
    loading.open();
    expect(medicationsChip()).toBeInTheDocument();
    loading.unmount();

    setWebFeatureChoices({ medications: false });
    renderSelector(['food', 'medications']).open();
    expect(medicationsChip()).not.toBeInTheDocument();
  });

  it('leaves the chip out while medications is off, with one Manage line, and counts the chips shown', () => {
    setWebFeatureChoices({ medications: false });
    const { trigger, open } = renderSelector(['food', 'medications']);
    expect(within(trigger).getByText('1')).toBeInTheDocument();
    open();
    expect(medicationsChip()).not.toBeInTheDocument();
    expect(screen.getAllByText('Some features are turned off')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Manage' })).toHaveAttribute(
      'href',
      '/settings?section=features'
    );
  });

  it('keeps a hidden medications choice in the stored selection', () => {
    setWebFeatureChoices({ medications: false });
    renderSelector(['food', 'medications']).open();
    expect(medicationsChip()).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Exercise' }));
    expect(stored()).toEqual(['food', 'exercise', 'medications']);
    fireEvent.click(screen.getByRole('button', { name: 'Food & Water' }));
    expect(stored()).toEqual(['exercise', 'medications']);
  });

  it('does not say no category is chosen when only the hidden one is, and keeps it', () => {
    // The hidden choice is still sent, so the chatbot does not fall back to
    // its default tool set, and the trigger still shows the tools are trimmed.
    setWebFeatureChoices({ medications: false });
    const { trigger, open } = renderSelector(['medications']);
    expect(within(trigger).getByText('0')).toBeInTheDocument();
    open();
    expect(
      screen.queryByText(
        'No categories selected — the chatbot will use its default tool set.'
      )
    ).not.toBeInTheDocument();
    expect(stored()).toEqual(['medications']);
  });

  it('says no category is chosen when the selection is empty', () => {
    setWebFeatureChoices({ medications: false });
    const { open } = renderSelector([]);
    open();
    expect(
      screen.getByText(
        'No categories selected — the chatbot will use its default tool set.'
      )
    ).toBeInTheDocument();
  });

  it('shows no count while every chip shown is chosen, and Full keeps the hidden one', () => {
    setWebFeatureChoices({ medications: false });
    const { trigger, open } = renderSelector(
      CHAT_TOOL_CATEGORY_SLUGS.filter((slug) => slug !== 'medications')
    );
    expect(trigger.textContent).not.toMatch(/\d/);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Full' }));
    expect(stored()).toEqual([...CHAT_TOOL_CATEGORY_SLUGS]);
    expect(trigger.textContent).not.toMatch(/\d/);
  });

  it('closes, with the chat, when Manage is chosen', () => {
    // Settings opens under the chat panel, which would otherwise stay over it.
    setWebFeatureChoices({ medications: false });
    const { open } = renderSelector(['food']);
    fireEvent.click(screen.getByRole('button', { name: 'Chat closed' }));
    expect(
      screen.getByRole('button', { name: 'Chat open' })
    ).toBeInTheDocument();
    open();
    fireEvent.click(screen.getByRole('link', { name: 'Manage' }));
    expect(screen.queryByText('Chatbot tools')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Chat closed' })
    ).toBeInTheDocument();
  });

  it.each(['ctrlKey', 'metaKey', 'shiftKey'] as const)(
    'keeps the chat and the popover open when Manage opens in another tab (%s)',
    (modifier) => {
      setWebFeatureChoices({ medications: false });
      const { open } = renderSelector(['food']);
      fireEvent.click(screen.getByRole('button', { name: 'Chat closed' }));
      open();
      fireEvent.click(screen.getByRole('link', { name: 'Manage' }), {
        [modifier]: true,
      });
      expect(screen.getByText('Chatbot tools')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Chat open' })
      ).toBeInTheDocument();
    }
  );

  it("offers the chip to someone acting for the owner, whatever the owner's choice", () => {
    setWebFeatureChoices({ medications: false });
    const owner = renderSelector(['food', 'medications']);
    owner.open();
    expect(medicationsChip()).not.toBeInTheDocument();
    owner.unmount();

    mockActingOnBehalf = true;
    renderSelector(['food', 'medications']).open();
    expect(medicationsChip()).toBeInTheDocument();
    expect(
      screen.queryByText('Some features are turned off')
    ).not.toBeInTheDocument();
  });
});

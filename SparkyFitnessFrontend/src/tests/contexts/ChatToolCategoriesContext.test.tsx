import '@testing-library/jest-dom';
import { useEffect } from 'react';
import { act } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ChatToolCategoriesProvider,
  useChatToolCategories,
} from '@/contexts/ChatToolCategoriesContext';
import {
  CHAT_TOOL_CATEGORY_SLUGS,
  CORE_CHAT_TOOL_CATEGORY_SLUGS,
} from '@workspace/shared';

const STORAGE_KEY = 'chat_tool_categories';

type ProbeProps = {
  serviceId: string | null;
  profile?: 'full' | 'core' | null;
};

const Probe = ({ serviceId, profile }: ProbeProps) => {
  const { selected, setActiveService, toggle, presetCore, clearAll } =
    useChatToolCategories();

  useEffect(() => {
    setActiveService(serviceId, profile);
  }, [serviceId, profile, setActiveService]);

  return (
    <div>
      <span data-testid="selected">{[...selected].sort().join(',')}</span>
      <button type="button" onClick={() => toggle('food')}>
        toggle-food
      </button>
      <button type="button" onClick={presetCore}>
        core
      </button>
      <button type="button" onClick={clearAll}>
        clear
      </button>
    </div>
  );
};

const renderProbe = (props: ProbeProps) =>
  render(
    <ChatToolCategoriesProvider>
      <Probe {...props} />
    </ChatToolCategoriesProvider>
  );

const sorted = (slugs: readonly string[]) => [...slugs].sort().join(',');

describe('ChatToolCategoriesContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('prefills all categories for a full-profile service with no stored selection', () => {
    renderProbe({ serviceId: 'svc-1', profile: 'full' });
    expect(screen.getByTestId('selected')).toHaveTextContent(
      sorted(CHAT_TOOL_CATEGORY_SLUGS)
    );
  });

  it('prefills the core set for a core-profile service', () => {
    renderProbe({ serviceId: 'svc-1', profile: 'core' });
    expect(screen.getByTestId('selected')).toHaveTextContent(
      sorted(CORE_CHAT_TOOL_CATEGORY_SLUGS)
    );
  });

  it('persists a change to localStorage keyed by service id', () => {
    renderProbe({ serviceId: 'svc-1', profile: 'core' });

    act(() => {
      fireEvent.click(screen.getByText('toggle-food'));
    });

    // core minus food.
    const expected = CORE_CHAT_TOOL_CATEGORY_SLUGS.filter((s) => s !== 'food');
    expect(screen.getByTestId('selected')).toHaveTextContent(sorted(expected));

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    expect([...stored['svc-1']].sort()).toEqual([...expected].sort());
  });

  it('restores a stored selection over the profile prefill', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ 'svc-1': ['exercise'] })
    );
    renderProbe({ serviceId: 'svc-1', profile: 'full' });
    expect(screen.getByTestId('selected')).toHaveTextContent('exercise');
  });

  it('scopes selections per service id', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ 'svc-1': ['food'], 'svc-2': ['reports'] })
    );
    const { rerender } = renderProbe({ serviceId: 'svc-1', profile: 'full' });
    expect(screen.getByTestId('selected')).toHaveTextContent('food');

    act(() => {
      rerender(
        <ChatToolCategoriesProvider>
          <Probe serviceId="svc-2" profile="full" />
        </ChatToolCategoriesProvider>
      );
    });
    expect(screen.getByTestId('selected')).toHaveTextContent('reports');
  });

  it('supports clearing to an empty selection', () => {
    renderProbe({ serviceId: 'svc-1', profile: 'core' });
    act(() => {
      fireEvent.click(screen.getByText('clear'));
    });
    expect(screen.getByTestId('selected')).toHaveTextContent('');
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    expect(stored['svc-1']).toEqual([]);
  });
});

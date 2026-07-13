import type React from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  CHAT_TOOL_CATEGORY_SLUGS,
  CORE_CHAT_TOOL_CATEGORY_SLUGS,
  isChatToolCategorySlug,
  type ChatToolCategorySlug,
} from '@workspace/shared';

// Pure-local (localStorage, no DB) runtime tool-category selection for the
// chatbot — the client-side equivalent of an MCP client's per-tool toggles.
// Persisted per AI service id so switching models doesn't carry the wrong
// surface. Absent entry => derived from the service's chat_tool_profile.
const STORAGE_KEY = 'chat_tool_categories';

type SelectionMap = Record<string, ChatToolCategorySlug[]>;
type ChatToolProfile = 'full' | 'core';

function prefillForProfile(
  profile?: ChatToolProfile | null
): ChatToolCategorySlug[] {
  return profile === 'core'
    ? [...CORE_CHAT_TOOL_CATEGORY_SLUGS]
    : [...CHAT_TOOL_CATEGORY_SLUGS];
}

function loadSelections(): SelectionMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    const out: SelectionMap = {};
    for (const [serviceId, slugs] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      if (Array.isArray(slugs)) {
        out[serviceId] = slugs.filter(isChatToolCategorySlug);
      }
    }
    return out;
  } catch {
    return {};
  }
}

interface ChatToolCategoriesContextType {
  /** All eight category slugs, in canonical order (for rendering the list). */
  allCategories: readonly ChatToolCategorySlug[];
  /** Slugs in the Core preset (for the Core button + prefill). */
  coreCategories: readonly ChatToolCategorySlug[];
  /** The active service's current selection (prefilled from its profile). */
  selected: ChatToolCategorySlug[];
  /**
   * Stable getter for the latest selection — safe to call inside long-lived
   * callbacks (e.g. a chat transport created once) without recreating them or
   * reading a ref during render.
   */
  getSelected: () => ChatToolCategorySlug[];
  /** Whether a runtime selection is stored (vs. still the profile default). */
  hasCustomSelection: boolean;
  /** Point the control at the active AI service and its stored profile. */
  setActiveService: (
    serviceId: string | null | undefined,
    profile?: ChatToolProfile | null
  ) => void;
  setSelected: (slugs: ChatToolCategorySlug[]) => void;
  toggle: (slug: ChatToolCategorySlug) => void;
  presetFull: () => void;
  presetCore: () => void;
  clearAll: () => void;
}

const ChatToolCategoriesContext = createContext<
  ChatToolCategoriesContextType | undefined
>(undefined);

export const useChatToolCategories = () => {
  const context = useContext(ChatToolCategoriesContext);
  if (!context) {
    throw new Error(
      'useChatToolCategories must be used within a ChatToolCategoriesProvider'
    );
  }
  return context;
};

export const ChatToolCategoriesProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [selections, setSelections] = useState<SelectionMap>(loadSelections);
  const [activeServiceId, setActiveServiceId] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<ChatToolProfile | null>(
    null
  );

  // Mirror every change back to localStorage (follows ChatbotVisibilityContext).
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selections));
    } catch {
      // Storage full/unavailable: keep working in-memory for this session.
    }
  }, [selections]);

  const setActiveService = useCallback(
    (
      serviceId: string | null | undefined,
      profile?: ChatToolProfile | null
    ) => {
      setActiveServiceId(serviceId ?? null);
      setActiveProfile(profile ?? null);
    },
    []
  );

  const hasCustomSelection =
    activeServiceId != null && selections[activeServiceId] !== undefined;

  // Stored selection when present, otherwise the profile-derived default.
  const selected = useMemo<ChatToolCategorySlug[]>(() => {
    if (activeServiceId != null && selections[activeServiceId] !== undefined) {
      return selections[activeServiceId];
    }
    return prefillForProfile(activeProfile);
  }, [activeServiceId, activeProfile, selections]);

  // Mirror the derived selection into a ref (in an effect, never during render)
  // so getSelected() can hand the latest value to callbacks created once.
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);
  const getSelected = useCallback(() => selectedRef.current, []);

  const setSelected = useCallback(
    (slugs: ChatToolCategorySlug[]) => {
      if (activeServiceId == null) return;
      // Dedupe and keep canonical order for a stable request payload.
      const set = new Set(slugs);
      const ordered = CHAT_TOOL_CATEGORY_SLUGS.filter((s) => set.has(s));
      setSelections((prev) => ({ ...prev, [activeServiceId]: ordered }));
    },
    [activeServiceId]
  );

  const toggle = useCallback(
    (slug: ChatToolCategorySlug) => {
      const set = new Set(selected);
      if (set.has(slug)) set.delete(slug);
      else set.add(slug);
      setSelected(Array.from(set));
    },
    [selected, setSelected]
  );

  const presetFull = useCallback(
    () => setSelected([...CHAT_TOOL_CATEGORY_SLUGS]),
    [setSelected]
  );
  const presetCore = useCallback(
    () => setSelected([...CORE_CHAT_TOOL_CATEGORY_SLUGS]),
    [setSelected]
  );
  const clearAll = useCallback(() => setSelected([]), [setSelected]);

  const value = useMemo<ChatToolCategoriesContextType>(
    () => ({
      allCategories: CHAT_TOOL_CATEGORY_SLUGS,
      coreCategories: CORE_CHAT_TOOL_CATEGORY_SLUGS,
      selected,
      getSelected,
      hasCustomSelection,
      setActiveService,
      setSelected,
      toggle,
      presetFull,
      presetCore,
      clearAll,
    }),
    [
      selected,
      getSelected,
      hasCustomSelection,
      setActiveService,
      setSelected,
      toggle,
      presetFull,
      presetCore,
      clearAll,
    ]
  );

  return (
    <ChatToolCategoriesContext.Provider value={value}>
      {children}
    </ChatToolCategoriesContext.Provider>
  );
};

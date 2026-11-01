import type {
  SymptomDefinitionResponse,
  SymptomEntryResponse,
  SymptomEpisodeContext,
  SymptomFreeDayResponse,
  SymptomOptionResponse,
} from '@workspace/shared';
import type { SymptomEntryFilters } from '@/api/Symptoms/symptomService';

/** Data the mocked symptom hooks return. Tests set fields, then render. */
export const hookState = {
  definitions: [] as SymptomDefinitionResponse[],
  options: [] as SymptomOptionResponse[],
  entries: [] as SymptomEntryResponse[],
  ongoing: [] as SymptomEntryResponse[],
  freeDays: [] as SymptomFreeDayResponse[],
  contexts: {} as Record<string, SymptomEpisodeContext>,
};

/** The filters each `useSymptomEntries` call asked for, in call order. */
export const entryQueries: Array<SymptomEntryFilters | undefined> = [];

const mutation = () => ({
  mutate: jest.fn(),
  mutateAsync: jest.fn(),
  isPending: false,
});

/** One spy per mutation, so a test can assert what a component asked to save. */
export const mutations = {
  createDefinition: mutation(),
  updateDefinition: mutation(),
  deleteDefinition: mutation(),
  createOption: mutation(),
  deleteOption: mutation(),
  createEntry: mutation(),
  updateEntry: mutation(),
  endEpisode: mutation(),
  addSeverity: mutation(),
  deleteEntry: mutation(),
  markFree: mutation(),
  unmarkFree: mutation(),
  uploadPhoto: mutation(),
  deletePhoto: mutation(),
};

export function resetSymptomHooks() {
  hookState.definitions = [];
  hookState.options = [];
  hookState.entries = [];
  hookState.ongoing = [];
  hookState.freeDays = [];
  hookState.contexts = {};
  entryQueries.length = 0;
  for (const m of Object.values(mutations)) {
    m.mutate.mockReset();
    m.mutateAsync.mockReset();
    m.isPending = false;
  }
}

/** The shape of `@/hooks/useSymptoms`, backed by `hookState` and `mutations`. */
export function buildHooksMock() {
  return {
    useCustomSymptoms: () => ({ data: hookState.definitions }),
    // The real hook asks the server for one kind; the mock filters the same way.
    useSymptomOptions: (kind?: string) => ({
      data: kind
        ? hookState.options.filter((o) => o.kind === kind)
        : hookState.options,
    }),
    useSymptomEntries: (filters?: SymptomEntryFilters) => {
      entryQueries.push(filters);
      return { data: hookState.entries, isLoading: false };
    },
    useOngoingEpisodes: () => ({ data: hookState.ongoing }),
    useSymptomFreeDays: () => ({ data: hookState.freeDays }),
    useSymptomContext: () => ({
      data: hookState.contexts,
      isLoading: false,
    }),
    useCreateCustomSymptomMutation: () => mutations.createDefinition,
    useUpdateCustomSymptomMutation: () => mutations.updateDefinition,
    useDeleteCustomSymptomMutation: () => mutations.deleteDefinition,
    useCreateSymptomOptionMutation: () => mutations.createOption,
    useDeleteSymptomOptionMutation: () => mutations.deleteOption,
    useCreateSymptomEntryMutation: () => mutations.createEntry,
    useUpdateSymptomEntryMutation: () => mutations.updateEntry,
    useEndEpisodeMutation: () => mutations.endEpisode,
    useAddSeverityMutation: () => mutations.addSeverity,
    useDeleteSymptomEntryMutation: () => mutations.deleteEntry,
    useMarkSymptomFreeMutation: () => mutations.markFree,
    useUnmarkSymptomFreeMutation: () => mutations.unmarkFree,
    useUploadSymptomPhotoMutation: () => mutations.uploadPhoto,
    useDeleteSymptomPhotoMutation: () => mutations.deletePhoto,
  };
}

export const ID = '550e8400-e29b-41d4-a716-446655440000';
export const ID2 = '660e8400-e29b-41d4-a716-446655440001';

export function makeEntry(
  overrides: Partial<SymptomEntryResponse> = {}
): SymptomEntryResponse {
  return {
    id: ID,
    user_id: ID2,
    medication_id: null,
    symptom_id: null,
    symptom_name_snapshot: 'Migraine',
    severity: 7,
    severity_label: 'Severe',
    logged_at: '2026-09-29T09:00:00.000Z',
    entry_date: '2026-09-29',
    started_at: null,
    ended_at: null,
    body_location: null,
    body_locations: [],
    qualities: [],
    associated_symptoms: [],
    triggers: [],
    phases: {},
    impact: null,
    peak_severity: 7,
    severity_timeline: [],
    context_text: null,
    bristol_type: null,
    source: 'manual',
    custom_fields: {},
    treatments: [],
    photo_ids: [],
    created_at: '2026-09-29T09:00:00.000Z',
    updated_at: '2026-09-29T09:00:00.000Z',
    ...overrides,
  };
}

export function makeDefinition(
  overrides: Partial<SymptomDefinitionResponse> = {}
): SymptomDefinitionResponse {
  return {
    id: ID,
    user_id: ID2,
    name: 'migraine',
    display_name: 'Migraine',
    scale_type: '1-10',
    unit: null,
    is_glp1_flagged: false,
    category: 'head',
    template: 'headache',
    sections: {},
    custom_field_defs: [],
    is_episodic: true,
    color: null,
    icon: null,
    is_pinned: false,
    sort_order: 0,
    is_archived: false,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

export function makeOption(
  overrides: Partial<SymptomOptionResponse> = {}
): SymptomOptionResponse {
  return {
    id: ID,
    user_id: ID2,
    kind: 'trigger',
    name: 'Red wine',
    sort_order: 0,
    is_hidden: false,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

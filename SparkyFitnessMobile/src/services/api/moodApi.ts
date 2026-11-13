import {
  MOOD_MODEL_VERSION,
  MOOD_MODEL_VERSION_HEADER,
  type MoodCheckinCreateBody,
  type MoodCheckinUpdateBody,
  type MoodRowSource,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

export interface MoodEntry {
  id: string;
  /** Null for a check-in logged with only energy, focus or a journal. */
  mood_value: number | null;
  mood_tags: string[] | null;
  notes: string | null;
  entry_date: string;
  /** The instant of the check-in; filled in for rows from older servers. */
  entry_timestamp: string;
  source: MoodRowSource;
  energy_value?: number | null;
  focus_value?: number | null;
}

export interface CustomMood {
  id: string;
  name: string;
  display_name: string | null;
  icon: string | null;
  color: string | null;
}

export interface SaveMoodEntryBody {
  mood_value: number;
  mood_tags: string[];
  notes: string;
  entry_date: string;
  /** Omit to leave the stored rating untouched; `null` clears it. */
  energy_value?: number | null;
  focus_value?: number | null;
}

const SERVICE = 'Mood API';

/** Asks the server for the several-check-ins-per-day contract; old servers ignore it. */
const MOOD_V2_HEADERS = {
  [MOOD_MODEL_VERSION_HEADER]: String(MOOD_MODEL_VERSION),
};

type RawMoodEntry = Omit<MoodEntry, 'source' | 'entry_timestamp'> &
  Partial<Pick<MoodEntry, 'source' | 'entry_timestamp'>> & {
    created_at?: string | null;
  };

/** Rows from old servers lack `source` and `entry_timestamp`; fill them in. */
const normalizeMoodEntry = (row: RawMoodEntry): MoodEntry => ({
  ...row,
  source: row.source ?? 'manual',
  entry_timestamp:
    row.entry_timestamp ?? row.created_at ?? `${row.entry_date}T12:00:00Z`,
});

const listMoodEntries = async (
  startDate: string,
  endDate: string,
  headers?: Record<string, string>
): Promise<MoodEntry[]> => {
  const rows = await apiFetch<RawMoodEntry[]>({
    endpoint: `/api/mood?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    serviceName: SERVICE,
    operation: 'list mood entries',
    ...(headers && { headers }),
  });
  return rows.map(normalizeMoodEntry);
};

export const fetchMoodEntries = (
  startDate: string,
  endDate: string
): Promise<MoodEntry[]> => listMoodEntries(startDate, endDate, MOOD_V2_HEADERS);

/**
 * The legacy one-entry-per-day read: no v2 header, so even a v2 server answers
 * with its single legacy row for the day.
 */
export const fetchLegacyMoodEntries = (
  startDate: string,
  endDate: string
): Promise<MoodEntry[]> => listMoodEntries(startDate, endDate);

/**
 * One day's check-ins. Null when the server answers with something other than
 * a list, which is how a server without several-check-ins-per-day replies.
 */
export const fetchMoodCheckinsForDate = async (
  date: string
): Promise<MoodEntry[] | null> => {
  const result = await apiFetch<unknown>({
    endpoint: `/api/mood/date/${encodeURIComponent(date)}`,
    serviceName: SERVICE,
    operation: 'list mood check-ins for a day',
    headers: MOOD_V2_HEADERS,
  });
  return Array.isArray(result)
    ? (result as RawMoodEntry[]).map(normalizeMoodEntry)
    : null;
};

export const createMoodCheckin = async (
  body: MoodCheckinCreateBody
): Promise<MoodEntry> =>
  normalizeMoodEntry(
    await apiFetch<RawMoodEntry>({
      endpoint: '/api/mood',
      serviceName: SERVICE,
      operation: 'create mood check-in',
      method: 'POST',
      body,
      headers: MOOD_V2_HEADERS,
    })
  );

export const updateMoodCheckin = async (
  id: string,
  body: MoodCheckinUpdateBody
): Promise<MoodEntry> =>
  normalizeMoodEntry(
    await apiFetch<RawMoodEntry>({
      endpoint: `/api/mood/${encodeURIComponent(id)}`,
      serviceName: SERVICE,
      operation: 'update mood check-in',
      method: 'PUT',
      body,
      headers: MOOD_V2_HEADERS,
    })
  );

export const deleteMoodCheckin = async (id: string): Promise<void> => {
  await apiFetch<void>({
    endpoint: `/api/mood/${encodeURIComponent(id)}`,
    serviceName: SERVICE,
    operation: 'delete mood check-in',
    method: 'DELETE',
    headers: MOOD_V2_HEADERS,
  });
};

/** The server keeps one entry per day, so saving again replaces that day's. */
export const saveMoodEntry = async (
  body: SaveMoodEntryBody
): Promise<MoodEntry> =>
  normalizeMoodEntry(
    await apiFetch<RawMoodEntry>({
      endpoint: '/api/mood',
      serviceName: SERVICE,
      operation: 'save mood entry',
      method: 'POST',
      body,
    })
  );

export const fetchCustomMoods = (): Promise<CustomMood[]> =>
  apiFetch<CustomMood[]>({
    endpoint: '/api/mood/custom',
    serviceName: SERVICE,
    operation: 'list custom moods',
  });

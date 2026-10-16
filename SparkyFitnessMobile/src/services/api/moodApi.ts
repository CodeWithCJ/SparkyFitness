import { apiFetch } from './apiClient';

export interface MoodEntry {
  id: string;
  mood_value: number;
  mood_tags: string[] | null;
  notes: string | null;
  entry_date: string;
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
}

const SERVICE = 'Mood API';

export const fetchMoodEntries = (
  startDate: string,
  endDate: string
): Promise<MoodEntry[]> =>
  apiFetch<MoodEntry[]>({
    endpoint: `/api/mood?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    serviceName: SERVICE,
    operation: 'list mood entries',
  });

/** The server keeps one entry per day, so saving again replaces that day's. */
export const saveMoodEntry = (body: SaveMoodEntryBody): Promise<MoodEntry> =>
  apiFetch<MoodEntry>({
    endpoint: '/api/mood',
    serviceName: SERVICE,
    operation: 'save mood entry',
    method: 'POST',
    body,
  });

export const fetchCustomMoods = (): Promise<CustomMood[]> =>
  apiFetch<CustomMood[]>({
    endpoint: '/api/mood/custom',
    serviceName: SERVICE,
    operation: 'list custom moods',
  });

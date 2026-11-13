import {
  MOOD_MODEL_VERSION,
  MOOD_MODEL_VERSION_HEADER,
  type MoodCheckinCreateBody,
  type MoodCheckinUpdateBody,
} from '@workspace/shared';
import { api } from '@/api/api';
import type { MoodEntry, CustomMood } from '@/types/mood';
import { debug, error } from '@/utils/logging';
import { getUserLoggingLevel } from '@/utils/userPreferences';

const MOOD_V2_OPTIONS = {
  headers: { [MOOD_MODEL_VERSION_HEADER]: String(MOOD_MODEL_VERSION) },
};

// --- Check-ins (several per day) --------------------------------------------

/** The day's manual check-ins in time order; empty when there are none. */
export const getMoodCheckinsByDate = (
  entryDate: string
): Promise<MoodEntry[]> => api.get(`/mood/date/${entryDate}`, MOOD_V2_OPTIONS);

export const createMoodCheckin = (
  body: MoodCheckinCreateBody
): Promise<MoodEntry> => api.post('/mood', { body, ...MOOD_V2_OPTIONS });

export const updateMoodCheckin = (
  id: string,
  body: MoodCheckinUpdateBody
): Promise<MoodEntry> => api.put(`/mood/${id}`, { body, ...MOOD_V2_OPTIONS });

export const deleteMoodCheckin = async (id: string): Promise<void> => {
  await api.delete(`/mood/${id}`, MOOD_V2_OPTIONS);
};

// --- Custom moods (user-defined mood tags) ---------------------------------

export const listCustomMoods = (): Promise<CustomMood[]> =>
  api.get('/mood/custom');

export const createCustomMood = (body: {
  name: string;
  display_name?: string;
  icon?: string;
  color?: string;
}): Promise<CustomMood> => api.post('/mood/custom', { body });

export const deleteCustomMood = (
  id: string,
  deleteAllHistory = false
): Promise<void> =>
  api.delete(`/mood/custom/${id}`, {
    params: { deleteAllHistory: deleteAllHistory ? 'true' : 'false' },
  });

// --- Mood display preferences (show/hide) ----------------------------------

export const getMoodDisplayPreferences = (): Promise<{
  hidden_moods: string[];
}> => api.get('/mood/display-preferences');

export const updateMoodDisplayPreferences = (
  hiddenMoods: string[]
): Promise<{ hidden_moods: string[] }> =>
  api.put('/mood/display-preferences', { body: { hidden_moods: hiddenMoods } });

interface MoodEntryParams {
  startDate: string;
  endDate: string;
  userId?: string;
}

export const getMoodEntries = async (
  startDate: string,
  endDate: string,
  userId?: string
): Promise<MoodEntry[]> => {
  try {
    const userLoggingLevel = getUserLoggingLevel();
    debug(userLoggingLevel, 'Fetching mood entries:', {
      userId,
      startDate,
      endDate,
    });
    const params: MoodEntryParams = { startDate, endDate };
    if (userId) params.userId = userId;
    const response = await api.get('/mood', {
      params,
      ...MOOD_V2_OPTIONS,
    });
    // Log the actual response data from the backend
    debug(
      userLoggingLevel,
      'moodService: Received response from /mood API:',
      response
    );
    return response;
  } catch (err) {
    error(
      getUserLoggingLevel(),
      'moodService: Error fetching mood entries:',
      err
    );
    throw err;
  }
};

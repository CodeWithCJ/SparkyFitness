import { api } from '@/api/api';
import type { MoodEntry, CustomMood } from '@/types/mood';
import { getErrorMessage } from '@/utils/api';
import { debug, info, error } from '@/utils/logging';
import { getUserLoggingLevel } from '@/utils/userPreferences';

export const saveMoodEntry = async (
  moodValue: number,
  notes: string,
  entryDate: string,
  moodTags?: string[]
): Promise<MoodEntry> => {
  try {
    const userLoggingLevel = getUserLoggingLevel();
    debug(userLoggingLevel, 'Sending mood entry:', {
      mood_value: moodValue,
      mood_tags: moodTags,
      notes,
      entry_date: entryDate,
    });
    const response = await api.post('/mood', {
      body: {
        mood_value: moodValue,
        mood_tags: moodTags,
        notes,
        entry_date: entryDate,
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error saving mood entry:', error);
    throw error;
  }
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

export const getMoodEntryByDate = async (
  entryDate: string
): Promise<MoodEntry | null> => {
  try {
    const userLoggingLevel = getUserLoggingLevel();
    debug(userLoggingLevel, 'Fetching mood entry by date:', { entryDate });
    const response = await api.get(`/mood/date/${entryDate}`, {
      suppress404Toast: true,
    });
    debug(userLoggingLevel, 'Response from getMoodEntryByDate API:', response);
    return response;
  } catch (err: unknown) {
    const message = getErrorMessage(err);
    if (message && message.includes('404')) {
      info(getUserLoggingLevel(), `No mood entry found for date ${entryDate}.`);
      return null;
    }
    error(getUserLoggingLevel(), 'Error fetching mood entry by date:', err);
    throw err;
  }
};

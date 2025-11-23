import { api } from './api';
import { MoodEntry } from '@/types/mood';
import { debug, info, warn, error } from '@/utils/logging'; // Import logging utility
import { getUserLoggingLevel } from "@/utils/userPreferences";

import { format } from 'date-fns'; // Import format from date-fns

export const saveMoodEntry = async (moodValue: number, notes: string, entryDate: string): Promise<MoodEntry> => {
  try {
    const userLoggingLevel = getUserLoggingLevel();
    debug(userLoggingLevel, "Sending mood entry:", { mood_value: moodValue, notes, entry_date: entryDate });
    const response = await api.post('/mood', { body: { mood_value: moodValue, notes, entry_date: entryDate } });
    return response.data;
  } catch (error) {
    console.error('Error saving mood entry:', error);
    throw error;
  }
};

export const getMoodEntries = async (userId: string, startDate: string, endDate: string): Promise<MoodEntry[]> => {
  try {
    const userLoggingLevel = getUserLoggingLevel();
    debug(userLoggingLevel, "Fetching mood entries:", { userId, startDate, endDate });
    const response = await api.get('/mood', {
      params: { userId, startDate, endDate },
    });
    // Log the actual response data from the backend
    debug(userLoggingLevel, 'moodService: Received response from /mood API:', response);
    return response;
  } catch (err) {
    error(getUserLoggingLevel(), 'moodService: Error fetching mood entries:', err);
    throw err;
  }
};

export const getMoodEntryByDate = async (entryDate: string): Promise<MoodEntry | null> => {
  try {
    const userLoggingLevel = getUserLoggingLevel();
    debug(userLoggingLevel, "Fetching mood entry by date:", { entryDate });
    const response = await api.get(`/mood/date/${entryDate}`, { suppress404Toast: true });
    debug(userLoggingLevel, "Response from getMoodEntryByDate API:", response);
    return response;
  } catch (err: any) {
    if (err.message && err.message.includes('404')) {
      info(getUserLoggingLevel(), `No mood entry found for date ${entryDate}.`);
      return null;
    }
    error(getUserLoggingLevel(), 'Error fetching mood entry by date:', err);
    throw err;
  }
};


export const getMoodEntryById = async (id: string): Promise<MoodEntry> => {
  try {
    const response = await api.get(`/mood/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching mood entry by ID:', error);
    throw error;
  }
};

export const updateMoodEntry = async (id: string, moodValue: number | null, notes: string, entryDate: string): Promise<MoodEntry> => {
  try {
    const userLoggingLevel = getUserLoggingLevel();
    debug(userLoggingLevel, "Updating mood entry:", { id, mood_value: moodValue, notes, entry_date: entryDate });
    const response = await api.put(`/mood/${id}`, { body: { mood_value: moodValue, notes, entry_date: entryDate } });
    return response.data;
  } catch (error) {
    console.error('Error updating mood entry:', error);
    throw error;
  }
};

export const deleteMoodEntry = async (id: string): Promise<void> => {
  try {
    await api.delete(`/mood/${id}`);
  } catch (error) {
    console.error('Error deleting mood entry:', error);
    throw error;
  }
};
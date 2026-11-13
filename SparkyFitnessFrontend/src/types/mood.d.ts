import type { MoodRowSource } from '@workspace/shared';

export interface MoodEntry {
  id: string;
  user_id: string;
  mood_value: number | null;
  mood_tags: string[];
  notes: string | null;
  energy_value: number | null;
  focus_value: number | null;
  entry_date: string;
  entry_timestamp: string;
  source: MoodRowSource;
  created_at: string;
  updated_at: string;
}

export interface CustomMood {
  id: string;
  user_id: string;
  name: string;
  display_name: string | null;
  icon: string | null;
  color: string | null;
}

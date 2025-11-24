export interface MoodEntry {
  id: string;
  user_id: string;
  mood_value: number;
  notes: string | null;
  entry_date: string;
  created_at: string;
  updated_at: string;
}
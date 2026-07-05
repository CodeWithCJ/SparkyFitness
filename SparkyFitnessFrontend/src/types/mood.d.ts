export interface MoodEntry {
  id: string;
  user_id: string;
  mood_value: number;
  mood_tags: string[];
  notes: string | null;
  entry_date: string;
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

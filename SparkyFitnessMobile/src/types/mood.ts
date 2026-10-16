/** One row of `GET /api/mood`. `mood_value` is the 0-100 intensity; `mood_tags` the chosen moods. */
export interface MoodEntry {
  id: string;
  /** Calendar day (`YYYY-MM-DD`). */
  entry_date: string;
  mood_value: number;
  mood_tags: string[] | null;
  notes: string | null;
}

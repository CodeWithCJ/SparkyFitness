export interface FastingLog {
  id: string;
  user_id: string;
  start_time: string;
  end_time: string | null;
  target_end_time: string | null;
  duration_minutes: number | null;
  fasting_type: string;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  // mood and weight are stored in dedicated tables; fasting_logs no longer contains these fields
  mood_value?: number;
  mood_notes?: string;
  created_at: string;
  updated_at: string;
}

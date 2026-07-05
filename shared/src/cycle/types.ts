// Shared types for the Cycle & Pregnancy hub. Kept framework-free so both the
// server and the web (and, later, mobile) can depend on them.

export type CycleMode =
  | "standard"
  | "ttc"
  | "pregnant"
  | "postpartum"
  | "menopause";

export type FlowLevel = "none" | "spotting" | "light" | "medium" | "heavy";

export type CyclePhase =
  | "menstrual"
  | "follicular"
  | "fertile"
  | "ovulation"
  | "luteal"
  | "unknown";

export type PredictionConfidence = "high" | "medium" | "low";

export type RegularityLabel = "regular" | "somewhat" | "irregular" | "unknown";

export interface SharedCycleSettings {
  id?: string;
  user_id?: string;
  enabled: boolean;
  mode: CycleMode;
  avg_cycle_length_override?: number | null;
  avg_period_length_override?: number | null;
  luteal_phase_length: number;
  birth_control_method: string;
  conditions: string[];
  show_fertile_window: boolean;
  preferred_products: string[];
  dismissed_prompts: string[];
  terminology: "default" | "neutral";
  discreet_mode: boolean;
  onboarded_at?: string | null;
}

export interface SharedCycleDailyLog {
  id?: string;
  user_id?: string;
  entry_date: string; // YYYY-MM-DD
  flow_level?: FlowLevel | null;
  product_usage: Record<string, number>;
  /** Hydrated from the basal_body_temperature custom measurement, not stored on the cycle log. */
  bbt?: number | null; // canonical °C
  cervical_mucus?: string | null;
  unusual_discharge: string[];
  energy?: number | null; // 1-5
  libido?: number | null; // 1-5
  notes?: string | null;
  intercourse?: boolean | null;
  intercourse_protected?: boolean | null;
  cervical_position?: string | null;
  custom_fields?: Record<string, unknown>;
}

export interface SharedCycleTestEntry {
  id: string;
  user_id: string;
  entry_date: string; // YYYY-MM-DD
  tested_at: string; // ISO timestamp
  test_type: 'opk' | 'hpt';
  result: string; // opk: negative|low|high|peak, hpt: negative|faint|positive
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface SharedCycle {
  id?: string;
  user_id?: string;
  start_date: string; // YYYY-MM-DD
  end_date?: string | null; // day before next cycle start; null = current
  period_length?: number | null;
  cycle_length?: number | null;
  is_excluded: boolean;
  source: "derived" | "manual";
  birth_control_method?: string | null;
}

/** A single derived cycle before it is persisted. */
export interface DerivedCycle {
  start_date: string;
  end_date: string | null;
  period_length: number | null;
  cycle_length: number | null;
}

export interface CycleStats {
  avgCycleLength: number;
  medianCycleLength: number;
  cycleLengthSd: number;
  avgPeriodLength: number;
  regularity: RegularityLabel;
  sampleSize: number; // number of completed cycles used
}

export interface PredictedCycle {
  periodStart: string;
  periodEnd: string;
  ovulation: string | null;
  fertileStart: string | null;
  fertileEnd: string | null;
  confidence: PredictionConfidence;
}

export interface CyclePrediction {
  cycles: PredictedCycle[];
  basis: "history" | "settings" | "bc-bleed";
  confidence: PredictionConfidence;
}

export interface DayEvidence {
  date: string; // YYYY-MM-DD
  flow_level?: FlowLevel | null;
  product_usage?: Record<string, number> | null;
}

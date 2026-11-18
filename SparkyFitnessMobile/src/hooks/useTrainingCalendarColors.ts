import { useCSSVariable } from 'uniwind';
import type { LoadSportGroup, PlannedStatus } from '@workspace/shared';
import {
  EXTRA_COLOR_VAR,
  MUTED_ICON_COLOR_VAR,
  SPORT_COLOR_VARS,
  STATUS_COLOR_VARS,
} from '../utils/trainingCalendar';

export interface TrainingCalendarColors {
  sport: Record<LoadSportGroup, string>;
  status: Record<PlannedStatus, string>;
  extra: string;
  /** Neutral glyphs: chevrons, the info icon, legend icons. */
  mutedIcon: string;
}

const SPORTS = Object.keys(SPORT_COLOR_VARS) as LoadSportGroup[];
const STATUSES = Object.keys(STATUS_COLOR_VARS) as PlannedStatus[];

/**
 * The training calendar's sport and status colours for the active theme (Light,
 * Dark or AMOLED), read from the `global.css` tokens.
 */
export function useTrainingCalendarColors(): TrainingCalendarColors {
  const values = useCSSVariable([
    ...SPORTS.map((sport) => SPORT_COLOR_VARS[sport]),
    ...STATUSES.map((status) => STATUS_COLOR_VARS[status]),
    EXTRA_COLOR_VAR,
    MUTED_ICON_COLOR_VAR,
  ]) as string[];
  const sport = {} as Record<LoadSportGroup, string>;
  const status = {} as Record<PlannedStatus, string>;
  SPORTS.forEach((key, i) => {
    sport[key] = values[i] ?? '';
  });
  STATUSES.forEach((key, i) => {
    status[key] = values[SPORTS.length + i] ?? '';
  });
  return {
    sport,
    status,
    extra: values[SPORTS.length + STATUSES.length] ?? '',
    mutedIcon: values[SPORTS.length + STATUSES.length + 1] ?? '',
  };
}

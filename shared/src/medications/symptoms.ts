export interface SharedSymptomEntry {
  id: string;
  user_id: string;
  medication_id?: string | null;
  symptom_id?: string | null;
  symptom_name_snapshot: string;
  severity: number;
  severity_label?: string | null;
  logged_at: string;
  entry_date: string;
  body_location?: string | null;
  context_text?: string | null;
  bristol_type?: number | null;
}

export interface SharedUserCustomSymptom {
  id: string;
  user_id: string;
  name: string;
  display_name: string | null;
  scale_type: '1-10' | 'none-severe' | 'count' | 'text';
  unit?: string | null;
  is_glp1_flagged: boolean;
}

export const BUILT_IN_SYMPTOMS = [
  { name: 'nausea', displayName: 'Nausea', isGlp1: true },
  { name: 'fatigue', displayName: 'Fatigue', isGlp1: true },
  { name: 'headache', displayName: 'Headache', isGlp1: false },
  { name: 'constipation', displayName: 'Constipation', isGlp1: true },
  { name: 'diarrhea', displayName: 'Diarrhea', isGlp1: true },
  { name: 'vomiting', displayName: 'Vomiting', isGlp1: true },
  { name: 'acid_reflux', displayName: 'Acid Reflux / GERD', isGlp1: true },
  { name: 'stomach_pain', displayName: 'Stomach Pain / Cramping', isGlp1: true },
  { name: 'dizziness', displayName: 'Dizziness', isGlp1: false },
];

/**
 * Correlates logged symptom entries with the most recent GLP-1 injection entry.
 * Generates descriptive pattern hints based on hours-elapsed logic.
 */
export function getSymptomPatternHints(
  injections: Array<{ injected_at: string; dose_mg?: number | null; medication_name?: string }>,
  symptoms: Array<{ logged_at: string; severity: number; symptom_name_snapshot: string }>
): Array<{
  symptomName: string;
  message: string;
  severityLevel: 'low' | 'medium' | 'high';
}> {
  const hints: Array<{ symptomName: string; message: string; severityLevel: 'low' | 'medium' | 'high' }> = [];
  if (injections.length === 0 || symptoms.length === 0) return hints;

  // Group symptoms by name
  const symptomsByName: Record<string, typeof symptoms> = {};
  for (const s of symptoms) {
    const key = s.symptom_name_snapshot.toLowerCase().trim();
    if (!symptomsByName[key]) {
      symptomsByName[key] = [];
    }
    symptomsByName[key].push(s);
  }

  // Calculate correlation for each symptom
  for (const [name, list] of Object.entries(symptomsByName)) {
    let totalHours = 0;
    let count = 0;

    for (const s of list) {
      const symMs = new Date(s.logged_at).getTime();
      let closestInj: typeof injections[0] | null = null;
      let minDiffMs = Infinity;

      for (const inj of injections) {
        const injMs = new Date(inj.injected_at).getTime();
        const diffMs = symMs - injMs;
        // Looking for the most recent injection prior to the symptom log (within a 7-day window)
        if (diffMs >= 0 && diffMs < minDiffMs && diffMs <= 7 * 24 * 3600 * 1000) {
          minDiffMs = diffMs;
          closestInj = inj;
        }
      }

      if (closestInj) {
        totalHours += minDiffMs / (3600 * 1000);
        count++;
      }
    }

    if (count > 0) {
      const avgHours = totalHours / count;
      const roundedHours = Math.round(avgHours);
      const displayName = name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');

      let message = '';
      let severityLevel: 'low' | 'medium' | 'high' = 'low';

      if (roundedHours <= 24) {
        message = `${displayName} tends to onset within 24 hours of your injection (average ${roundedHours}h).`;
        severityLevel = 'medium';
      } else if (roundedHours <= 48) {
        message = `${displayName} peaks 24 to 48 hours following your injection (average ${roundedHours}h).`;
        severityLevel = 'medium';
      } else {
        message = `${displayName} is typically reported ${roundedHours} hours after your injection.`;
        severityLevel = 'low';
      }

      // If average severity is high, raise alert severity
      const avgSeverity = list.reduce((sum, s) => sum + s.severity, 0) / list.length;
      if (avgSeverity >= 7) {
        severityLevel = 'high';
      }

      hints.push({
        symptomName: name,
        message,
        severityLevel,
      });
    }
  }

  return hints;
}

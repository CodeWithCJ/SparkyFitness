import pregnancyRepository from '../models/pregnancyRepository.js';
import {
  gestationalAge,
  babyWeek,
  checklistForWeek,
  contractionStats,
  eddFromLmp,
  eddFromConception,
  weightGainRange,
  addDays,
  localDateToDay,
  type SharedContraction,
} from '@workspace/shared';

interface ChecklistRow {
  id: string;
  template_key: string | null;
  custom_title: string | null;
  week: number;
  completed_at: string | null;
  dismissed: boolean;
}

/** Resolve a due date from whichever basis the client supplied. */
export function resolveDueDate(input: {
  due_date?: string;
  due_date_basis?: string;
  lmp_date?: string | null;
  conception_date?: string | null;
}): string | null {
  if (input.due_date) return input.due_date;
  if (input.lmp_date) return eddFromLmp(input.lmp_date);
  if (input.conception_date) return eddFromConception(input.conception_date);
  return null;
}

async function getOverview(userId: string, today: string, date?: string) {
  const targetDate = date ?? today;
  const pregnancy = await pregnancyRepository.getActivePregnancy(userId);
  if (!pregnancy) {
    return { pregnancy: null };
  }

  const dueDate = normalizeDay(pregnancy.due_date);
  const TERM_DAYS = 280;
  const lmp = addDays(dueDate, -TERM_DAYS);
  const gestation = gestationalAge(dueDate, targetDate);
  const baby = babyWeek(gestation.week);

  // Merge checklist templates for the current week with persisted state.
  const stateRows = (await pregnancyRepository.listChecklist(
    userId,
    pregnancy.id
  )) as ChecklistRow[];
  const stateByKey = new Map(
    stateRows.filter((r) => r.template_key).map((r) => [r.template_key, r])
  );
  const templates = checklistForWeek(gestation.week).map((tpl) => {
    const st = stateByKey.get(tpl.key);
    return {
      id: st?.id ?? null,
      template_key: tpl.key,
      title: tpl.title,
      week: tpl.weekStart,
      completed: !!st?.completed_at,
      dismissed: !!st?.dismissed,
    };
  });
  const customItems = stateRows
    .filter((r) => !r.template_key && !r.dismissed)
    .map((r) => ({
      id: r.id,
      template_key: null,
      title: r.custom_title ?? '',
      week: r.week,
      completed: !!r.completed_at,
      dismissed: r.dismissed,
    }));
  const checklist = [...templates, ...customItems].filter((i) => !i.dismissed);

  const appointments = await pregnancyRepository.listAppointments(userId, true);
  const nextAppointment = appointments[0] ?? null;

  const kickSessions = await pregnancyRepository.listKickSessions(userId, 7);

  // Calculate vitals
  const vitalsData = await pregnancyRepository.getVitalsData(
    userId,
    targetDate,
    lmp
  );

  let prePregnancyBmi = null;
  let weightGainStatus: 'within_range' | 'below_range' | 'above_range' | null =
    null;
  let gainRange = null;

  if (vitalsData.prePregnancyWeight && vitalsData.height) {
    const heightM = vitalsData.height / 100;
    prePregnancyBmi = vitalsData.prePregnancyWeight / (heightM * heightM);

    gainRange = weightGainRange(
      prePregnancyBmi,
      gestation.week,
      pregnancy.fetus_count
    );
    if (gainRange && vitalsData.latestWeight) {
      const delta = vitalsData.latestWeight - vitalsData.prePregnancyWeight;
      if (delta < gainRange.lowKg) {
        weightGainStatus = 'below_range';
      } else if (delta > gainRange.highKg) {
        weightGainStatus = 'above_range';
      } else {
        weightGainStatus = 'within_range';
      }
    }
  }

  const bpValue = await pregnancyRepository.getLatestBpCustomMeasurement(
    userId,
    targetDate
  );

  let prenatalMed = null;
  if (pregnancy.prenatal_medication_id) {
    const medName = await pregnancyRepository.getMedicationName(
      userId,
      pregnancy.prenatal_medication_id
    );
    const entryId = await pregnancyRepository.getMedicationLogStatus(
      userId,
      pregnancy.prenatal_medication_id,
      targetDate
    );
    prenatalMed = {
      id: pregnancy.prenatal_medication_id,
      name: medName,
      entryId,
      loggedToday: !!entryId,
    };
  }

  let supplementMed = null;
  if (pregnancy.supplement_medication_id) {
    const medName = await pregnancyRepository.getMedicationName(
      userId,
      pregnancy.supplement_medication_id
    );
    const entryId = await pregnancyRepository.getMedicationLogStatus(
      userId,
      pregnancy.supplement_medication_id,
      targetDate
    );
    supplementMed = {
      id: pregnancy.supplement_medication_id,
      name: medName,
      entryId,
      loggedToday: !!entryId,
    };
  }

  const vitals = {
    latestWeight: vitalsData.latestWeight,
    prePregnancyWeight: vitalsData.prePregnancyWeight,
    height: vitalsData.height,
    prePregnancyBmi: prePregnancyBmi
      ? Math.round(prePregnancyBmi * 10) / 10
      : null,
    weightDelta:
      vitalsData.latestWeight && vitalsData.prePregnancyWeight
        ? Math.round(
            (vitalsData.latestWeight - vitalsData.prePregnancyWeight) * 10
          ) / 10
        : null,
    weightGainStatus,
    gainRange,
    bpValue,
    prenatalMedication: prenatalMed,
    supplementMedication: supplementMed,
  };

  return {
    pregnancy,
    date: targetDate,
    gestation,
    baby,
    checklist,
    checklistProgress: {
      done: checklist.filter((i) => i.completed).length,
      total: checklist.length,
    },
    nextAppointment,
    recentKickSessions: kickSessions,
    vitals,
  };
}

async function getContractionAnalysis(userId: string) {
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const rows = (await pregnancyRepository.listContractions(
    userId,
    since
  )) as SharedContraction[];
  return {
    contractions: rows,
    stats: contractionStats(rows),
  };
}

function normalizeDay(value: string | Date): string {
  // pg returns DATE columns as local-midnight Date objects; use the shared
  // helper (local getters), never UTC/toISOString which shift the day.
  if (value instanceof Date) return localDateToDay(value);
  return value.slice(0, 10);
}

export default {
  getOverview,
  getContractionAnalysis,
  resolveDueDate,
};

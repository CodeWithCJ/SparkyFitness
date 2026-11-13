import { findFoodByExactName } from './tools/foodNameResolution.js';
import foodRepository from '../models/foodRepository.js';
import { getExerciseEntryById } from '../models/exerciseEntry.js';
import { getWorkoutPresetById } from '../models/workoutPresetRepository.js';
import { getWorkoutPlanTemplateById } from '../models/workoutPlanTemplateRepository.js';
import { getMealPlanTemplatesByUserId } from '../models/mealPlanTemplateRepository.js';
import medicationRepository from '../models/medicationRepository.js';
import { getEntryById } from '../models/medicationEntryRepository.js';
import { getWaterContainerById } from '../models/waterContainerRepository.js';
import { getCustomSymptomById } from '../models/symptomRepository.js';
import { listPreferences } from '../models/foodAssistantRepository.js';
import { getRunProgram } from '../models/runProgramRepository.js';
import customNutrientService from '../services/customNutrientService.js';
import allergenPreferenceService from '../services/allergenPreferenceService.js';
import favoritesService from '../services/favoritesService.js';
import { getAllPhotosWithWeight } from '../services/checkInPhotoService.js';
import { normalizeActionArgs } from './tools/dates.js';
import { OWN_ACCOUNT_ONLY_TOOLS } from './tools/ownAccountOnlyTools.js';
import { withFixedActor } from '../db/poolManager.js';
import {
  DESTRUCTIVE_ACTIONS,
  isDestructiveToolCall,
} from './chatToolApproval.js';

export type ApprovalSummary = { text: string; kind: 'delete' | 'change' };
type Row = Record<string, unknown>;
function row(value: unknown): Row | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Row)
    : undefined;
}
function rows(value: unknown): Row[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const record = row(item);
        return record ? [record] : [];
      })
    : [];
}
function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value).trim()
    : '';
}
function shortDay(value: unknown): string {
  const day =
    value instanceof Date
      ? value
      : typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
        ? new Date(`${value.slice(0, 10)}T12:00:00Z`)
        : undefined;
  return day && Number.isFinite(day.getTime())
    ? new Intl.DateTimeFormat('en', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      }).format(day)
    : '';
}
function describe(record: Row): string {
  const name = text(
    record.food_name ||
      record.med_name_snapshot ||
      record.exercise_name ||
      record.display_name ||
      record.plan_name ||
      record.name ||
      record.allergen_name ||
      record.value ||
      record.key
  );
  if (!name) return '';
  const amount = [
    text(record.quantity ?? record.dose_amount_snapshot),
    text(record.unit ?? record.dose_unit_snapshot),
  ]
    .filter(Boolean)
    .join(' ');
  return [
    name,
    amount.length < 20 ? amount : '',
    text(record.meal_type),
    shortDay(record.entry_date),
  ]
    .filter(Boolean)
    .join(', ');
}

// Only database-owned names become an approval summary. A failed read must never
// turn model-provided arguments into a claim about what will be deleted.
export async function getChatApprovalSummary(
  name: string,
  input: unknown,
  userId: string,
  actorUserId: string = userId
): Promise<ApprovalSummary | undefined> {
  if (!isDestructiveToolCall(name, input)) return undefined;
  // Same boundary as the tool itself: some repositories pin the actor to the
  // account owner, so a family member's chat must not read them at all.
  if (actorUserId !== userId && OWN_ACCOUNT_ONLY_TOOLS.has(name))
    return undefined;
  return withFixedActor(actorUserId, () => summarize(name, input, userId));
}

async function summarize(
  name: string,
  input: unknown,
  userId: string
): Promise<ApprovalSummary | undefined> {
  const args =
    row(
      normalizeActionArgs(input, 'UTC', [
        ...(DESTRUCTIVE_ACTIONS[name] ?? []),
        'set_food_notes',
        'update_entry',
        'update_medication',
        'set_run_program_schedule',
      ])
    ) ?? {};
  const action = text(args.action);
  // Inference lives in each executor. Without that exact inference, an ID
  // cannot establish which operation (or target) will actually be used.
  if (!action) return undefined;
  if (
    !DESTRUCTIVE_ACTIONS[name]?.includes(action) &&
    !(
      name === 'sparky_manage_food' &&
      action === 'set_food_notes' &&
      typeof args.notes === 'string' &&
      args.notes.trim() === ''
    ) &&
    !(
      name === 'sparky_manage_medications' &&
      ['update_entry', 'update_medication'].includes(action) &&
      (args.notes === null || args.notes === '')
    ) &&
    !(
      name === 'sparky_manage_run_program' &&
      action === 'set_run_program_schedule' &&
      args.end_date === null
    )
  )
    return undefined;
  const id = (key: string) => text(args[key]);
  let target: Row | undefined;
  let phrase: string | undefined;
  let kind: ApprovalSummary['kind'] = 'delete';
  try {
    switch (name) {
      case 'sparky_manage_food':
        if (
          action === 'delete_entry' &&
          (!args.entry_type || args.entry_type === 'food_entry') &&
          id('entry_id')
        ) {
          target = row(
            await foodRepository.getFoodEntryById(id('entry_id'), userId)
          );
        } else if (['delete_food', 'set_food_notes'].includes(action)) {
          target = row(
            id('food_id')
              ? await foodRepository.getFoodById(id('food_id'), userId)
              : id('food_name')
                ? await findFoodByExactName(userId, id('food_name'))
                : undefined
          );
        }
        break;
      case 'sparky_manage_medications':
        if (['delete_entry', 'update_entry'].includes(action) && id('entry_id'))
          target = row(await getEntryById(userId, id('entry_id')));
        else if (
          ['delete_medication', 'update_medication'].includes(action) &&
          id('medication_id')
        )
          target = row(
            await medicationRepository.getMedicationById(
              userId,
              id('medication_id')
            )
          );
        else if (action === 'delete_schedule' && id('schedule_id')) {
          const meds = rows(await medicationRepository.listMedications(userId));
          target = meds.find((med) =>
            rows(med.schedules).some(
              (schedule) => schedule.id === id('schedule_id')
            )
          );
          const schedule = rows(target?.schedules).find(
            (item) => item.id === id('schedule_id')
          );
          if (target)
            phrase = [describe(target), 'schedule', text(schedule?.time_of_day)]
              .filter(Boolean)
              .join(', ');
        }
        break;
      case 'sparky_manage_exercise':
        target = row(
          action === 'delete_exercise_entry' && id('entry_id')
            ? await getExerciseEntryById(id('entry_id'), userId)
            : action === 'delete_workout_preset' && id('preset_id')
              ? await getWorkoutPresetById(id('preset_id'), userId)
              : undefined
        );
        break;
      case 'sparky_manage_meal_plans':
        target = rows(await getMealPlanTemplatesByUserId(userId)).find(
          (item) => item.id === id('plan_id')
        );
        break;
      case 'sparky_manage_workout_plans':
        if (id('plan_id'))
          target = row(await getWorkoutPlanTemplateById(id('plan_id'), userId));
        break;
      case 'sparky_manage_water_containers':
        if (id('id'))
          target = row(await getWaterContainerById(Number(id('id')), userId));
        break;
      case 'sparky_manage_symptoms':
        if (id('id'))
          target = row(await getCustomSymptomById(userId, id('id')));
        break;
      case 'sparky_manage_custom_nutrients':
        if (id('id'))
          target = row(
            await customNutrientService.getCustomNutrientById(userId, id('id'))
          );
        break;
      case 'sparky_manage_allergens':
        target = rows(
          await allergenPreferenceService.getAllergenPreferences(userId)
        ).find((item) => item.id === id('id'));
        break;
      case 'sparky_manage_favorites': {
        const favorites = row(await favoritesService.getFavorites(userId));
        target = rows(
          args.type === 'meal'
            ? favorites?.favoriteMeals
            : favorites?.favoriteFoods
        ).find((item) => item.id === id('id'));
        if (target) phrase = `Favorite: ${describe(target)}`;
        break;
      }
      case 'sparky_manage_progress_photos': {
        target = row(
          (await getAllPhotosWithWeight(userId)).find(
            (item) => item.id === id('photo_id')
          )
        );
        if (target)
          phrase = ['Progress photo', shortDay(target.entry_date)]
            .filter(Boolean)
            .join(', ');
        break;
      }
      case 'sparky_food_assistant_state':
        target = rows(await listPreferences(userId)).find(
          (item) => item.key === id('key')
        );
        break;
      case 'sparky_manage_run_program': {
        if (
          ![
            'start_run_program',
            'realign_run_program',
            'set_run_program_schedule',
          ].includes(action)
        )
          break;
        const program = await getRunProgram(userId);
        if (!program) break;
        kind = 'change';
        phrase =
          action === 'set_run_program_schedule'
            ? `Remove the end date of ${program.name || 'your run program'}`
            : 'Replace your current run program';
        break;
      }
    }
    const description = phrase ?? (target ? describe(target) : '');
    if (!description) return undefined;
    const clearNotes =
      action === 'set_food_notes' ||
      (['update_entry', 'update_medication'].includes(action) &&
        (args.notes === null || args.notes === ''));
    const summary = clearNotes ? `Clear notes on ${description}` : description;
    return {
      text: summary
        .replace(/\p{Cc}/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80),
      kind: clearNotes ? 'change' : kind,
    };
  } catch {
    return undefined;
  }
}

import { tool } from 'ai';
import { todayInZone } from '@workspace/shared';
import { log } from '../../config/logging.js';
import medicationRepository from '../../models/medicationRepository.js';
import medicationEntryRepository from '../../models/medicationEntryRepository.js';
import injectionRepository from '../../models/injectionRepository.js';
import { ERRORS, formatZodError } from './errors.js';
import { dayString, formatConfirmation, formatList } from './formatting.js';
import { normalizeActionArgs } from './dates.js';
import {
  manageMedicationsSchema,
  manageMedicationsInput,
  type ManageMedicationsInput,
} from './schemas/medications.js';

interface MedicationSummary {
  id: string;
  display_name: string | null;
  name: string;
}

interface ScheduleSummary {
  time_of_day: string | null;
}

interface MedicationRow {
  id: string;
  display_name: string | null;
  name: string;
  strength_value: number | null;
  strength_unit: string | null;
  is_active: boolean;
  schedules: ScheduleSummary[];
}

interface MedicationDetailRow extends MedicationRow {
  dose_amount: number | null;
  dose_unit: string | null;
  is_glp1: boolean;
  reason_text: string | null;
  notes: string | null;
  schedules: {
    time_of_day: string | null;
    active: boolean | null;
    dose_amount: number | null;
    prn_reason: string | null;
  }[];
}

interface MedicationEntryRow {
  status: string;
  med_name_snapshot: string | null;
  entry_date: string;
  dose_amount_snapshot: number | null;
  dose_unit_snapshot: string | null;
  notes: string | null;
  entry_type: string | null;
}

interface InjectionRow {
  entry_date: string;
  dose_mg: number | null;
  site: string | null;
  notes: string | null;
}

interface InjectionWithPenRow extends InjectionRow {
  pen: {
    doses_used: number;
    doses_total: number | null;
  } | null;
}

interface PreProcessedArgs {
  action?: string;
  entry_date?: string;
  date?: string;
  dosage?: number;
  dosage_unit?: string;
  dose_amount_snapshot?: number;
  dose_unit_snapshot?: string;
  medication_id?: string;
  medication_name?: string;
  status?: string;
  taken_at?: string;
  notes?: string | null;
  glp1_only?: boolean;
  active_only?: boolean;
  from_date?: string;
  to_date?: string;
  dose_mg?: number;
  site?: string;
  deduct_pen?: boolean;
  entry_id?: string;
}

const VALID_ACTIONS = [
  'list_medications',
  'get_medication',
  'log',
  'list_entries',
  'update_entry',
  'delete_entry',
  'log_injection',
  'list_injections',
];

async function resolveMedicationId(
  userId: string,
  nameOrId: string | undefined
): Promise<string | null> {
  if (!nameOrId) return null;
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRe.test(nameOrId)) return nameOrId;
  const meds: MedicationSummary[] = await medicationRepository.listMedications(
    userId,
    {}
  );
  const q = nameOrId.trim().toLowerCase();
  const match = meds.find(
    (m) => (m.display_name || m.name).toLowerCase() === q
  );
  return match?.id ?? null;
}

export function buildMedicationTools(userId: string, tz: string) {
  return {
    sparky_manage_medications: tool({
      description: `Medication tracking: list medications, log doses, and view history.

Actions:
- list_medications(glp1_only?, active_only?)
- get_medication(medication_id)
- log(medication_id?|medication_name?, status?, taken_at?, entry_date?, dosage?, dosage_unit?, notes?)
- list_entries(medication_id?, from_date?, to_date?)
- update_entry(entry_id, status?, taken_at?, entry_date?, notes?)
- delete_entry(entry_id)
- log_injection(medication_id?|medication_name?, dose_mg?, site?, deduct_pen?, entry_date?, notes?)
- list_injections(medication_id?, from_date?, to_date?)`,
      inputSchema: manageMedicationsInput,
      execute: async (rawArgs) => {
        const normalized = normalizeActionArgs(
          rawArgs,
          tz,
          VALID_ACTIONS,
          (args: Record<string, unknown>) => {
            if (args.entry_id) {
              if (
                args.status !== undefined ||
                args.taken_at !== undefined ||
                args.entry_date !== undefined ||
                args.notes !== undefined
              ) {
                return 'update_entry';
              }
              return 'delete_entry';
            }
            if (args.site || args.dose_mg || args.deduct_pen !== undefined) {
              return 'log_injection';
            }
            if (args.medication_name || args.dosage !== undefined) return 'log';
            if (args.status) return 'log';
            if (args.medication_id) {
              if (args.from_date || args.to_date) return 'list_entries';
              return 'get_medication';
            }
            if (args.from_date || args.to_date) return 'list_injections';
            if (
              args.glp1_only !== undefined ||
              args.active_only !== undefined
            ) {
              return 'list_medications';
            }
            return 'list_medications';
          }
        ) as PreProcessedArgs;

        if (normalized.date && !normalized.entry_date) {
          normalized.entry_date = normalized.date;
        }
        delete normalized.date;

        if (
          normalized.dosage !== undefined &&
          normalized.dose_amount_snapshot === undefined
        ) {
          normalized.dose_amount_snapshot = normalized.dosage;
        }
        delete normalized.dosage;

        if (normalized.dosage_unit && !normalized.dose_unit_snapshot) {
          normalized.dose_unit_snapshot = normalized.dosage_unit;
        }
        delete normalized.dosage_unit;

        if (normalized.medication_name && !normalized.medication_id) {
          const resolvedId = await resolveMedicationId(
            userId,
            normalized.medication_name
          );
          if (!resolvedId) {
            return ERRORS.VALIDATION(
              `Medication "${normalized.medication_name}" not found.`
            );
          }
          normalized.medication_id = resolvedId;
          delete normalized.medication_name;
        }

        const parsed = manageMedicationsSchema.safeParse(normalized);
        if (!parsed.success) return formatZodError(parsed.error);
        const args: ManageMedicationsInput = parsed.data;
        try {
          switch (args.action) {
            case 'list_medications': {
              const meds: MedicationRow[] =
                await medicationRepository.listMedications(userId, {
                  glp1Only: args.glp1_only,
                  activeOnly: args.active_only,
                });
              return formatList(meds, 'Medications', (m) => {
                let text = `**${m.display_name || m.name}**`;
                if (m.strength_value && m.strength_unit) {
                  text += ` — ${m.strength_value}${m.strength_unit}`;
                }
                if (!m.is_active) text += ' (inactive)';
                text += `\n  ID: ${m.id}`;
                const schedules = m.schedules || [];
                if (schedules.length > 0) {
                  const times = schedules
                    .map((s) => s.time_of_day || 'as needed')
                    .join(', ');
                  text += `\n  Schedules: ${times}`;
                }
                return text;
              });
            }
            case 'get_medication': {
              const med: MedicationDetailRow | null =
                await medicationRepository.getMedicationById(
                  userId,
                  args.medication_id
                );
              if (!med)
                return ERRORS.NOT_FOUND('Medication', args.medication_id);
              let text = `**${med.display_name || med.name}**`;
              if (med.strength_value && med.strength_unit) {
                text += ` — ${med.strength_value}${med.strength_unit}`;
              }
              if (med.dose_amount && med.dose_unit) {
                text += `\nDose: ${med.dose_amount} ${med.dose_unit}`;
              }
              text += `\nActive: ${med.is_active ? 'Yes' : 'No'}`;
              if (med.is_glp1) text += '\nType: GLP-1';
              if (med.reason_text) text += `\nReason: ${med.reason_text}`;
              if (med.notes) text += `\nNotes: ${med.notes}`;
              text += `\nID: ${med.id}`;
              const schedules = med.schedules || [];
              if (schedules.length > 0) {
                text += '\n\n**Schedules:**';
                for (const s of schedules) {
                  text += `\n- ${s.time_of_day || 'Any time'}`;
                  if (!s.active) text += ' (inactive)';
                  if (s.dose_amount) text += ` | ${s.dose_amount} mg`;
                  if (s.prn_reason) text += ` | PRN: ${s.prn_reason}`;
                }
              }
              return text;
            }
            case 'log': {
              if (!args.entry_date) args.entry_date = todayInZone(tz);
              if (!args.taken_at) args.taken_at = new Date().toISOString();
              const entry: MedicationEntryRow =
                await medicationEntryRepository.createEntry(userId, {
                  medication_id: args.medication_id!,
                  status: args.status,
                  taken_at: args.taken_at,
                  entry_date: args.entry_date!,
                  dose_amount_snapshot: args.dose_amount_snapshot ?? undefined,
                  dose_unit_snapshot: args.dose_unit_snapshot ?? undefined,
                  notes: args.notes ?? null,
                });
              let detail = `"${entry.status}"`;
              if (entry.dose_amount_snapshot) {
                detail += ` (${entry.dose_amount_snapshot} ${entry.dose_unit_snapshot || ''})`;
              }
              return formatConfirmation(
                `Dose logged as ${detail} for ${entry.med_name_snapshot} on ${dayString(entry.entry_date)}.`
              );
            }
            case 'list_entries': {
              const entries: MedicationEntryRow[] =
                await medicationEntryRepository.listEntriesWithInjections(
                  userId,
                  {
                    fromDate: args.from_date,
                    toDate: args.to_date,
                    medicationId: args.medication_id,
                  }
                );
              return formatList(entries, 'Medication Entries', (e) => {
                const icon =
                  e.status === 'taken'
                    ? '✅'
                    : e.status === 'skipped'
                      ? '❌'
                      : e.status === 'snoozed'
                        ? '⏰'
                        : '💊';
                let text = `${icon} ${e.med_name_snapshot || 'Unknown'} — ${e.status} on ${dayString(e.entry_date)}`;
                if (e.dose_amount_snapshot) {
                  text += ` (${e.dose_amount_snapshot} ${e.dose_unit_snapshot || ''})`;
                }
                if (e.notes) text += ` — ${e.notes}`;
                if (e.entry_type === 'injection') text += ' [injection]';
                return text;
              });
            }
            case 'update_entry': {
              const entry: MedicationEntryRow | null =
                await medicationEntryRepository.updateEntry(
                  userId,
                  args.entry_id,
                  {
                    status: args.status,
                    taken_at: args.taken_at,
                    entry_date: args.entry_date,
                    notes: args.notes !== undefined ? args.notes : undefined,
                  }
                );
              if (!entry) return ERRORS.NOT_FOUND('Entry', args.entry_id);
              return formatConfirmation(
                `Entry updated (${entry.status}) for ${entry.med_name_snapshot} on ${dayString(entry.entry_date)}.`
              );
            }
            case 'delete_entry': {
              const ok = await medicationEntryRepository.deleteEntry(
                userId,
                args.entry_id
              );
              if (!ok) return ERRORS.NOT_FOUND('Entry', args.entry_id);
              return formatConfirmation('Entry deleted.');
            }
            case 'log_injection': {
              if (!args.entry_date) args.entry_date = todayInZone(tz);
              const injection: InjectionWithPenRow =
                await injectionRepository.createInjection(userId, {
                  medication_id: args.medication_id!,
                  dose_mg: args.dose_mg,
                  site: args.site ?? null,
                  deduct_pen: args.deduct_pen,
                  entry_date: args.entry_date!,
                  notes: args.notes ?? null,
                });
              let text = `Injection logged (${injection.dose_mg} mg) for ${dayString(injection.entry_date)}.`;
              if (injection.pen) {
                text += ` Pen: ${injection.pen.doses_used}/${injection.pen.doses_total ?? '?'} doses used.`;
              }
              return formatConfirmation(text);
            }
            case 'list_injections': {
              const injections: InjectionRow[] =
                await injectionRepository.listInjections(userId, {
                  medicationId: args.medication_id,
                  fromDate: args.from_date,
                  toDate: args.to_date,
                });
              return formatList(
                injections,
                'Injections',
                (i) =>
                  `${dayString(i.entry_date)}: ${i.dose_mg} mg${i.site ? ` at ${i.site}` : ''}${i.notes ? ` — ${i.notes}` : ''}`
              );
            }
            default:
              return ERRORS.INVALID_ACTION(
                (args as { action?: string }).action ?? 'unknown',
                VALID_ACTIONS
              );
          }
        } catch (error) {
          log('error', '[Medication Tool] Error:', error);
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}

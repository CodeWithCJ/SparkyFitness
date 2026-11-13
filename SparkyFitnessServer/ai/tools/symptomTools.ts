import { tool } from 'ai';
import { todayInZone, type TreatmentEffectiveness } from '@workspace/shared';
import { log } from '../../config/logging.js';
import symptomService from '../../services/symptomService.js';
import { ERRORS, formatZodError } from './errors.js';
import { normalizeActionArgs } from './dates.js';
import {
  dayString,
  formatConfirmation,
  formatList,
  formatSuccess,
} from './formatting.js';
import {
  manageSymptomsSchema,
  manageSymptomsInput,
  type ManageSymptomsInput,
} from './schemas/symptoms.js';

const VALID_ACTIONS = [
  'list_definitions',
  'create_definition',
  'update_definition',
  'delete_definition',
  'log_entry',
  'start_episode',
  'update_severity',
  'end_episode',
  'list_entries',
  'get_ongoing',
  'mark_symptom_free',
  'list_options',
  'create_option',
  'get_metrics',
];

export function buildSymptomTools(userId: string, tz: string) {
  return {
    sparky_manage_symptoms: tool({
      description:
        'Manage and track symptoms, episodes (e.g. migraines, headaches, pain, flare-ups), severity timeline, symptom-free days, options, and relief treatments.',
      inputSchema: manageSymptomsInput,
      execute: async (rawArgs: Record<string, unknown>) => {
        const normalized = normalizeActionArgs(rawArgs, tz, VALID_ACTIONS);
        const parsed = manageSymptomsSchema.safeParse(normalized);
        if (!parsed.success) {
          return formatZodError(parsed.error);
        }
        const input: ManageSymptomsInput = parsed.data;

        try {
          switch (input.action) {
            case 'list_definitions': {
              const defs = await symptomService.listDefinitions(userId);
              if (defs.length === 0) {
                return 'No custom symptom definitions found.';
              }
              return formatList(
                defs,
                'Symptom Definitions',
                (d) =>
                  `• ${d.name} (${d.category}, template: ${d.template}, scale: ${d.scale_type}${d.is_episodic ? ', episodic' : ''})`
              );
            }

            case 'create_definition': {
              const created = await symptomService.createDefinition(userId, {
                name: input.name,
                category: input.category,
                template: input.template,
                scale_type: input.scale_type,
                unit: input.unit,
                is_episodic: input.is_episodic,
                color: input.color,
                icon: input.icon,
                is_pinned: input.is_pinned,
              });
              return formatConfirmation(
                `Created symptom definition "${created.name}" (ID: ${created.id}).`
              );
            }

            case 'update_definition': {
              const updated = await symptomService.updateDefinition(
                userId,
                input.id,
                {
                  name: input.name,
                  category: input.category,
                  template: input.template,
                  scale_type: input.scale_type,
                  unit: input.unit,
                  is_episodic: input.is_episodic,
                  is_pinned: input.is_pinned,
                  is_archived: input.is_archived,
                }
              );
              return formatConfirmation(
                `Updated symptom definition "${updated.name}".`
              );
            }

            case 'delete_definition': {
              await symptomService.deleteDefinition(userId, input.id);
              return formatSuccess('Symptom definition deleted successfully.');
            }

            case 'log_entry': {
              const entryDate =
                input.entry_date ||
                (input.started_at ? undefined : todayInZone(tz));
              const entry = await symptomService.createEntry(userId, {
                symptom_name_snapshot: input.symptom_name,
                symptom_id: input.symptom_id ?? null,
                severity: input.severity ?? null,
                entry_date: entryDate,
                started_at: input.started_at ?? null,
                ended_at: input.ended_at ?? null,
                body_locations: input.body_locations ?? [],
                qualities: input.qualities ?? [],
                associated_symptoms: input.associated_symptoms ?? [],
                triggers: input.triggers ?? [],
                impact: input.impact ?? null,
                context_text: input.context_text ?? null,
                treatments: (input.treatments ?? []).map((t) => ({
                  name_snapshot: t.name_snapshot,
                  kind: t.kind ?? 'relief',
                  effectiveness: (t.effectiveness === 'unknown'
                    ? null
                    : t.effectiveness) as TreatmentEffectiveness | null,
                  taken_at: t.taken_at ?? null,
                  notes: t.notes ?? null,
                })),
              });
              const details = [
                input.severity !== null && input.severity !== undefined
                  ? `Severity: ${input.severity}`
                  : null,
                input.body_locations?.length
                  ? `Locations: ${input.body_locations.join(', ')}`
                  : null,
                input.triggers?.length
                  ? `Triggers: ${input.triggers.join(', ')}`
                  : null,
              ]
                .filter(Boolean)
                .join(' | ');

              return formatConfirmation(
                `Logged ${input.symptom_name} for ${dayString(entry.entry_date)}${details ? ` (${details})` : ''}. Entry ID: ${entry.id}`
              );
            }

            case 'start_episode': {
              const startedAt = input.started_at || new Date().toISOString();
              const entry = await symptomService.createEntry(userId, {
                symptom_name_snapshot: input.symptom_name,
                symptom_id: input.symptom_id ?? null,
                severity: input.severity ?? null,
                started_at: startedAt,
                body_locations: input.body_locations ?? [],
                qualities: input.qualities ?? [],
                associated_symptoms: input.associated_symptoms ?? [],
                triggers: input.triggers ?? [],
                impact: input.impact ?? null,
                context_text: input.context_text ?? null,
                treatments: (input.treatments ?? []).map((t) => ({
                  name_snapshot: t.name_snapshot,
                  kind: t.kind ?? 'relief',
                  effectiveness: (t.effectiveness === 'unknown'
                    ? null
                    : t.effectiveness) as TreatmentEffectiveness | null,
                  taken_at: t.taken_at ?? null,
                  notes: t.notes ?? null,
                })),
              });
              return formatConfirmation(
                `Started ongoing episode for ${input.symptom_name} at ${new Date(startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Entry ID: ${entry.id}`
              );
            }

            case 'update_severity': {
              const updated = await symptomService.addSeverity(
                userId,
                input.id,
                {
                  severity: input.severity,
                  at: input.at || new Date().toISOString(),
                  ...(input.impact ? { impact: input.impact } : {}),
                }
              );
              return formatConfirmation(
                `Recorded severity ${input.severity}${input.impact ? ` and impact ${input.impact}` : ''} for episode. Current peak severity: ${updated.peak_severity}.`
              );
            }

            case 'end_episode': {
              const ended = await symptomService.endEpisode(userId, input.id, {
                ended_at: input.ended_at || new Date().toISOString(),
                treatments: input.treatments?.map((t) => ({
                  name_snapshot: t.name_snapshot,
                  kind: t.kind ?? 'relief',
                  effectiveness: (t.effectiveness === 'unknown'
                    ? null
                    : t.effectiveness) as TreatmentEffectiveness | null,
                  taken_at: t.taken_at ?? null,
                  notes: t.notes ?? null,
                })),
              });
              return formatConfirmation(
                `Ended episode for ${ended.symptom_name_snapshot || 'symptom'}. Total duration recorded.`
              );
            }

            case 'list_entries': {
              const entries = await symptomService.listEntries(userId, {
                fromDate: input.from,
                toDate: input.to,
                symptomId: input.symptom_id,
                episodesOnly: input.episodes_only,
              });
              if (entries.length === 0) {
                return 'No symptom entries found for the specified criteria.';
              }
              return formatList(
                entries.slice(0, 20),
                `Symptom Entries (${entries.length} total, showing latest ${Math.min(entries.length, 20)})`,
                (e) => {
                  const name = e.symptom_name_snapshot || 'Symptom';
                  const sev =
                    e.severity !== null && e.severity !== undefined
                      ? ` · Severity ${e.severity}`
                      : '';
                  const ongoing =
                    e.started_at && !e.ended_at ? ' [ONGOING]' : '';
                  const locs = e.body_locations.length
                    ? ` (${e.body_locations.join(', ')})`
                    : '';
                  return `• ${dayString(e.entry_date)}: ${name}${sev}${ongoing}${locs}`;
                }
              );
            }

            case 'get_ongoing': {
              const ongoing = await symptomService.listOngoing(userId);
              if (ongoing.length === 0) {
                return 'No ongoing symptom episodes active right now.';
              }
              return formatList(ongoing, 'Active Ongoing Episodes', (e) => {
                const name = e.symptom_name_snapshot || 'Episode';
                const started = e.started_at
                  ? new Date(e.started_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '';
                const sev =
                  e.severity !== null && e.severity !== undefined
                    ? ` · Severity: ${e.severity}`
                    : '';
                return `• ${name} (Started ${started}${sev}) [ID: ${e.id}]`;
              });
            }

            case 'mark_symptom_free': {
              const targetDate = input.entry_date || todayInZone(tz);
              await symptomService.markSymptomFree(userId, targetDate);
              return formatConfirmation(
                `Marked ${dayString(targetDate)} as a symptom-free day.`
              );
            }

            case 'list_options': {
              const options = await symptomService.listOptions(
                userId,
                input.kind
              );
              if (options.length === 0) {
                return 'No custom symptom options found.';
              }
              return formatList(
                options,
                'Symptom Options',
                (o) => `• [${o.kind}] ${o.name}`
              );
            }

            case 'create_option': {
              const opt = await symptomService.createOption(userId, {
                kind: input.kind,
                name: input.name,
              });
              return formatConfirmation(
                `Created option "${opt.name}" for ${opt.kind}.`
              );
            }

            case 'get_metrics': {
              const entries = await symptomService.listEntries(userId, {
                fromDate: input.from,
                toDate: input.to,
              });
              const symptomDays = new Set(entries.map((e) => e.entry_date))
                .size;
              const episodeCount = entries.filter(
                (e) => e.started_at !== null && e.started_at !== undefined
              ).length;
              return formatConfirmation(
                `Symptom metrics from ${input.from} to ${input.to}: ${symptomDays} symptom day(s), ${episodeCount} episode(s), ${entries.length} total logged entries.`
              );
            }

            default: {
              const actionName =
                (input as { action?: string }).action ?? 'unknown';
              return ERRORS.INVALID_ACTION(actionName, VALID_ACTIONS);
            }
          }
        } catch (error) {
          log(
            'error',
            `sparky_manage_symptoms failed for user ${userId}`,
            error
          );
          return ERRORS.DB_ERROR(error);
        }
      },
    }),
  };
}

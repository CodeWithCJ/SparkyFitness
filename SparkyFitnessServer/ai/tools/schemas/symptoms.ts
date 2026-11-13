import { z } from 'zod';
import { dateSchema, optionalDateSchema } from './common.js';

const scaleTypeEnum = z.enum(['1-5', '1-10', 'none-severe', 'count', 'text']);
const templateEnum = z.enum([
  'generic',
  'headache',
  'pain',
  'gi',
  'respiratory',
  'skin',
  'mental',
]);
const categoryEnum = z.enum([
  'general',
  'head',
  'pain',
  'gi',
  'respiratory',
  'skin',
  'mental',
  'other',
]);
const optionKindEnum = z.enum([
  'location',
  'head_location',
  'quality',
  'associated',
  'trigger',
  'relief',
]);
const effectivenessEnum = z.enum(['none', 'partial', 'full', 'unknown']);

const listDefinitionsSchema = z
  .object({
    action: z.literal('list_definitions'),
  })
  .strict();

const createDefinitionSchema = z
  .object({
    action: z.literal('create_definition'),
    name: z
      .string()
      .min(1)
      .max(100)
      .describe('Symptom name (e.g. Migraine, Lower Back Pain)'),
    category: categoryEnum.optional().describe('Symptom category'),
    template: templateEnum
      .optional()
      .describe('Template to use for UI sections'),
    scale_type: scaleTypeEnum
      .optional()
      .describe('Severity scale: 1-5, 1-10, none-severe, count, text'),
    unit: z.string().max(30).optional().describe('Unit for count-based scales'),
    is_episodic: z
      .boolean()
      .optional()
      .describe('Whether symptom occurs as duration-based episodes'),
    color: z.string().max(30).optional().describe('Color token or hex code'),
    icon: z.string().max(50).optional().describe('Icon identifier'),
    is_pinned: z.boolean().optional().describe('Pin to top of quick-log list'),
  })
  .strict();

const updateDefinitionSchema = z
  .object({
    action: z.literal('update_definition'),
    id: z.string().min(1).describe('Symptom definition ID'),
    name: z.string().min(1).max(100).optional(),
    category: categoryEnum.optional(),
    template: templateEnum.optional(),
    scale_type: scaleTypeEnum.optional(),
    unit: z.string().max(30).optional(),
    is_episodic: z.boolean().optional(),
    is_pinned: z.boolean().optional(),
    is_archived: z.boolean().optional(),
  })
  .strict();

const deleteDefinitionSchema = z
  .object({
    action: z.literal('delete_definition'),
    id: z.string().min(1).describe('Symptom definition ID'),
  })
  .strict();

const logEntryTreatmentSchema = z.object({
  name_snapshot: z
    .string()
    .min(1)
    .max(150)
    .describe('Treatment/medication name'),
  kind: z.enum(['medication', 'relief']).default('relief'),
  effectiveness: effectivenessEnum.optional(),
  taken_at: z.string().datetime({ offset: true }).optional(),
  notes: z.string().max(500).optional(),
});

const logEntrySchema = z
  .object({
    action: z.literal('log_entry'),
    symptom_name: z
      .string()
      .min(1)
      .max(100)
      .describe('Symptom name (e.g. Headache, Migraine, Nausea)'),
    symptom_id: z
      .string()
      .uuid()
      .meta({ pattern: undefined })
      .optional()
      .describe('Optional custom symptom ID'),
    severity: z.number().min(0).max(10).optional().describe('Severity rating'),
    entry_date: optionalDateSchema.describe(
      'Calendar date (YYYY-MM-DD), defaults to today'
    ),
    started_at: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe('ISO timestamp when symptom started'),
    ended_at: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe('ISO timestamp when symptom ended'),
    body_locations: z
      .array(z.string())
      .optional()
      .describe(
        'Body or head locations (e.g. forehead, behind left eye, lower back)'
      ),
    qualities: z
      .array(z.string())
      .optional()
      .describe('Pain/symptom qualities (e.g. throbbing, sharp, dull)'),
    associated_symptoms: z
      .array(z.string())
      .optional()
      .describe(
        'Associated symptoms (e.g. aura, nausea, sensitivity to light)'
      ),
    triggers: z
      .array(z.string())
      .optional()
      .describe('Triggers (e.g. poor sleep, stress, caffeine)'),
    impact: z
      .enum(['none', 'mild', 'moderate', 'severe'])
      .optional()
      .describe('Impact on daily activities'),
    context_text: z.string().max(2000).optional().describe('Notes or context'),
    treatments: z
      .array(logEntryTreatmentSchema)
      .optional()
      .describe('Treatments or medications taken'),
  })
  .strict();

const startEpisodeSchema = z
  .object({
    action: z.literal('start_episode'),
    symptom_name: z
      .string()
      .min(1)
      .max(100)
      .describe('Symptom name (e.g. Migraine, Panic Attack)'),
    symptom_id: z
      .string()
      .uuid()
      .meta({ pattern: undefined })
      .optional()
      .describe('Custom symptom definition ID if known'),
    severity: z.number().min(0).max(10).optional().describe('Initial severity'),
    started_at: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe('Start ISO timestamp, defaults to now'),
    body_locations: z.array(z.string()).optional(),
    qualities: z.array(z.string()).optional(),
    associated_symptoms: z.array(z.string()).optional(),
    triggers: z.array(z.string()).optional(),
    impact: z.enum(['none', 'mild', 'moderate', 'severe']).optional(),
    context_text: z.string().max(2000).optional(),
    treatments: z.array(logEntryTreatmentSchema).optional(),
  })
  .strict();

const updateSeveritySchema = z
  .object({
    action: z.literal('update_severity'),
    id: z.string().min(1).describe('Symptom entry ID'),
    severity: z.number().min(0).max(10).describe('New severity level'),
    at: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe('ISO timestamp of measurement, defaults to now'),
    impact: z
      .enum(['none', 'mild', 'moderate', 'severe'])
      .optional()
      .describe(
        'Impact on daily life at the same moment; omit to leave it unchanged'
      ),
  })
  .strict();

const endEpisodeSchema = z
  .object({
    action: z.literal('end_episode'),
    id: z.string().min(1).describe('Symptom entry ID'),
    ended_at: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe('ISO timestamp when ended, defaults to now'),
    treatments: z
      .array(logEntryTreatmentSchema)
      .optional()
      .describe('Additional or updated treatments with effectiveness'),
  })
  .strict();

const listEntriesSchema = z
  .object({
    action: z.literal('list_entries'),
    from: optionalDateSchema.describe('Start date (YYYY-MM-DD)'),
    to: optionalDateSchema.describe('End date (YYYY-MM-DD)'),
    symptom_id: z.string().min(1).optional(),
    episodes_only: z
      .boolean()
      .optional()
      .describe('Filter to episodic entries only'),
  })
  .strict();

const getOngoingSchema = z
  .object({
    action: z.literal('get_ongoing'),
  })
  .strict();

const markSymptomFreeSchema = z
  .object({
    action: z.literal('mark_symptom_free'),
    entry_date: optionalDateSchema.describe(
      'Calendar date (YYYY-MM-DD) to mark as symptom-free, defaults to today'
    ),
  })
  .strict();

const listOptionsSchema = z
  .object({
    action: z.literal('list_options'),
    kind: optionKindEnum.optional().describe('Filter options by kind'),
  })
  .strict();

const createOptionSchema = z
  .object({
    action: z.literal('create_option'),
    kind: optionKindEnum.describe('Kind of option'),
    name: z
      .string()
      .min(1)
      .max(100)
      .describe('Name of option (e.g. Left Temple, Red Wine)'),
  })
  .strict();

const getMetricsSchema = z
  .object({
    action: z.literal('get_metrics'),
    from: dateSchema.describe('Start date (YYYY-MM-DD)'),
    to: dateSchema.describe('End date (YYYY-MM-DD)'),
  })
  .strict();

export const manageSymptomsSchema = z.discriminatedUnion('action', [
  listDefinitionsSchema,
  createDefinitionSchema,
  updateDefinitionSchema,
  deleteDefinitionSchema,
  logEntrySchema,
  startEpisodeSchema,
  updateSeveritySchema,
  endEpisodeSchema,
  listEntriesSchema,
  getOngoingSchema,
  markSymptomFreeSchema,
  listOptionsSchema,
  createOptionSchema,
  getMetricsSchema,
]);

export type ManageSymptomsInput = z.infer<typeof manageSymptomsSchema>;

export const manageSymptomsInput = z.object({
  action: z
    .enum([
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
    ])
    .describe('The action to perform with symptoms'),
  symptom_name: z
    .string()
    .optional()
    .describe('Symptom name (e.g. Migraine, Lower Back Pain, Nausea)'),
  symptom_id: z.string().optional().describe('Custom symptom definition ID'),
  id: z.string().optional().describe('Symptom entry or definition ID'),
  severity: z.number().optional().describe('Severity level (e.g. 1-10)'),
  entry_date: z
    .string()
    .optional()
    .describe('Date for the log or metric (YYYY-MM-DD)'),
  started_at: z
    .string()
    .optional()
    .describe('ISO timestamp when symptom/episode started'),
  ended_at: z
    .string()
    .optional()
    .describe('ISO timestamp when symptom/episode ended'),
  body_locations: z
    .array(z.string())
    .optional()
    .describe('List of affected body or head locations'),
  qualities: z
    .array(z.string())
    .optional()
    .describe('Pain/symptom qualities (e.g. throbbing, dull, sharp)'),
  associated_symptoms: z
    .array(z.string())
    .optional()
    .describe('Associated symptoms (e.g. aura, nausea, photophobia)'),
  triggers: z
    .array(z.string())
    .optional()
    .describe('Triggers (e.g. stress, lack of sleep, red wine)'),
  impact: z
    .enum(['none', 'mild', 'moderate', 'severe'])
    .optional()
    .describe('Impact on daily activities'),
  context_text: z.string().optional().describe('Notes, context or description'),
  treatments: z
    .array(
      z.object({
        name_snapshot: z.string(),
        kind: z.enum(['medication', 'relief']).optional(),
        effectiveness: effectivenessEnum.optional(),
        notes: z.string().optional(),
      })
    )
    .optional()
    .describe('Treatments or medications taken and effectiveness'),
  name: z.string().optional().describe('Name for definition or option'),
  category: categoryEnum.optional().describe('Category for custom symptom'),
  template: templateEnum.optional().describe('Template for custom symptom'),
  scale_type: scaleTypeEnum
    .optional()
    .describe('Scale type for custom symptom'),
  unit: z.string().optional().describe('Unit for count-based scale'),
  is_episodic: z.boolean().optional().describe('Whether symptom is episodic'),
  is_pinned: z.boolean().optional().describe('Pin symptom'),
  is_archived: z.boolean().optional().describe('Archive symptom'),
  kind: optionKindEnum
    .optional()
    .describe('Kind for option (location, trigger, relief, etc.)'),
  from: z.string().optional().describe('Start date (YYYY-MM-DD)'),
  to: z.string().optional().describe('End date (YYYY-MM-DD)'),
  episodes_only: z
    .boolean()
    .optional()
    .describe('Filter episodic entries only'),
});

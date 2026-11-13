import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  instantToDay,
  todayInZone,
  validateCustomFieldValues,
} from '@workspace/shared';
import type {
  SymptomCustomFieldDef,
  SymptomDefinitionResponse,
  SymptomEntryResponse,
  SymptomOptionResponse,
  SymptomTreatmentResponse,
} from '@workspace/shared';
import symptomRepository from '../models/symptomRepository.js';
import type {
  SymptomDefinitionRow,
  SymptomEntryRow,
  SymptomEntryWithDetails,
  SymptomEntryWrite,
  SymptomTreatmentRow,
} from '../models/symptomRepository.js';
import symptomOptionRepository from '../models/symptomOptionRepository.js';
import type { SymptomOptionRow } from '../models/symptomOptionRepository.js';
import type {
  AddSymptomSeverityBody,
  CreateCustomSymptomBody,
  CreateSymptomEntryBody,
  CreateSymptomOptionBody,
  EndSymptomEpisodeBody,
  ListSymptomEntriesQuery,
  UpdateCustomSymptomBody,
  UpdateSymptomEntryBody,
  UpdateSymptomOptionBody,
} from '../schemas/symptomSchemas.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';
import {
  resolveUploadPath,
  resolveUploadPathWithinRoot,
} from '../utils/uploadsPath.js';
import { ValidationError } from '../utils/errors.js';
import { log } from '../config/logging.js';

export class SymptomNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SymptomNotFoundError';
  }
}

export class SymptomConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SymptomConflictError';
  }
}

const MAX_PHOTOS_PER_ENTRY = 10;
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_CHECK_VIOLATION = '23514';

// --- Response mapping --------------------------------------------------------

const iso = (value: Date | string | null): string | null =>
  value === null ? null : value instanceof Date ? value.toISOString() : value;

function toDefinitionResponse(
  row: SymptomDefinitionRow
): SymptomDefinitionResponse {
  return {
    ...row,
    scale_type: row.scale_type as SymptomDefinitionResponse['scale_type'],
    category: row.category as SymptomDefinitionResponse['category'],
    template: row.template as SymptomDefinitionResponse['template'],
    custom_field_defs:
      row.custom_field_defs as SymptomDefinitionResponse['custom_field_defs'],
    created_at: iso(row.created_at) as string,
    updated_at: iso(row.updated_at) as string,
  };
}

function toOptionResponse(row: SymptomOptionRow): SymptomOptionResponse {
  return {
    ...row,
    kind: row.kind as SymptomOptionResponse['kind'],
    created_at: iso(row.created_at) as string,
    updated_at: iso(row.updated_at) as string,
  };
}

function toTreatmentResponse(
  row: SymptomTreatmentRow
): SymptomTreatmentResponse {
  return {
    ...row,
    kind: row.kind as SymptomTreatmentResponse['kind'],
    effectiveness:
      row.effectiveness as SymptomTreatmentResponse['effectiveness'],
    taken_at: iso(row.taken_at),
    created_at: iso(row.created_at) as string,
  };
}

function toEntryResponse(row: SymptomEntryWithDetails): SymptomEntryResponse {
  return {
    ...row,
    impact: row.impact as SymptomEntryResponse['impact'],
    impact_timeline: (row.impact_timeline ??
      []) as SymptomEntryResponse['impact_timeline'],
    logged_at: iso(row.logged_at) as string,
    started_at: iso(row.started_at),
    ended_at: iso(row.ended_at),
    treatments: row.treatments.map(toTreatmentResponse),
    created_at: iso(row.created_at) as string,
    updated_at: iso(row.updated_at) as string,
  };
}

/** Turns a database rejection caused by bad client input into a ValidationError. */
function rethrowClientError(error: unknown): never {
  const code = (error as { code?: string } | null)?.code;
  if (code === PG_FOREIGN_KEY_VIOLATION) {
    throw new ValidationError(
      'A referenced symptom, medication or dose does not exist'
    );
  }
  if (code === PG_CHECK_VIOLATION) {
    throw new ValidationError('The entry has an invalid value');
  }
  throw error;
}

// --- Definitions -------------------------------------------------------------

async function listDefinitions(userId: string) {
  const rows = await symptomRepository.listCustomSymptoms(userId);
  return rows.map(toDefinitionResponse);
}

async function createDefinition(userId: string, body: CreateCustomSymptomBody) {
  return toDefinitionResponse(
    await symptomRepository.createCustomSymptom(userId, body)
  );
}

async function updateDefinition(
  userId: string,
  id: string,
  body: UpdateCustomSymptomBody
) {
  const row = await symptomRepository.updateCustomSymptom(userId, id, body);
  if (!row) throw new SymptomNotFoundError('Custom symptom not found');
  return toDefinitionResponse(row);
}

async function deleteDefinition(userId: string, id: string): Promise<void> {
  const ok = await symptomRepository.deleteCustomSymptom(userId, id);
  if (!ok) throw new SymptomNotFoundError('Custom symptom not found');
}

// --- Options -----------------------------------------------------------------

async function listOptions(userId: string, kind?: string) {
  const rows = await symptomOptionRepository.listSymptomOptions(userId, kind);
  return rows.map(toOptionResponse);
}

async function createOption(userId: string, body: CreateSymptomOptionBody) {
  return toOptionResponse(
    await symptomOptionRepository.createSymptomOption(userId, body)
  );
}

async function updateOption(
  userId: string,
  id: string,
  body: UpdateSymptomOptionBody
) {
  try {
    const row = await symptomOptionRepository.updateSymptomOption(
      userId,
      id,
      body
    );
    if (!row) throw new SymptomNotFoundError('Symptom option not found');
    return toOptionResponse(row);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new SymptomConflictError('An option with that name already exists');
    }
    throw error;
  }
}

async function deleteOption(userId: string, id: string): Promise<void> {
  const ok = await symptomOptionRepository.deleteSymptomOption(userId, id);
  if (!ok) throw new SymptomNotFoundError('Symptom option not found');
}

// --- Entries -----------------------------------------------------------------

function assertEpisodeOrder(
  startedAt: string | Date | null | undefined,
  endedAt: string | Date | null | undefined
): void {
  if (!startedAt || !endedAt) return;
  if (new Date(endedAt).getTime() < new Date(startedAt).getTime()) {
    throw new ValidationError('The end time cannot be before the start time');
  }
}

/** Rejects custom-field values that do not match the symptom's field definitions. */
async function assertCustomFields(
  userId: string,
  symptomId: string | null | undefined,
  values: Record<string, unknown> | null | undefined
): Promise<void> {
  if (!symptomId || !values) return;
  const definition = await symptomRepository.getCustomSymptomById(
    userId,
    symptomId
  );
  if (!definition) return;
  const problems = validateCustomFieldValues(
    definition.custom_field_defs as SymptomCustomFieldDef[],
    values
  );
  if (problems.length > 0) throw new ValidationError(problems.join('; '));
}

/** Keeps the legacy single `body_location` and the multi-select array in step. */
function reconcileLocations(
  write: SymptomEntryWrite,
  input: { body_location?: string | null; body_locations?: string[] }
): void {
  if (input.body_locations !== undefined) {
    write.body_locations = input.body_locations;
    write.body_location = input.body_locations[0] ?? null;
  } else if (input.body_location !== undefined) {
    write.body_location = input.body_location;
    write.body_locations = input.body_location ? [input.body_location] : [];
  }
}

async function listEntries(userId: string, query: ListSymptomEntriesQuery) {
  // An overlapping range is read in the profile timezone, like entry_date.
  const timezone =
    query.overlapping && (query.fromDate || query.toDate)
      ? await loadUserTimezone(userId)
      : undefined;
  const rows = await symptomRepository.listSymptomEntries(userId, {
    fromDate: query.fromDate ?? undefined,
    toDate: query.toDate ?? undefined,
    symptomName: query.symptomName ?? undefined,
    symptomId: query.symptomId,
    medicationId: query.medicationId,
    source: query.source,
    episodesOnly: query.episodesOnly,
    overlapping: query.overlapping,
    timezone,
  });
  return rows.map(toEntryResponse);
}

async function listOngoing(userId: string) {
  const rows = await symptomRepository.listOngoingEpisodes(userId);
  return rows.map(toEntryResponse);
}

async function getEntry(userId: string, id: string) {
  const row = await symptomRepository.getSymptomEntry(userId, id);
  if (!row) throw new SymptomNotFoundError('Symptom entry not found');
  return toEntryResponse(row);
}

async function createEntry(userId: string, body: CreateSymptomEntryBody) {
  const { treatments, ...fields } = body;
  const tz = await loadUserTimezone(userId);

  const anchor = fields.started_at ?? fields.logged_at ?? null;
  const loggedAt =
    fields.logged_at ?? fields.started_at ?? new Date().toISOString();
  assertEpisodeOrder(fields.started_at, fields.ended_at);
  await assertCustomFields(userId, fields.symptom_id, fields.custom_fields);

  const write: SymptomEntryWrite = {
    ...fields,
    logged_at: loggedAt,
    entry_date: fields.entry_date ?? instantToDay(anchor ?? loggedAt, tz),
  };
  reconcileLocations(write, fields);

  if (fields.severity !== undefined && fields.severity !== null) {
    write.peak_severity = fields.severity;
    // An episode starts its severity timeline at the first reading.
    if (fields.started_at) {
      write.severity_timeline = [
        { at: fields.started_at, severity: fields.severity },
      ];
    }
  }
  // ...and its impact timeline at the first impact.
  if (fields.impact && fields.started_at) {
    write.impact_timeline = [{ at: fields.started_at, impact: fields.impact }];
  }

  try {
    const row = await symptomRepository.createSymptomEntry(
      userId,
      write,
      treatments
    );
    return toEntryResponse(row);
  } catch (error) {
    return rethrowClientError(error);
  }
}

async function updateEntry(
  userId: string,
  id: string,
  body: UpdateSymptomEntryBody
) {
  const existing = await symptomRepository.getSymptomEntry(userId, id);
  if (!existing) throw new SymptomNotFoundError('Symptom entry not found');

  // The source (manual / cycle) identifies where a row came from and is not
  // something an edit may change.
  const { treatments, source: _source, ...fields } = body;
  const tz = await loadUserTimezone(userId);

  const startedAt =
    fields.started_at !== undefined
      ? fields.started_at
      : (existing.started_at?.toISOString() ?? null);
  const endedAt =
    fields.ended_at !== undefined
      ? fields.ended_at
      : (existing.ended_at?.toISOString() ?? null);
  assertEpisodeOrder(startedAt, endedAt);
  await assertCustomFields(
    userId,
    fields.symptom_id ?? existing.symptom_id,
    fields.custom_fields
  );

  const write: SymptomEntryWrite = { ...fields };
  reconcileLocations(write, fields);

  // Re-derive the day when the time moved and the client did not pick one.
  if (
    fields.entry_date === undefined &&
    (fields.started_at !== undefined || fields.logged_at !== undefined)
  ) {
    write.entry_date = instantToDay(
      startedAt ?? fields.logged_at ?? existing.logged_at,
      tz
    );
  }

  // A severity change on an episode is a new reading on its timeline; a quick
  // log has no timeline, so its peak simply follows the value. Both are worked
  // out from the entry as stored when the update runs, so an overlapping update
  // cannot drop the other's reading.
  const readings = (current: SymptomEntryRow): SymptomEntryWrite => {
    const changes: SymptomEntryWrite = {};
    const isEpisode = Boolean(current.started_at || startedAt);
    if (fields.severity !== undefined && fields.severity !== null) {
      const severityChanged =
        current.severity === null ||
        Number(current.severity) !== fields.severity;
      if (severityChanged) {
        if (isEpisode) {
          const timeline = [
            ...current.severity_timeline,
            {
              at: new Date().toISOString(),
              severity: fields.severity,
            },
          ];
          changes.severity_timeline = timeline;
          changes.peak_severity = Math.max(...timeline.map((p) => p.severity));
        } else {
          changes.peak_severity = fields.severity;
        }
      }
    }

    // The same for impact: a change on an episode is appended to its timeline
    // instead of replacing the history.
    if (fields.impact && fields.impact !== current.impact && isEpisode) {
      changes.impact_timeline = [
        ...(current.impact_timeline ?? []),
        { at: new Date().toISOString(), impact: fields.impact },
      ];
    }
    return changes;
  };

  try {
    const row = await symptomRepository.updateSymptomEntry(
      userId,
      id,
      write,
      treatments,
      readings
    );
    if (!row) throw new SymptomNotFoundError('Symptom entry not found');
    return toEntryResponse(row);
  } catch (error) {
    return rethrowClientError(error);
  }
}

async function endEpisode(
  userId: string,
  id: string,
  body: EndSymptomEpisodeBody
) {
  const existing = await symptomRepository.getSymptomEntry(userId, id);
  if (!existing) throw new SymptomNotFoundError('Symptom entry not found');
  if (existing.ended_at) {
    throw new SymptomConflictError('This episode has already ended');
  }
  assertEpisodeOrder(existing.started_at ?? existing.logged_at, body.ended_at);
  try {
    const row = await symptomRepository.endSymptomEpisode(
      userId,
      id,
      body.ended_at ?? null,
      body.treatments
    );
    if (!row) throw new SymptomConflictError('This episode has already ended');
    return toEntryResponse(row);
  } catch (error) {
    return rethrowClientError(error);
  }
}

async function addSeverity(
  userId: string,
  id: string,
  body: AddSymptomSeverityBody
) {
  const row = await symptomRepository.appendSymptomSeverity(
    userId,
    id,
    body.severity,
    body.at ?? null,
    body.impact ?? null
  );
  if (!row) throw new SymptomNotFoundError('Symptom entry not found');
  return toEntryResponse(row);
}

async function safeUnlink(absolutePath: string): Promise<void> {
  try {
    await fs.promises.unlink(absolutePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      log('warn', `Failed to remove symptom photo file ${absolutePath}`, err);
    }
  }
}

async function removeStoredPhoto(storedPath: string): Promise<void> {
  // Guard the stored path before deleting: unlink is destructive, so a tampered
  // file_path must not be able to reach outside the uploads root.
  const absolute = resolveUploadPathWithinRoot(storedPath);
  if (!absolute) {
    log(
      'warn',
      `Refused to delete symptom photo path outside uploads root: ${storedPath}`
    );
    return;
  }
  await safeUnlink(absolute);
}

async function deleteEntry(userId: string, id: string): Promise<void> {
  const { deleted, photoPaths } = await symptomRepository.deleteSymptomEntry(
    userId,
    id
  );
  if (!deleted) throw new SymptomNotFoundError('Symptom entry not found');
  await Promise.all(photoPaths.map(removeStoredPhoto));
}

// --- Symptom-free days -------------------------------------------------------

async function markSymptomFree(userId: string, entryDate?: string) {
  const day = entryDate ?? todayInZone(await loadUserTimezone(userId));
  return symptomRepository.markSymptomFreeDay(userId, day);
}

async function unmarkSymptomFree(userId: string, entryDate: string) {
  const ok = await symptomRepository.unmarkSymptomFreeDay(userId, entryDate);
  if (!ok)
    throw new SymptomNotFoundError('No symptom-free marker for that day');
}

async function listSymptomFree(
  userId: string,
  opts: { fromDate?: string; toDate?: string }
) {
  return symptomRepository.listSymptomFreeDays(userId, opts);
}

// --- Photos ------------------------------------------------------------------

async function addPhoto(
  userId: string,
  entryId: string,
  extension: string,
  buffer: Buffer,
  caption: string | null
) {
  const entry = await symptomRepository.getSymptomEntry(userId, entryId);
  if (!entry) throw new SymptomNotFoundError('Symptom entry not found');
  if (entry.photo_ids.length >= MAX_PHOTOS_PER_ENTRY) {
    throw new SymptomConflictError(
      `An entry can have at most ${MAX_PHOTOS_PER_ENTRY} photos`
    );
  }

  // Extension comes from the validated image bytes, not the client filename.
  const relativePath = path.join(
    'uploads',
    'symptoms',
    userId,
    entryId,
    `${randomUUID()}.${extension}`
  );
  const finalPath = resolveUploadPath(relativePath);
  const tempPath = `${finalPath}.tmp-${randomUUID()}`;

  try {
    await fs.promises.mkdir(path.dirname(finalPath), { recursive: true });
    await fs.promises.writeFile(tempPath, buffer);
    const row = await symptomRepository.insertSymptomPhoto(
      userId,
      entryId,
      relativePath,
      caption
    );
    if (!row) throw new SymptomNotFoundError('Symptom entry not found');
    // Only promote the file once the row exists, so a failed insert leaves no orphan.
    await fs.promises.rename(tempPath, finalPath);
    return {
      id: row.id,
      symptom_entry_id: row.symptom_entry_id,
      caption: row.caption,
      created_at: iso(row.created_at) as string,
    };
  } catch (error) {
    await safeUnlink(tempPath);
    throw error;
  }
}

/** Absolute path of a photo the caller may see, or null when unavailable. */
async function getPhotoFile(
  userId: string,
  photoId: string
): Promise<string | null> {
  const row = await symptomRepository.getSymptomPhoto(userId, photoId);
  if (!row) return null;
  const absolute = resolveUploadPathWithinRoot(row.file_path);
  if (!absolute) {
    log('warn', 'Rejected symptom photo path outside uploads root');
    return null;
  }
  try {
    await fs.promises.access(absolute);
  } catch {
    return null;
  }
  return absolute;
}

async function deletePhoto(userId: string, photoId: string): Promise<void> {
  const storedPath = await symptomRepository.deleteSymptomPhoto(
    userId,
    photoId
  );
  if (!storedPath) throw new SymptomNotFoundError('Symptom photo not found');
  await removeStoredPhoto(storedPath);
}

const symptomService = {
  listDefinitions,
  createDefinition,
  updateDefinition,
  deleteDefinition,
  listOptions,
  createOption,
  updateOption,
  deleteOption,
  listEntries,
  listOngoing,
  getEntry,
  createEntry,
  updateEntry,
  endEpisode,
  addSeverity,
  deleteEntry,
  markSymptomFree,
  unmarkSymptomFree,
  listSymptomFree,
  addPhoto,
  getPhotoFile,
  deletePhoto,
};

export default symptomService;

import { vi, beforeEach, afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error supertest has no bundled types in this project
import request from 'supertest';
import express from 'express';
import { getSymptomPatternHints } from '@workspace/shared';
import symptomRepository from '../models/symptomRepository.js';
import type {
  SymptomDefinitionRow,
  SymptomEntryWithDetails,
  SymptomEntryWrite,
} from '../models/symptomRepository.js';
import symptomOptionRepository from '../models/symptomOptionRepository.js';
import symptomService, {
  SymptomConflictError,
  SymptomNotFoundError,
} from '../services/symptomService.js';
import symptomRoutes from '../routes/v2/symptomRoutes.js';
import errorHandler from '../middleware/errorHandler.js';
import { ValidationError } from '../utils/errors.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));

vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn().mockResolvedValue('UTC'),
}));

vi.mock('../middleware/checkPermissionMiddleware.js', () => ({
  default: vi.fn(
    () =>
      (
        req: express.Request,
        res: express.Response,
        next: express.NextFunction
      ) =>
        next()
  ),
}));

vi.mock('../middleware/onBehalfOfMiddleware.js', () => ({
  default: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => next(),
}));

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  if (req.headers.cookie && req.headers.cookie.includes('userId=')) {
    const m = req.headers.cookie.match(/userId=([^;]+)/);
    if (m) req.userId = m[1];
  }
  next();
});
app.use('/api/v2/symptoms', symptomRoutes);
app.use(errorHandler);

const UID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_UID = '660e8400-e29b-41d4-a716-446655440001';
const cookie = ['userId=testUser'];

function definitionRow(
  overrides: Partial<SymptomDefinitionRow> = {}
): SymptomDefinitionRow {
  return {
    id: UID,
    user_id: 'testUser',
    name: 'migraine',
    display_name: 'Migraine',
    scale_type: '1-10',
    unit: null,
    is_glp1_flagged: false,
    category: 'head',
    template: 'headache',
    sections: {},
    custom_field_defs: [],
    is_episodic: true,
    color: null,
    icon: null,
    is_pinned: false,
    sort_order: 0,
    is_archived: false,
    created_at: new Date('2026-06-25T12:00:00Z'),
    updated_at: new Date('2026-06-25T12:00:00Z'),
    ...overrides,
  };
}

function entryRow(
  overrides: Partial<SymptomEntryWithDetails> = {}
): SymptomEntryWithDetails {
  return {
    id: UID,
    user_id: 'testUser',
    medication_id: null,
    symptom_id: null,
    symptom_name_snapshot: 'Migraine',
    severity: 6,
    severity_label: null,
    logged_at: new Date('2026-06-25T12:00:00Z'),
    entry_date: '2026-06-25',
    started_at: null,
    ended_at: null,
    body_location: null,
    body_locations: [],
    qualities: [],
    associated_symptoms: [],
    triggers: [],
    phases: {},
    impact: null,
    peak_severity: 6,
    severity_timeline: [],
    impact_timeline: [],
    context_text: null,
    bristol_type: null,
    source: 'manual',
    custom_fields: {},
    created_at: new Date('2026-06-25T12:00:00Z'),
    updated_at: new Date('2026-06-25T12:00:00Z'),
    treatments: [],
    photo_ids: [],
    ...overrides,
  };
}

/**
 * The fields updateEntry writes: those it sends plus those it works out from
 * `stored`, the entry as the update finds it under the row lock.
 */
function written(
  call: Parameters<typeof symptomRepository.updateSymptomEntry>,
  stored: SymptomEntryWithDetails
): SymptomEntryWrite {
  const [, , data, , fromCurrent] = call;
  return { ...data, ...fromCurrent?.(stored) };
}

describe('Symptom Pattern Hints Shared Logic', () => {
  it('returns empty array when injections or symptoms are empty', () => {
    const hints = getSymptomPatternHints([], []);
    expect(hints).toEqual([]);
  });

  it('surfaces a post-dose hint when a symptom clusters after injections (>= MIN_OCCURRENCES, >= 2 doses)', () => {
    const injections = [
      { injected_at: '2026-06-13T08:00:00Z', dose_mg: 2.4 },
      { injected_at: '2026-06-20T08:00:00Z', dose_mg: 2.4 },
    ];
    const symptoms = [
      {
        logged_at: '2026-06-13T20:00:00Z',
        severity: 5,
        symptom_name_snapshot: 'Nausea',
      }, // 12h post dose 1
      {
        logged_at: '2026-06-14T08:00:00Z',
        severity: 4,
        symptom_name_snapshot: 'nausea',
      }, // 24h post dose 1
      {
        logged_at: '2026-06-20T20:00:00Z',
        severity: 5,
        symptom_name_snapshot: 'Nausea',
      }, // 12h post dose 2
      {
        logged_at: '2026-06-21T08:00:00Z',
        severity: 4,
        symptom_name_snapshot: 'nausea',
      }, // 24h post dose 2
      {
        logged_at: '2026-06-17T08:00:00Z',
        severity: 3,
        symptom_name_snapshot: 'Nausea',
      }, // mid-week baseline
    ];

    const hints = getSymptomPatternHints(injections, symptoms);
    expect(hints.length).toBe(1);
    expect(hints[0].symptomName).toBe('nausea');
    expect(hints[0].sampleSize).toBe(5);
    // New contract: compares post-dose rate vs. baseline rather than a fixed onset phrase.
    expect(hints[0].message.toLowerCase()).toContain('after your dose');
    expect(['medium', 'high']).toContain(hints[0].severityLevel);
  });

  it('does not surface a hint below the minimum sample size', () => {
    const injections = [
      { injected_at: '2026-06-13T08:00:00Z', dose_mg: 2.4 },
      { injected_at: '2026-06-20T08:00:00Z', dose_mg: 2.4 },
    ];
    const symptoms = [
      {
        logged_at: '2026-06-20T20:00:00Z',
        severity: 5,
        symptom_name_snapshot: 'Nausea',
      },
      {
        logged_at: '2026-06-21T08:00:00Z',
        severity: 4,
        symptom_name_snapshot: 'nausea',
      },
    ];
    expect(getSymptomPatternHints(injections, symptoms)).toEqual([]);
  });

  it('raises severity level to high when average severity is >= 7', () => {
    const injections = [
      { injected_at: '2026-06-13T08:00:00Z', dose_mg: 2.4 },
      { injected_at: '2026-06-20T08:00:00Z', dose_mg: 2.4 },
    ];
    const symptoms = [
      {
        logged_at: '2026-06-13T18:00:00Z',
        severity: 8,
        symptom_name_snapshot: 'Fatigue',
      },
      {
        logged_at: '2026-06-14T06:00:00Z',
        severity: 8,
        symptom_name_snapshot: 'fatigue',
      },
      {
        logged_at: '2026-06-20T18:00:00Z',
        severity: 8,
        symptom_name_snapshot: 'Fatigue',
      },
      {
        logged_at: '2026-06-21T06:00:00Z',
        severity: 8,
        symptom_name_snapshot: 'fatigue',
      },
      {
        logged_at: '2026-06-17T08:00:00Z',
        severity: 8,
        symptom_name_snapshot: 'Fatigue',
      },
    ];

    const hints = getSymptomPatternHints(injections, symptoms);
    expect(hints.length).toBe(1);
    expect(hints[0].symptomName).toBe('fatigue');
    expect(hints[0].severityLevel).toBe('high');
  });
});

describe('Symptom Repository', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('createCustomSymptom inserts only the fields that were sent', async () => {
    const row = definitionRow({ name: 'headache' });
    mockClient.query.mockResolvedValue({ rows: [row] });

    const result = await symptomRepository.createCustomSymptom('testUser', {
      name: 'Headache ',
      display_name: 'Headache',
      scale_type: '1-10',
      is_glp1_flagged: false,
    });

    expect(result).toEqual(row);
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_custom_symptoms'),
      ['testUser', 'headache', 'Headache', '1-10', false]
    );
  });

  it('createCustomSymptom updates the existing definition on a name conflict', async () => {
    const row = definitionRow({ name: 'headache', template: 'headache' });
    mockClient.query
      .mockResolvedValueOnce({ rows: [] }) // ON CONFLICT DO NOTHING
      .mockResolvedValueOnce({ rows: [row] });

    const result = await symptomRepository.createCustomSymptom('testUser', {
      name: 'headache',
      template: 'headache',
    });

    expect(result).toEqual(row);
    const updateSql = mockClient.query.mock.calls[1][0] as string;
    expect(updateSql).toContain('UPDATE user_custom_symptoms');
    expect(updateSql).toContain('template = $3');
    expect(mockClient.query.mock.calls[1][1]).toEqual([
      'testUser',
      'headache',
      'headache',
    ]);
  });

  it('updateCustomSymptom sets only sent columns and serializes jsonb', async () => {
    mockClient.query.mockResolvedValue({ rows: [definitionRow()] });

    await symptomRepository.updateCustomSymptom('testUser', UID, {
      is_archived: true,
      sections: { triggers: false },
    });

    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('sections = $3::jsonb');
    expect(sql).toContain('is_archived = $4');
    // Only the sent columns are assigned (`template` still appears in RETURNING).
    expect(sql).not.toContain('template = ');
    expect(sql).not.toContain('color = ');
    expect(params).toEqual([UID, 'testUser', '{"triggers":false}', true]);
  });

  it('updateCustomSymptom returns null when nothing matched', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    expect(
      await symptomRepository.updateCustomSymptom('testUser', UID, {
        is_pinned: true,
      })
    ).toBeNull();
  });

  it('listCustomSymptoms lists definitions, pinned first', async () => {
    const list = [definitionRow()];
    mockClient.query.mockResolvedValue({ rows: list });

    const result = await symptomRepository.listCustomSymptoms('testUser');
    expect(result).toEqual(list);
    expect(mockClient.query.mock.calls[0][0]).toContain(
      'ORDER BY is_pinned DESC'
    );
  });

  it('deleteCustomSymptom returns true if deleted', async () => {
    mockClient.query.mockResolvedValue({ rowCount: 1, rows: [{ id: UID }] });
    expect(await symptomRepository.deleteCustomSymptom('testUser', UID)).toBe(
      true
    );
  });

  it('createSymptomEntry writes the entry and its treatments in one transaction', async () => {
    const row = entryRow();
    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO symptom_entries')) return { rows: [row] };
      return { rows: [] };
    });

    const result = await symptomRepository.createSymptomEntry(
      'testUser',
      {
        symptom_name_snapshot: 'Migraine',
        severity: 6,
        body_locations: ['Behind left eye'],
        phases: { aura: ['Visual'] },
      },
      [
        {
          kind: 'relief',
          name_snapshot: 'Dark, quiet room',
          effectiveness: 'partial',
        },
      ]
    );

    const sqls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls.some((q: string) => q.includes('symptom_entries'))).toBe(true);
    expect(
      sqls.some((q: string) =>
        q.includes('INSERT INTO symptom_entry_treatments')
      )
    ).toBe(true);
    expect(sqls).toContain('COMMIT');
    expect(result.id).toBe(UID);

    const insertCall = mockClient.query.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes('INSERT INTO symptom_entries')
    );
    expect(insertCall[0]).toContain('body_locations');
    expect(insertCall[0]).toContain('::text[]');
    expect(insertCall[0]).toContain('phases');
    expect(insertCall[1]).toContainEqual('{"aura":["Visual"]}');
  });

  it('createSymptomEntry rolls back and rethrows when a write fails', async () => {
    mockClient.query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO symptom_entries')) {
        throw Object.assign(new Error('fk'), { code: '23503' });
      }
      return { rows: [] };
    });

    await expect(
      symptomRepository.createSymptomEntry('testUser', {
        symptom_name_snapshot: 'Migraine',
      })
    ).rejects.toThrow('fk');
    const sqls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
    expect(sqls).toContain('ROLLBACK');
    expect(sqls).not.toContain('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('updateSymptomEntry leaves treatments alone unless they are sent', async () => {
    mockClient.query.mockImplementation(async (sql: string) =>
      sql.includes('UPDATE symptom_entries')
        ? { rows: [entryRow({ severity: 7 })] }
        : { rows: [] }
    );

    await symptomRepository.updateSymptomEntry('testUser', UID, {
      severity: 7,
    });

    const sqls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
    expect(
      sqls.some((q: string) =>
        q.includes('DELETE FROM symptom_entry_treatments')
      )
    ).toBe(false);
  });

  it('updateSymptomEntry replaces treatments when an empty list is sent', async () => {
    mockClient.query.mockImplementation(async (sql: string) =>
      sql.includes('UPDATE symptom_entries')
        ? { rows: [entryRow()] }
        : { rows: [] }
    );

    await symptomRepository.updateSymptomEntry('testUser', UID, {}, []);

    const sqls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
    expect(
      sqls.some((q: string) =>
        q.includes('DELETE FROM symptom_entry_treatments')
      )
    ).toBe(true);
  });

  it('updateSymptomEntry returns null and rolls back when the entry is missing', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    expect(
      await symptomRepository.updateSymptomEntry('testUser', UID, {
        severity: 1,
      })
    ).toBeNull();
    const sqls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
    expect(sqls).toContain('ROLLBACK');
  });

  it('updateSymptomEntry works out fromCurrent from the row it locked', async () => {
    const stored = entryRow({ severity: 4 });
    mockClient.query.mockImplementation(async (sql: string) =>
      sql.includes('FOR UPDATE') || sql.includes('UPDATE symptom_entries')
        ? { rows: [stored] }
        : { rows: [] }
    );
    const fromCurrent = vi.fn(() => ({ peak_severity: 9 }));

    await symptomRepository.updateSymptomEntry(
      'testUser',
      UID,
      { severity: 9 },
      undefined,
      fromCurrent
    );

    expect(fromCurrent).toHaveBeenCalledWith(stored);
    const sqls: string[] = mockClient.query.mock.calls.map(
      (c: unknown[]) => c[0] as string
    );
    const lock = sqls.findIndex((q) => q.includes('FOR UPDATE'));
    const update = sqls.findIndex((q) =>
      q.trimStart().startsWith('UPDATE symptom_entries')
    );
    expect(sqls.indexOf('BEGIN')).toBeLessThan(lock);
    expect(lock).toBeLessThan(update);
    expect(sqls[update]).toContain('peak_severity');
  });

  it('updateSymptomEntry returns null without updating when the locked entry is missing', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    const fromCurrent = vi.fn(() => ({}));

    expect(
      await symptomRepository.updateSymptomEntry(
        'testUser',
        UID,
        { severity: 1 },
        undefined,
        fromCurrent
      )
    ).toBeNull();
    expect(fromCurrent).not.toHaveBeenCalled();
    const sqls: string[] = mockClient.query.mock.calls.map(
      (c: unknown[]) => c[0] as string
    );
    expect(sqls).toContain('ROLLBACK');
    expect(
      sqls.some((q) => q.trimStart().startsWith('UPDATE symptom_entries'))
    ).toBe(false);
  });

  it('listSymptomEntries applies every filter', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await symptomRepository.listSymptomEntries('testUser', {
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
      symptomName: ' Nausea ',
      symptomId: UID,
      medicationId: OTHER_UID,
      source: 'manual',
      episodesOnly: true,
    });

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3 AND LOWER(symptom_name_snapshot) = $4 AND symptom_id = $5 AND medication_id = $6 AND source = $7 AND started_at IS NOT NULL'
      ),
      [
        'testUser',
        '2026-06-01',
        '2026-06-30',
        'nausea',
        UID,
        OTHER_UID,
        'manual',
      ]
    );
  });

  it('listSymptomEntries with overlapping also returns episodes that run into the range', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await symptomRepository.listSymptomEntries('testUser', {
      fromDate: '2026-10-01',
      toDate: '2026-10-31',
      overlapping: true,
      timezone: 'Europe/Madrid',
    });

    // October in Madrid runs from 22:00 UTC on 30 September (summer time) to
    // 23:00 UTC on 31 October (winter time).
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'WHERE user_id = $1 AND ((entry_date >= $2 AND entry_date <= $3) OR (started_at IS NOT NULL AND started_at < $4 AND (ended_at IS NULL OR ended_at >= $5)))'
      ),
      [
        'testUser',
        '2026-10-01',
        '2026-10-31',
        new Date('2026-10-31T23:00:00.000Z'),
        new Date('2026-09-30T22:00:00.000Z'),
      ]
    );
  });

  it('listSymptomEntries with overlapping and one bound keeps the other filters after it', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await symptomRepository.listSymptomEntries('testUser', {
      fromDate: '2026-10-01',
      overlapping: true,
      timezone: 'UTC',
      symptomId: UID,
    });
    await symptomRepository.listSymptomEntries('testUser', {
      toDate: '2026-10-31',
      overlapping: true,
      timezone: 'UTC',
    });

    expect(mockClient.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'WHERE user_id = $1 AND ((entry_date >= $2) OR (started_at IS NOT NULL AND (ended_at IS NULL OR ended_at >= $3))) AND symptom_id = $4'
      ),
      ['testUser', '2026-10-01', new Date('2026-10-01T00:00:00.000Z'), UID]
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'WHERE user_id = $1 AND ((entry_date <= $2) OR (started_at IS NOT NULL AND started_at < $3))'
      ),
      ['testUser', '2026-10-31', new Date('2026-11-01T00:00:00.000Z')]
    );
  });

  it('listSymptomEntries leaves a side of an overlapping range open when its day cannot be placed', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    // 9999-12-31 is a common "no limit" value; its end is past what the date
    // helpers can represent, so there is no upper bound on started_at.
    await symptomRepository.listSymptomEntries('testUser', {
      fromDate: '2026-10-01',
      toDate: '9999-12-31',
      overlapping: true,
      timezone: 'UTC',
    });

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'WHERE user_id = $1 AND ((entry_date >= $2 AND entry_date <= $3) OR (started_at IS NOT NULL AND (ended_at IS NULL OR ended_at >= $4)))'
      ),
      [
        'testUser',
        '2026-10-01',
        '9999-12-31',
        new Date('2026-10-01T00:00:00.000Z'),
      ]
    );
  });

  it('listSymptomEntries keeps the lower bound when the range starts on 9999-12-31', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await symptomRepository.listSymptomEntries('testUser', {
      fromDate: '9999-12-31',
      toDate: '9999-12-31',
      overlapping: true,
      timezone: 'UTC',
    });

    // Its start can be placed even though its end cannot, so ended episodes
    // stay out and only the ones still going come back.
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'WHERE user_id = $1 AND ((entry_date >= $2 AND entry_date <= $3) OR (started_at IS NOT NULL AND (ended_at IS NULL OR ended_at >= $4)))'
      ),
      [
        'testUser',
        '9999-12-31',
        '9999-12-31',
        new Date('9999-12-31T00:00:00.000Z'),
      ]
    );
  });

  it('listSymptomEntries ignores overlapping without a date range', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await symptomRepository.listSymptomEntries('testUser', {
      overlapping: true,
    });

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE user_id = \$1\s+ORDER BY/),
      ['testUser']
    );
  });

  it('listSymptomEntries attaches treatments and photo ids per entry', async () => {
    const a = entryRow({ id: UID });
    const b = entryRow({ id: OTHER_UID });
    mockClient.query
      .mockResolvedValueOnce({ rows: [a, b] })
      .mockResolvedValueOnce({
        rows: [{ id: 't1', symptom_entry_id: UID, name_snapshot: 'Ibuprofen' }],
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'p1', symptom_entry_id: OTHER_UID }],
      });

    const result = await symptomRepository.listSymptomEntries('testUser');

    expect(result[0].treatments).toHaveLength(1);
    expect(result[0].photo_ids).toEqual([]);
    expect(result[1].treatments).toEqual([]);
    expect(result[1].photo_ids).toEqual(['p1']);
  });

  it('listOngoingEpisodes selects started, unended episodes', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    await symptomRepository.listOngoingEpisodes('testUser');
    expect(mockClient.query.mock.calls[0][0]).toContain(
      'started_at IS NOT NULL AND ended_at IS NULL'
    );
  });

  it('endSymptomEpisode returns null when the episode is missing or already ended', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    expect(
      await symptomRepository.endSymptomEpisode('testUser', UID, null)
    ).toBeNull();
    const sqls = mockClient.query.mock.calls.map((c: unknown[]) => c[0]);
    expect(sqls).toContain('ROLLBACK');
  });

  it('endSymptomEpisode never lets the end fall before the start', async () => {
    mockClient.query.mockImplementation(async (sql: string) =>
      sql.includes('UPDATE symptom_entries')
        ? { rows: [entryRow({ ended_at: new Date() })] }
        : { rows: [] }
    );
    await symptomRepository.endSymptomEpisode('testUser', UID, null);
    const update = mockClient.query.mock.calls.find((c: unknown[]) =>
      (c[0] as string).includes('UPDATE symptom_entries')
    );
    expect(update[0]).toContain('GREATEST(COALESCE($3::timestamptz, NOW())');
    expect(update[0]).toContain('AND ended_at IS NULL');
  });

  it('appendSymptomSeverity raises the peak and appends a timeline point atomically', async () => {
    mockClient.query.mockImplementation(async (sql: string) =>
      sql.includes('UPDATE symptom_entries')
        ? { rows: [entryRow({ severity: 8 })] }
        : { rows: [] }
    );
    const result = await symptomRepository.appendSymptomSeverity(
      'testUser',
      UID,
      8,
      null
    );
    expect(result?.severity).toBe(8);
    const update = mockClient.query.mock.calls[0][0] as string;
    expect(update).toContain('GREATEST(COALESCE(peak_severity, $3), $3)');
    expect(update).toContain('severity_timeline || jsonb_build_array');
  });

  it('appendSymptomSeverity keeps both timelines in time order', async () => {
    mockClient.query.mockImplementation(async (sql: string) =>
      sql.includes('UPDATE symptom_entries')
        ? { rows: [entryRow({ severity: 4, impact: 'mild' })] }
        : { rows: [] }
    );
    await symptomRepository.appendSymptomSeverity(
      'testUser',
      UID,
      4,
      '2026-06-25T10:00:00.000Z',
      'mild'
    );
    const [update, params] = mockClient.query.mock.calls[0] as [
      string,
      unknown[],
    ];
    expect(params).toEqual([
      UID,
      'testUser',
      4,
      '2026-06-25T10:00:00.000Z',
      'mild',
    ]);
    // Points are re-sorted by `at`, and the current values come from the
    // latest point rather than the one just appended.
    expect(update).toContain("ORDER BY (p->>'at')::timestamptz, n");
    expect(update).toContain("ORDER BY (p->>'at')::timestamptz DESC, n DESC");
    expect(update).toContain('impact_timeline || jsonb_build_array');
    // Without an impact both impact columns stay as they are.
    expect(update).toContain('WHEN $5::text IS NULL THEN impact_timeline');
    expect(update).toContain('WHEN $5::text IS NULL THEN impact');
  });

  it('appendSymptomSeverity passes no impact when the caller sends none', async () => {
    mockClient.query.mockImplementation(async (sql: string) =>
      sql.includes('UPDATE symptom_entries')
        ? { rows: [entryRow()] }
        : { rows: [] }
    );
    await symptomRepository.appendSymptomSeverity('testUser', UID, 5, null);
    const params = mockClient.query.mock.calls[0][1] as unknown[];
    expect(params[4]).toBeNull();
  });

  it('deleteSymptomEntry reports the photo paths to clean up', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ file_path: 'uploads/symptoms/u/e/a.jpg' }],
      })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: UID }] });
    expect(await symptomRepository.deleteSymptomEntry('testUser', UID)).toEqual(
      { deleted: true, photoPaths: ['uploads/symptoms/u/e/a.jpg'] }
    );
  });

  it('deleteSymptomEntry reports nothing to clean up when the entry is missing', async () => {
    mockClient.query
      .mockResolvedValueOnce({
        rows: [{ file_path: 'uploads/symptoms/u/e/a.jpg' }],
      })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect(await symptomRepository.deleteSymptomEntry('testUser', UID)).toEqual(
      { deleted: false, photoPaths: [] }
    );
  });

  it('insertSymptomPhoto refuses an entry the user does not own', async () => {
    mockClient.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    expect(
      await symptomRepository.insertSymptomPhoto(
        'testUser',
        UID,
        'uploads/symptoms/x.jpg',
        null
      )
    ).toBeNull();
    expect(mockClient.query).toHaveBeenCalledTimes(1);
  });

  it('markSymptomFreeDay upserts on (user, day)', async () => {
    mockClient.query.mockResolvedValue({
      rows: [{ id: UID, entry_date: '2026-06-25' }],
    });
    const result = await symptomRepository.markSymptomFreeDay(
      'testUser',
      '2026-06-25'
    );
    expect(result.entry_date).toBe('2026-06-25');
    expect(mockClient.query.mock.calls[0][0]).toContain(
      'ON CONFLICT (user_id, entry_date)'
    );
  });
});

describe('Symptom Option Repository', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;

  beforeEach(() => {
    mockClient = { query: vi.fn(), release: vi.fn() };
    vi.mocked(getClient).mockResolvedValue(mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('createSymptomOption upserts a trimmed name, keeping unspecified fields', async () => {
    const row = { id: UID, kind: 'trigger', name: 'Red wine' };
    mockClient.query.mockResolvedValue({ rows: [row] });

    const result = await symptomOptionRepository.createSymptomOption(
      'testUser',
      { kind: 'trigger', name: ' Red wine ' }
    );

    expect(result).toEqual(row);
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('ON CONFLICT (user_id, kind, name) DO UPDATE');
    expect(sql).toContain('COALESCE($5, user_symptom_options.is_hidden)');
    expect(params).toEqual(['testUser', 'trigger', 'Red wine', null, null]);
  });

  it('listSymptomOptions filters by kind only when given', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    await symptomOptionRepository.listSymptomOptions('testUser', 'quality');
    expect(mockClient.query.mock.calls[0][1]).toEqual(['testUser', 'quality']);
    await symptomOptionRepository.listSymptomOptions('testUser');
    expect(mockClient.query.mock.calls[1][1]).toEqual(['testUser', null]);
  });

  it('updateSymptomOption returns null when the option is missing', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });
    expect(
      await symptomOptionRepository.updateSymptomOption('testUser', UID, {
        is_hidden: true,
      })
    ).toBeNull();
  });

  it('deleteSymptomOption returns true if deleted', async () => {
    mockClient.query.mockResolvedValue({ rowCount: 1, rows: [{ id: UID }] });
    expect(
      await symptomOptionRepository.deleteSymptomOption('testUser', UID)
    ).toBe(true);
  });
});

describe('Symptom Service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  // Captures what the service hands the repository.
  function spyCreate() {
    return vi
      .spyOn(symptomRepository, 'createSymptomEntry')
      .mockImplementation(async (_user, write) =>
        entryRow({
          ...(write as Partial<SymptomEntryWithDetails>),
          logged_at: new Date(write.logged_at as string),
          started_at: write.started_at ? new Date(write.started_at) : null,
          ended_at: write.ended_at ? new Date(write.ended_at) : null,
        })
      );
  }

  it('derives entry_date from started_at in the user timezone', async () => {
    const { loadUserTimezone } = await import('../utils/timezoneLoader.js');
    vi.mocked(loadUserTimezone).mockResolvedValueOnce('America/Los_Angeles');
    const create = spyCreate();

    // 03:00 UTC on the 25th is still the evening of the 24th in Los Angeles.
    await symptomService.createEntry('testUser', {
      symptom_name_snapshot: 'Migraine',
      started_at: '2026-06-25T03:00:00.000Z',
    });

    expect(create.mock.calls[0][1].entry_date).toBe('2026-06-24');
    expect(create.mock.calls[0][1].logged_at).toBe('2026-06-25T03:00:00.000Z');
  });

  it('keeps a client-supplied entry_date', async () => {
    const create = spyCreate();
    await symptomService.createEntry('testUser', {
      symptom_name_snapshot: 'Nausea',
      logged_at: '2026-06-25T12:00:00Z',
      entry_date: '2026-06-20',
    });
    expect(create.mock.calls[0][1].entry_date).toBe('2026-06-20');
  });

  it('starts an episode severity timeline and peak, but not for a quick log', async () => {
    const create = spyCreate();

    await symptomService.createEntry('testUser', {
      symptom_name_snapshot: 'Migraine',
      severity: 7,
      started_at: '2026-06-25T09:00:00.000Z',
    });
    expect(create.mock.calls[0][1].peak_severity).toBe(7);
    expect(create.mock.calls[0][1].severity_timeline).toEqual([
      { at: '2026-06-25T09:00:00.000Z', severity: 7 },
    ]);

    await symptomService.createEntry('testUser', {
      symptom_name_snapshot: 'Nausea',
      severity: 4,
    });
    expect(create.mock.calls[1][1].peak_severity).toBe(4);
    expect(create.mock.calls[1][1].severity_timeline).toBeUndefined();
  });

  it('starts an episode impact timeline, but not for a quick log', async () => {
    const create = spyCreate();

    await symptomService.createEntry('testUser', {
      symptom_name_snapshot: 'Migraine',
      impact: 'moderate',
      started_at: '2026-06-25T09:00:00.000Z',
    });
    expect(create.mock.calls[0][1].impact_timeline).toEqual([
      { at: '2026-06-25T09:00:00.000Z', impact: 'moderate' },
    ]);

    await symptomService.createEntry('testUser', {
      symptom_name_snapshot: 'Nausea',
      impact: 'mild',
    });
    expect(create.mock.calls[1][1].impact).toBe('mild');
    expect(create.mock.calls[1][1].impact_timeline).toBeUndefined();
  });

  it('keeps body_location and body_locations in step', async () => {
    const create = spyCreate();

    await symptomService.createEntry('testUser', {
      symptom_name_snapshot: 'Migraine',
      body_locations: ['Behind left eye', 'Left temple'],
    });
    expect(create.mock.calls[0][1].body_location).toBe('Behind left eye');

    await symptomService.createEntry('testUser', {
      symptom_name_snapshot: 'Back pain',
      body_location: 'Lower back',
    });
    expect(create.mock.calls[1][1].body_locations).toEqual(['Lower back']);
  });

  it('rejects an episode that ends before it starts', async () => {
    spyCreate();
    await expect(
      symptomService.createEntry('testUser', {
        symptom_name_snapshot: 'Migraine',
        started_at: '2026-06-25T10:00:00Z',
        ended_at: '2026-06-25T09:00:00Z',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects custom field values that do not match the definition', async () => {
    spyCreate();
    vi.spyOn(symptomRepository, 'getCustomSymptomById').mockResolvedValue(
      definitionRow({
        custom_field_defs: [
          { key: 'temperature', label: 'Temperature', type: 'number' },
        ],
      })
    );
    await expect(
      symptomService.createEntry('testUser', {
        symptom_name_snapshot: 'Fever',
        symptom_id: UID,
        custom_fields: { temperature: 'hot' },
      })
    ).rejects.toThrow('Temperature must be a number');
  });

  it('accepts valid custom field values', async () => {
    const create = spyCreate();
    vi.spyOn(symptomRepository, 'getCustomSymptomById').mockResolvedValue(
      definitionRow({
        custom_field_defs: [
          { key: 'temperature', label: 'Temperature', type: 'number' },
        ],
      })
    );
    await symptomService.createEntry('testUser', {
      symptom_name_snapshot: 'Fever',
      symptom_id: UID,
      custom_fields: { temperature: 38.4 },
    });
    expect(create.mock.calls[0][1].custom_fields).toEqual({
      temperature: 38.4,
    });
  });

  it('turns a foreign-key violation into a validation error', async () => {
    vi.spyOn(symptomRepository, 'createSymptomEntry').mockRejectedValue(
      Object.assign(new Error('fk'), { code: '23503' })
    );
    await expect(
      symptomService.createEntry('testUser', {
        symptom_name_snapshot: 'Migraine',
        medication_id: UID,
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('serializes dates to ISO strings in responses', async () => {
    spyCreate();
    const result = await symptomService.createEntry('testUser', {
      symptom_name_snapshot: 'Migraine',
      started_at: '2026-06-25T09:00:00.000Z',
    });
    expect(result.started_at).toBe('2026-06-25T09:00:00.000Z');
    expect(typeof result.created_at).toBe('string');
  });

  it('updateEntry appends a timeline point and recomputes the peak for an episode', async () => {
    const stored = entryRow({
      started_at: new Date('2026-06-25T09:00:00Z'),
      severity: 7,
      peak_severity: 7,
      severity_timeline: [{ at: '2026-06-25T09:00:00.000Z', severity: 7 }],
    });
    vi.spyOn(symptomRepository, 'getSymptomEntry').mockResolvedValue(stored);
    const update = vi
      .spyOn(symptomRepository, 'updateSymptomEntry')
      .mockResolvedValue(entryRow());

    await symptomService.updateEntry('testUser', UID, { severity: 3 });

    const write = written(update.mock.calls[0], stored);
    expect(write.severity_timeline).toHaveLength(2);
    expect(write.severity_timeline?.[1].severity).toBe(3);
    // The peak reflects the whole episode, not the latest reading.
    expect(write.peak_severity).toBe(7);
  });

  it('updateEntry does not append to severity_timeline when severity is unchanged', async () => {
    const stored = entryRow({
      started_at: new Date('2026-06-25T09:00:00Z'),
      severity: 7,
      peak_severity: 7,
      severity_timeline: [{ at: '2026-06-25T09:00:00.000Z', severity: 7 }],
    });
    vi.spyOn(symptomRepository, 'getSymptomEntry').mockResolvedValue(stored);
    const update = vi
      .spyOn(symptomRepository, 'updateSymptomEntry')
      .mockResolvedValue(entryRow());

    await symptomService.updateEntry('testUser', UID, {
      severity: 7,
      context_text: 'updated note',
    });

    const write = written(update.mock.calls[0], stored);
    expect(write.severity_timeline).toBeUndefined();
  });

  it('updateEntry appends an impact point when an episode impact changes', async () => {
    const stored = entryRow({
      started_at: new Date('2026-06-25T09:00:00Z'),
      impact: 'severe',
      impact_timeline: [{ at: '2026-06-25T09:00:00.000Z', impact: 'severe' }],
    });
    vi.spyOn(symptomRepository, 'getSymptomEntry').mockResolvedValue(stored);
    const update = vi
      .spyOn(symptomRepository, 'updateSymptomEntry')
      .mockResolvedValue(entryRow());

    await symptomService.updateEntry('testUser', UID, { impact: 'mild' });

    const write = written(update.mock.calls[0], stored);
    expect(write.impact).toBe('mild');
    expect(write.impact_timeline).toHaveLength(2);
    expect(write.impact_timeline?.[0].impact).toBe('severe');
    expect(write.impact_timeline?.[1].impact).toBe('mild');
  });

  it('updateEntry leaves impact_timeline alone when impact is unchanged or not an episode', async () => {
    const update = vi
      .spyOn(symptomRepository, 'updateSymptomEntry')
      .mockResolvedValue(entryRow());

    const episode = entryRow({
      started_at: new Date('2026-06-25T09:00:00Z'),
      impact: 'mild',
      impact_timeline: [{ at: '2026-06-25T09:00:00.000Z', impact: 'mild' }],
    });
    vi.spyOn(symptomRepository, 'getSymptomEntry').mockResolvedValueOnce(
      episode
    );
    await symptomService.updateEntry('testUser', UID, { impact: 'mild' });
    expect(
      written(update.mock.calls[0], episode).impact_timeline
    ).toBeUndefined();

    const quickLog = entryRow({ impact: 'mild' });
    vi.spyOn(symptomRepository, 'getSymptomEntry').mockResolvedValueOnce(
      quickLog
    );
    await symptomService.updateEntry('testUser', UID, { impact: 'severe' });
    const write = written(update.mock.calls[1], quickLog);
    expect(write.impact).toBe('severe');
    expect(write.impact_timeline).toBeUndefined();
  });

  it('updateEntry never changes the source of a row', async () => {
    vi.spyOn(symptomRepository, 'getSymptomEntry').mockResolvedValue(
      entryRow({ source: 'cycle' })
    );
    const update = vi
      .spyOn(symptomRepository, 'updateSymptomEntry')
      .mockResolvedValue(entryRow());

    await symptomService.updateEntry('testUser', UID, {
      source: 'manual',
      context_text: 'note',
    });

    expect(update.mock.calls[0][2]).not.toHaveProperty('source');
    expect(update.mock.calls[0][2].context_text).toBe('note');
  });

  it('updateEntry re-derives the day when the time moves', async () => {
    vi.spyOn(symptomRepository, 'getSymptomEntry').mockResolvedValue(
      entryRow()
    );
    const update = vi
      .spyOn(symptomRepository, 'updateSymptomEntry')
      .mockResolvedValue(entryRow());

    await symptomService.updateEntry('testUser', UID, {
      started_at: '2026-06-28T09:00:00.000Z',
    });
    expect(update.mock.calls[0][2].entry_date).toBe('2026-06-28');
  });

  it('updateEntry rejects a missing entry', async () => {
    vi.spyOn(symptomRepository, 'getSymptomEntry').mockResolvedValue(null);
    await expect(
      symptomService.updateEntry('testUser', UID, { severity: 1 })
    ).rejects.toBeInstanceOf(SymptomNotFoundError);
  });

  it('endEpisode ends an ongoing episode', async () => {
    vi.spyOn(symptomRepository, 'getSymptomEntry').mockResolvedValue(
      entryRow({ started_at: new Date('2026-06-25T09:00:00Z') })
    );
    const end = vi
      .spyOn(symptomRepository, 'endSymptomEpisode')
      .mockResolvedValue(
        entryRow({
          started_at: new Date('2026-06-25T09:00:00Z'),
          ended_at: new Date('2026-06-25T12:00:00Z'),
        })
      );
    const result = await symptomService.endEpisode('testUser', UID, {
      ended_at: '2026-06-25T12:00:00.000Z',
    });
    expect(end).toHaveBeenCalledWith(
      'testUser',
      UID,
      '2026-06-25T12:00:00.000Z',
      undefined
    );
    expect(result.ended_at).toBe('2026-06-25T12:00:00.000Z');
  });

  it('endEpisode conflicts when the episode already ended', async () => {
    vi.spyOn(symptomRepository, 'getSymptomEntry').mockResolvedValue(
      entryRow({ ended_at: new Date() })
    );
    await expect(
      symptomService.endEpisode('testUser', UID, {})
    ).rejects.toBeInstanceOf(SymptomConflictError);
  });

  it('endEpisode rejects an end time before the start', async () => {
    vi.spyOn(symptomRepository, 'getSymptomEntry').mockResolvedValue(
      entryRow({ started_at: new Date('2026-06-25T09:00:00Z') })
    );
    await expect(
      symptomService.endEpisode('testUser', UID, {
        ended_at: '2026-06-25T08:00:00.000Z',
      })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('endEpisode reports a missing entry', async () => {
    vi.spyOn(symptomRepository, 'getSymptomEntry').mockResolvedValue(null);
    await expect(
      symptomService.endEpisode('testUser', UID, {})
    ).rejects.toBeInstanceOf(SymptomNotFoundError);
  });

  it('markSymptomFree defaults to today in the user timezone', async () => {
    const { loadUserTimezone } = await import('../utils/timezoneLoader.js');
    vi.mocked(loadUserTimezone).mockResolvedValueOnce('UTC');
    const mark = vi
      .spyOn(symptomRepository, 'markSymptomFreeDay')
      .mockResolvedValue({ id: UID, entry_date: '2026-06-25' });
    await symptomService.markSymptomFree('testUser');
    expect(mark.mock.calls[0][1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('deleteEntry rejects a missing entry and leaves photos alone', async () => {
    vi.spyOn(symptomRepository, 'deleteSymptomEntry').mockResolvedValue({
      deleted: false,
      photoPaths: [],
    });
    await expect(
      symptomService.deleteEntry('testUser', UID)
    ).rejects.toBeInstanceOf(SymptomNotFoundError);
  });

  it('addPhoto refuses more than 10 photos per entry', async () => {
    vi.spyOn(symptomRepository, 'getSymptomEntry').mockResolvedValue(
      entryRow({ photo_ids: Array.from({ length: 10 }, () => UID) })
    );
    await expect(
      symptomService.addPhoto('testUser', UID, 'png', Buffer.from('x'), null)
    ).rejects.toBeInstanceOf(SymptomConflictError);
  });

  it('addPhoto rejects an entry that does not exist', async () => {
    vi.spyOn(symptomRepository, 'getSymptomEntry').mockResolvedValue(null);
    await expect(
      symptomService.addPhoto('testUser', UID, 'png', Buffer.from('x'), null)
    ).rejects.toBeInstanceOf(SymptomNotFoundError);
  });
});

describe('Symptom Routes V2', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  describe('symptom definitions', () => {
    it('GET /custom lists definitions', async () => {
      vi.spyOn(symptomRepository, 'listCustomSymptoms').mockResolvedValue([
        definitionRow(),
      ]);
      const res = await request(app)
        .get('/api/v2/symptoms/custom')
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(200);
      expect(res.body[0].name).toBe('migraine');
      expect(res.body[0].created_at).toBe('2026-06-25T12:00:00.000Z');
    });

    it('POST /custom creates a definition', async () => {
      const create = vi
        .spyOn(symptomRepository, 'createCustomSymptom')
        .mockResolvedValue(definitionRow({ name: 'bloating' }));
      const res = await request(app)
        .post('/api/v2/symptoms/custom')
        .set('Cookie', cookie)
        .send({
          name: 'bloating',
          scale_type: 'none-severe',
          template: 'gi',
          custom_field_defs: [
            { key: 'stool_count', label: 'Stool count', type: 'number' },
          ],
        });
      expect(res.statusCode).toBe(201);
      expect(create).toHaveBeenCalledWith(
        'testUser',
        expect.objectContaining({ template: 'gi' })
      );
    });

    it('POST /custom accepts the 1-5 scale', async () => {
      vi.spyOn(symptomRepository, 'createCustomSymptom').mockResolvedValue(
        definitionRow()
      );
      const res = await request(app)
        .post('/api/v2/symptoms/custom')
        .set('Cookie', cookie)
        .send({ name: 'fatigue', scale_type: '1-5' });
      expect(res.statusCode).toBe(201);
    });

    it.each([
      [{ scale_type: 'invalid-scale' }],
      [{ name: 'x', template: 'nope' }],
      [{ name: 'x', category: 'nope' }],
      [
        {
          name: 'x',
          custom_field_defs: [{ key: 'Bad Key', label: 'L', type: 'number' }],
        },
      ],
      [
        {
          name: 'x',
          custom_field_defs: [{ key: 'ok', label: 'L', type: 'colour' }],
        },
      ],
    ])('POST /custom returns 400 for %j', async (body) => {
      const res = await request(app)
        .post('/api/v2/symptoms/custom')
        .set('Cookie', cookie)
        .send(body);
      expect(res.statusCode).toBe(400);
    });

    it('PUT /custom/:id updates a definition', async () => {
      const update = vi
        .spyOn(symptomRepository, 'updateCustomSymptom')
        .mockResolvedValue(definitionRow({ is_archived: true }));
      const res = await request(app)
        .put(`/api/v2/symptoms/custom/${UID}`)
        .set('Cookie', cookie)
        .send({ is_archived: true });
      expect(res.statusCode).toBe(200);
      expect(update).toHaveBeenCalledWith('testUser', UID, {
        is_archived: true,
      });
      expect(res.body.is_archived).toBe(true);
    });

    it('PUT /custom/:id returns 404 when missing and 400 for a bad id', async () => {
      vi.spyOn(symptomRepository, 'updateCustomSymptom').mockResolvedValue(
        null
      );
      expect(
        (
          await request(app)
            .put(`/api/v2/symptoms/custom/${UID}`)
            .set('Cookie', cookie)
            .send({ is_pinned: true })
        ).statusCode
      ).toBe(404);
      expect(
        (
          await request(app)
            .put('/api/v2/symptoms/custom/not-a-uuid')
            .set('Cookie', cookie)
            .send({ is_pinned: true })
        ).statusCode
      ).toBe(400);
    });

    it('DELETE /custom/:id deletes, and 404s when missing', async () => {
      const del = vi
        .spyOn(symptomRepository, 'deleteCustomSymptom')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      expect(
        (
          await request(app)
            .delete(`/api/v2/symptoms/custom/${UID}`)
            .set('Cookie', cookie)
        ).statusCode
      ).toBe(204);
      expect(
        (
          await request(app)
            .delete(`/api/v2/symptoms/custom/${UID}`)
            .set('Cookie', cookie)
        ).statusCode
      ).toBe(404);
      expect(del).toHaveBeenCalledTimes(2);
    });
  });

  describe('options', () => {
    const optionRow = {
      id: UID,
      user_id: 'testUser',
      kind: 'trigger',
      name: 'Red wine',
      sort_order: 0,
      is_hidden: false,
      created_at: new Date('2026-06-25T12:00:00Z'),
      updated_at: new Date('2026-06-25T12:00:00Z'),
    };

    it('GET /options filters by kind', async () => {
      const list = vi
        .spyOn(symptomOptionRepository, 'listSymptomOptions')
        .mockResolvedValue([optionRow]);
      const res = await request(app)
        .get('/api/v2/symptoms/options?kind=trigger')
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(200);
      expect(list).toHaveBeenCalledWith('testUser', 'trigger');
      expect(res.body[0].name).toBe('Red wine');
    });

    it('GET /options rejects an unknown kind', async () => {
      const res = await request(app)
        .get('/api/v2/symptoms/options?kind=mood')
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(400);
    });

    it('POST /options creates an option', async () => {
      vi.spyOn(
        symptomOptionRepository,
        'createSymptomOption'
      ).mockResolvedValue(optionRow);
      const res = await request(app)
        .post('/api/v2/symptoms/options')
        .set('Cookie', cookie)
        .send({ kind: 'trigger', name: 'Red wine' });
      expect(res.statusCode).toBe(201);
    });

    it.each([
      [{ kind: 'trigger' }],
      [{ name: 'x' }],
      [{ kind: 'x', name: 'y' }],
    ])('POST /options returns 400 for %j', async (body) => {
      const res = await request(app)
        .post('/api/v2/symptoms/options')
        .set('Cookie', cookie)
        .send(body);
      expect(res.statusCode).toBe(400);
    });

    it('PUT /options/:id updates and 404s when missing', async () => {
      vi.spyOn(symptomOptionRepository, 'updateSymptomOption')
        .mockResolvedValueOnce({ ...optionRow, is_hidden: true })
        .mockResolvedValueOnce(null);
      const ok = await request(app)
        .put(`/api/v2/symptoms/options/${UID}`)
        .set('Cookie', cookie)
        .send({ is_hidden: true });
      expect(ok.statusCode).toBe(200);
      expect(ok.body.is_hidden).toBe(true);
      const missing = await request(app)
        .put(`/api/v2/symptoms/options/${UID}`)
        .set('Cookie', cookie)
        .send({ is_hidden: true });
      expect(missing.statusCode).toBe(404);
    });

    it('PUT /options/:id maps a duplicate name to 409', async () => {
      vi.spyOn(
        symptomOptionRepository,
        'updateSymptomOption'
      ).mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' }));
      const res = await request(app)
        .put(`/api/v2/symptoms/options/${UID}`)
        .set('Cookie', cookie)
        .send({ name: 'Caffeine' });
      expect(res.statusCode).toBe(409);
    });

    it('DELETE /options/:id deletes and 404s when missing', async () => {
      vi.spyOn(symptomOptionRepository, 'deleteSymptomOption')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      expect(
        (
          await request(app)
            .delete(`/api/v2/symptoms/options/${UID}`)
            .set('Cookie', cookie)
        ).statusCode
      ).toBe(204);
      expect(
        (
          await request(app)
            .delete(`/api/v2/symptoms/options/${UID}`)
            .set('Cookie', cookie)
        ).statusCode
      ).toBe(404);
    });
  });

  describe('entries', () => {
    it('POST /entries creates a full migraine episode', async () => {
      const create = vi
        .spyOn(symptomRepository, 'createSymptomEntry')
        .mockResolvedValue(entryRow({ started_at: new Date() }));
      const res = await request(app)
        .post('/api/v2/symptoms/entries')
        .set('Cookie', cookie)
        .send({
          symptom_name_snapshot: 'Migraine',
          severity: 7,
          started_at: '2026-06-25T09:00:00.000Z',
          body_locations: ['Behind left eye'],
          qualities: ['Throbbing'],
          associated_symptoms: ['Aura', 'Nausea'],
          triggers: ['Poor sleep'],
          phases: { aura: ['Visual'] },
          impact: 'moderate',
          treatments: [
            {
              kind: 'medication',
              name_snapshot: 'Sumatriptan 50 mg',
              effectiveness: 'full',
            },
            { kind: 'relief', name_snapshot: 'Dark, quiet room' },
          ],
        });
      expect(res.statusCode).toBe(201);
      const [, write, treatments] = create.mock.calls[0];
      expect(write.body_locations).toEqual(['Behind left eye']);
      expect(write.triggers).toEqual(['Poor sleep']);
      expect(treatments).toHaveLength(2);
    });

    it('POST /entries still accepts the legacy medication side-effect payload', async () => {
      vi.spyOn(symptomRepository, 'createSymptomEntry').mockResolvedValue(
        entryRow({ symptom_name_snapshot: 'vomiting' })
      );
      const res = await request(app)
        .post('/api/v2/symptoms/entries')
        .set('Cookie', cookie)
        .send({
          symptom_name_snapshot: 'vomiting',
          severity: 3,
          logged_at: '2026-06-25T12:00:00Z',
          entry_date: '2026-06-25',
          bristol_type: 4,
          body_location: 'Abdomen',
          medication_id: UID,
        });
      expect(res.statusCode).toBe(201);
    });

    it.each([
      [{ symptom_name_snapshot: 'x', bristol_type: 8 }],
      [{ severity: 3 }],
      [{ symptom_name_snapshot: 'x', impact: 'catastrophic' }],
      [{ symptom_name_snapshot: 'x', entry_date: '25/06/2026' }],
      [{ symptom_name_snapshot: 'x', treatments: [{ kind: 'relief' }] }],
      [
        {
          symptom_name_snapshot: 'x',
          treatments: [
            { kind: 'relief', name_snapshot: 'y', effectiveness: 'amazing' },
          ],
        },
      ],
    ])('POST /entries returns 400 for %j', async (body) => {
      const res = await request(app)
        .post('/api/v2/symptoms/entries')
        .set('Cookie', cookie)
        .send(body);
      expect(res.statusCode).toBe(400);
    });

    it('POST /entries maps a bad reference to 400', async () => {
      vi.spyOn(symptomRepository, 'createSymptomEntry').mockRejectedValue(
        Object.assign(new Error('fk'), { code: '23503' })
      );
      const res = await request(app)
        .post('/api/v2/symptoms/entries')
        .set('Cookie', cookie)
        .send({ symptom_name_snapshot: 'x', medication_id: UID });
      expect(res.statusCode).toBe(400);
    });

    it('GET /entries parses every filter', async () => {
      const list = vi
        .spyOn(symptomRepository, 'listSymptomEntries')
        .mockResolvedValue([entryRow()]);
      const res = await request(app)
        .get(
          `/api/v2/symptoms/entries?fromDate=2026-06-01&toDate=2026-06-30&symptomName=Migraine&symptomId=${UID}&medicationId=${OTHER_UID}&source=manual&episodesOnly=true`
        )
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(200);
      expect(list).toHaveBeenCalledWith('testUser', {
        fromDate: '2026-06-01',
        toDate: '2026-06-30',
        symptomName: 'Migraine',
        symptomId: UID,
        medicationId: OTHER_UID,
        source: 'manual',
        episodesOnly: true,
      });
      expect(res.body[0].entry_date).toBe('2026-06-25');
    });

    it('GET /entries rejects a malformed date', async () => {
      const res = await request(app)
        .get('/api/v2/symptoms/entries?fromDate=yesterday')
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(400);
    });

    it('GET /entries with overlapping reads the range in the profile timezone', async () => {
      const { loadUserTimezone } = await import('../utils/timezoneLoader.js');
      vi.mocked(loadUserTimezone).mockResolvedValueOnce('America/New_York');
      const list = vi
        .spyOn(symptomRepository, 'listSymptomEntries')
        .mockResolvedValue([entryRow()]);

      const res = await request(app)
        .get(
          '/api/v2/symptoms/entries?fromDate=2026-10-01&toDate=2026-10-31&overlapping=true'
        )
        .set('Cookie', cookie);

      expect(res.statusCode).toBe(200);
      expect(loadUserTimezone).toHaveBeenCalledWith('testUser');
      expect(list).toHaveBeenCalledWith(
        'testUser',
        expect.objectContaining({
          fromDate: '2026-10-01',
          toDate: '2026-10-31',
          overlapping: true,
          timezone: 'America/New_York',
        })
      );
    });

    it('GET /entries looks up no timezone unless an overlapping range is asked for', async () => {
      const { loadUserTimezone } = await import('../utils/timezoneLoader.js');
      const list = vi
        .spyOn(symptomRepository, 'listSymptomEntries')
        .mockResolvedValue([]);

      await request(app)
        .get('/api/v2/symptoms/entries?fromDate=2026-10-01&toDate=2026-10-31')
        .set('Cookie', cookie);
      await request(app)
        .get('/api/v2/symptoms/entries?overlapping=true')
        .set('Cookie', cookie);

      expect(loadUserTimezone).not.toHaveBeenCalled();
      expect(list.mock.calls[0][1]).toMatchObject({
        overlapping: undefined,
        timezone: undefined,
      });
      expect(list.mock.calls[1][1]).toMatchObject({
        overlapping: true,
        timezone: undefined,
      });
    });

    it('GET /entries rejects an overlapping value other than true or false', async () => {
      const res = await request(app)
        .get('/api/v2/symptoms/entries?fromDate=2026-10-01&overlapping=yes')
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(400);
    });

    it('GET /entries/ongoing is not shadowed by /entries/:id', async () => {
      const ongoing = vi
        .spyOn(symptomRepository, 'listOngoingEpisodes')
        .mockResolvedValue([entryRow({ started_at: new Date() })]);
      const res = await request(app)
        .get('/api/v2/symptoms/entries/ongoing')
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(200);
      expect(ongoing).toHaveBeenCalledWith('testUser');
    });

    it('GET /entries/:id returns the entry, or 404', async () => {
      vi.spyOn(symptomRepository, 'getSymptomEntry')
        .mockResolvedValueOnce(entryRow())
        .mockResolvedValueOnce(null);
      expect(
        (
          await request(app)
            .get(`/api/v2/symptoms/entries/${UID}`)
            .set('Cookie', cookie)
        ).statusCode
      ).toBe(200);
      expect(
        (
          await request(app)
            .get(`/api/v2/symptoms/entries/${UID}`)
            .set('Cookie', cookie)
        ).statusCode
      ).toBe(404);
    });

    it('PUT /entries/:id updates an entry', async () => {
      vi.spyOn(symptomRepository, 'getSymptomEntry').mockResolvedValue(
        entryRow()
      );
      const update = vi
        .spyOn(symptomRepository, 'updateSymptomEntry')
        .mockResolvedValue(entryRow({ context_text: 'after coffee' }));
      const res = await request(app)
        .put(`/api/v2/symptoms/entries/${UID}`)
        .set('Cookie', cookie)
        .send({ context_text: 'after coffee', triggers: ['Caffeine'] });
      expect(res.statusCode).toBe(200);
      expect(update.mock.calls[0][2].triggers).toEqual(['Caffeine']);
    });

    it('POST /entries/:id/end ends an episode', async () => {
      vi.spyOn(symptomRepository, 'getSymptomEntry').mockResolvedValue(
        entryRow({ started_at: new Date('2026-06-25T09:00:00Z') })
      );
      vi.spyOn(symptomRepository, 'endSymptomEpisode').mockResolvedValue(
        entryRow({
          started_at: new Date('2026-06-25T09:00:00Z'),
          ended_at: new Date('2026-06-25T11:00:00Z'),
        })
      );
      const res = await request(app)
        .post(`/api/v2/symptoms/entries/${UID}/end`)
        .set('Cookie', cookie)
        .send({});
      expect(res.statusCode).toBe(200);
      expect(res.body.ended_at).toBe('2026-06-25T11:00:00.000Z');
    });

    it('POST /entries/:id/end returns 409 for an ended episode and 404 for a missing one', async () => {
      vi.spyOn(symptomRepository, 'getSymptomEntry')
        .mockResolvedValueOnce(entryRow({ ended_at: new Date() }))
        .mockResolvedValueOnce(null);
      expect(
        (
          await request(app)
            .post(`/api/v2/symptoms/entries/${UID}/end`)
            .set('Cookie', cookie)
            .send({})
        ).statusCode
      ).toBe(409);
      expect(
        (
          await request(app)
            .post(`/api/v2/symptoms/entries/${UID}/end`)
            .set('Cookie', cookie)
            .send({})
        ).statusCode
      ).toBe(404);
    });

    it('POST /entries/:id/severity records a reading', async () => {
      const append = vi
        .spyOn(symptomRepository, 'appendSymptomSeverity')
        .mockResolvedValue(entryRow({ severity: 8, peak_severity: 8 }));
      const res = await request(app)
        .post(`/api/v2/symptoms/entries/${UID}/severity`)
        .set('Cookie', cookie)
        .send({ severity: 8 });
      expect(res.statusCode).toBe(200);
      expect(append).toHaveBeenCalledWith('testUser', UID, 8, null, null);
    });

    it('POST /entries/:id/severity records severity and impact together', async () => {
      const append = vi
        .spyOn(symptomRepository, 'appendSymptomSeverity')
        .mockResolvedValue(
          entryRow({
            severity: 4,
            impact: 'mild',
            impact_timeline: [
              { at: '2026-06-25T10:00:00.000Z', impact: 'mild' },
            ],
          })
        );
      const res = await request(app)
        .post(`/api/v2/symptoms/entries/${UID}/severity`)
        .set('Cookie', cookie)
        .send({ severity: 4, at: '2026-06-25T10:00:00.000Z', impact: 'mild' });
      expect(res.statusCode).toBe(200);
      expect(append).toHaveBeenCalledWith(
        'testUser',
        UID,
        4,
        '2026-06-25T10:00:00.000Z',
        'mild'
      );
      expect(res.body.impact_timeline).toEqual([
        { at: '2026-06-25T10:00:00.000Z', impact: 'mild' },
      ]);
    });

    it('POST /entries/:id/severity rejects an unknown impact', async () => {
      const res = await request(app)
        .post(`/api/v2/symptoms/entries/${UID}/severity`)
        .set('Cookie', cookie)
        .send({ severity: 4, impact: 'terrible' });
      expect(res.statusCode).toBe(400);
    });

    it('POST /entries/:id/severity validates the body and 404s a missing entry', async () => {
      vi.spyOn(symptomRepository, 'appendSymptomSeverity').mockResolvedValue(
        null
      );
      expect(
        (
          await request(app)
            .post(`/api/v2/symptoms/entries/${UID}/severity`)
            .set('Cookie', cookie)
            .send({})
        ).statusCode
      ).toBe(400);
      expect(
        (
          await request(app)
            .post(`/api/v2/symptoms/entries/${UID}/severity`)
            .set('Cookie', cookie)
            .send({ severity: 5 })
        ).statusCode
      ).toBe(404);
    });

    it('DELETE /entries/:id deletes, and 404s when missing', async () => {
      vi.spyOn(symptomRepository, 'deleteSymptomEntry')
        .mockResolvedValueOnce({ deleted: true, photoPaths: [] })
        .mockResolvedValueOnce({ deleted: false, photoPaths: [] });
      expect(
        (
          await request(app)
            .delete(`/api/v2/symptoms/entries/${UID}`)
            .set('Cookie', cookie)
        ).statusCode
      ).toBe(204);
      expect(
        (
          await request(app)
            .delete(`/api/v2/symptoms/entries/${UID}`)
            .set('Cookie', cookie)
        ).statusCode
      ).toBe(404);
    });
  });

  describe('symptom-free days', () => {
    it('POST /symptom-free marks a given day', async () => {
      const mark = vi
        .spyOn(symptomRepository, 'markSymptomFreeDay')
        .mockResolvedValue({ id: UID, entry_date: '2026-06-24' });
      const res = await request(app)
        .post('/api/v2/symptoms/symptom-free')
        .set('Cookie', cookie)
        .send({ entry_date: '2026-06-24' });
      expect(res.statusCode).toBe(201);
      expect(mark).toHaveBeenCalledWith('testUser', '2026-06-24');
    });

    it('POST /symptom-free defaults to today when no body is sent', async () => {
      const mark = vi
        .spyOn(symptomRepository, 'markSymptomFreeDay')
        .mockResolvedValue({ id: UID, entry_date: '2026-06-25' });
      const res = await request(app)
        .post('/api/v2/symptoms/symptom-free')
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(201);
      expect(mark.mock.calls[0][1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('POST /symptom-free rejects a bad date', async () => {
      const res = await request(app)
        .post('/api/v2/symptoms/symptom-free')
        .set('Cookie', cookie)
        .send({ entry_date: 'today' });
      expect(res.statusCode).toBe(400);
    });

    it('GET /symptom-free lists days in a range', async () => {
      const list = vi
        .spyOn(symptomRepository, 'listSymptomFreeDays')
        .mockResolvedValue([{ id: UID, entry_date: '2026-06-24' }]);
      const res = await request(app)
        .get(
          '/api/v2/symptoms/symptom-free?fromDate=2026-06-01&toDate=2026-06-30'
        )
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(200);
      expect(list).toHaveBeenCalledWith('testUser', {
        fromDate: '2026-06-01',
        toDate: '2026-06-30',
      });
    });

    it('DELETE /symptom-free/:date unmarks, 404s when absent, 400s a bad date', async () => {
      vi.spyOn(symptomRepository, 'unmarkSymptomFreeDay')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      expect(
        (
          await request(app)
            .delete('/api/v2/symptoms/symptom-free/2026-06-24')
            .set('Cookie', cookie)
        ).statusCode
      ).toBe(204);
      expect(
        (
          await request(app)
            .delete('/api/v2/symptoms/symptom-free/2026-06-24')
            .set('Cookie', cookie)
        ).statusCode
      ).toBe(404);
      expect(
        (
          await request(app)
            .delete('/api/v2/symptoms/symptom-free/nope')
            .set('Cookie', cookie)
        ).statusCode
      ).toBe(400);
    });
  });

  describe('photos', () => {
    // Minimal valid PNG signature is enough: the route sniffs the real bytes.
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
    ]);

    it('POST /entries/:id/photos stores an image', async () => {
      const add = vi.spyOn(symptomService, 'addPhoto').mockResolvedValue({
        id: UID,
        symptom_entry_id: OTHER_UID,
        caption: 'day 2',
        created_at: '2026-06-25T12:00:00.000Z',
      });
      const res = await request(app)
        .post(`/api/v2/symptoms/entries/${UID}/photos`)
        .set('Cookie', cookie)
        .field('caption', ' day 2 ')
        .attach('photo', png, {
          filename: 'rash.png',
          contentType: 'image/png',
        });
      expect(res.statusCode).toBe(201);
      expect(add).toHaveBeenCalledWith(
        'testUser',
        UID,
        'png',
        expect.any(Buffer),
        'day 2'
      );
    });

    it('POST /entries/:id/photos rejects a file whose bytes are not an image', async () => {
      const add = vi.spyOn(symptomService, 'addPhoto');
      const res = await request(app)
        .post(`/api/v2/symptoms/entries/${UID}/photos`)
        .set('Cookie', cookie)
        .attach('photo', Buffer.from('<script>alert(1)</script>'), {
          filename: 'rash.png',
          contentType: 'image/png',
        });
      expect(res.statusCode).toBe(400);
      expect(add).not.toHaveBeenCalled();
    });

    it('POST /entries/:id/photos requires a file', async () => {
      const res = await request(app)
        .post(`/api/v2/symptoms/entries/${UID}/photos`)
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(400);
    });

    it('POST /entries/:id/photos maps a missing entry to 404', async () => {
      vi.spyOn(symptomService, 'addPhoto').mockRejectedValue(
        new SymptomNotFoundError('Symptom entry not found')
      );
      const res = await request(app)
        .post(`/api/v2/symptoms/entries/${UID}/photos`)
        .set('Cookie', cookie)
        .attach('photo', png, { filename: 'a.png', contentType: 'image/png' });
      expect(res.statusCode).toBe(404);
    });

    it('GET /photos/file/:id 404s when the photo is unavailable', async () => {
      vi.spyOn(symptomService, 'getPhotoFile').mockResolvedValue(null);
      const res = await request(app)
        .get(`/api/v2/symptoms/photos/file/${UID}`)
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(404);
    });

    it('DELETE /photos/:id deletes, and 404s when missing', async () => {
      vi.spyOn(symptomService, 'deletePhoto')
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(
          new SymptomNotFoundError('Symptom photo not found')
        );
      expect(
        (
          await request(app)
            .delete(`/api/v2/symptoms/photos/${UID}`)
            .set('Cookie', cookie)
        ).statusCode
      ).toBe(204);
      expect(
        (
          await request(app)
            .delete(`/api/v2/symptoms/photos/${UID}`)
            .set('Cookie', cookie)
        ).statusCode
      ).toBe(404);
    });
  });

  describe('retired location endpoints', () => {
    it('no longer serves /locations (replaced by /options?kind=location)', async () => {
      const res = await request(app)
        .get('/api/v2/symptoms/locations')
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(404);
    });
  });
});

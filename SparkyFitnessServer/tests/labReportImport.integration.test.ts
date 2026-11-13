/**
 * Importing a lab report saves a lab_reports row and all of its results in one
 * transaction, and deleting a report deletes the results it saved (and any
 * custom marker that leaves empty) without touching results typed by hand.
 *
 * Skipped unless a test database is reachable.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { endPool } from '../db/poolManager.js';
import {
  createLabResult,
  deleteLabReports,
  deleteResultsForMarkerKey,
  importLabReport,
  listLabMarkers,
  listLabResults,
} from '../models/labResultRepository.js';

function ownerClient() {
  return new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_DB_USER,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
}

async function isDbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  if (!/(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
    return false;
  const probe = ownerClient();
  try {
    await probe.connect();
    await probe.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const RUN = await isDbReachable();

afterAll(async () => {
  if (RUN) await endPool();
});

describe.runIf(RUN)('lab report imports', () => {
  let db: pg.Client;
  const userId = randomUUID();
  const otherUserId = randomUUID();

  const reportRows = async (id?: string) =>
    Number(
      (
        await db.query(
          'SELECT count(*) FROM public.lab_reports WHERE user_id = $1 AND ($2::uuid IS NULL OR id = $2::uuid)',
          [userId, id ?? null]
        )
      ).rows[0].count
    );

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    for (const id of [userId, otherUserId]) {
      await db.query(
        'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
        [id, `lab-import-${id}@example.test`]
      );
    }
  });

  afterAll(async () => {
    await db.query('DELETE FROM public."user" WHERE id = ANY($1::uuid[])', [
      [userId, otherUserId],
    ]);
    await db.end();
  });

  const importReport = (labName = 'Quest') =>
    importLabReport(userId, {
      lab_name: labName,
      entry_date: '2026-09-12',
      results: [
        {
          marker_key: 'hba1c',
          value_numeric: 5.1,
          unit: '%',
          ref_range_low: 4.8,
          ref_range_high: 5.6,
        },
        {
          marker_name: 'ApoB',
          value_numeric: 80,
          unit: 'mg/dL',
          ref_range_low: null,
          ref_range_high: 90,
        },
        {
          marker_name: 'apob',
          value_numeric: 82,
          unit: 'mg/dL',
          ref_range_low: null,
          ref_range_high: 90,
        },
      ],
    });

  it('saves the report and every result, tagged with the report', async () => {
    const saved = await importReport();

    expect(saved.report.lab_name).toBe('Quest');
    expect(saved.report.collected_on).toBe('2026-09-12');
    expect(saved.results).toHaveLength(3);
    expect(saved.results.every((r) => r.source === 'report')).toBe(true);
    const linked = await db.query(
      'SELECT count(*) FROM public.lab_results WHERE report_id = $1',
      [saved.report.id]
    );
    expect(Number(linked.rows[0].count)).toBe(3);

    await deleteLabReports(userId, saved.report.id);
  });

  it('creates a custom marker once for results that name it in any case', async () => {
    const saved = await importReport();

    const markers = await listLabMarkers(userId);
    expect(markers.filter((m) => m.name.toLowerCase() === 'apob')).toHaveLength(
      1
    );
    const customIds = new Set(
      saved.results.map((r) => r.custom_marker_id).filter(Boolean)
    );
    expect(customIds.size).toBe(1);

    await deleteLabReports(userId, saved.report.id);
  });

  it('saves nothing when one result is rejected', async () => {
    const before = await reportRows();
    await expect(
      importLabReport(userId, {
        lab_name: 'Broken',
        entry_date: '2026-09-12',
        results: [
          {
            marker_key: 'hba1c',
            value_numeric: 5.1,
            unit: '%',
            ref_range_low: null,
            ref_range_high: null,
          },
          {
            marker_key: 'ldl',
            value_numeric: 100,
            unit: 'mg/dL',
            ref_range_low: 9,
            ref_range_high: 3,
          },
        ],
      })
    ).rejects.toMatchObject({ code: '23514' });

    expect(await reportRows()).toBe(before);
    const stray = await listLabResults(userId, { markerKey: 'ldl', limit: 10 });
    expect(stray).toHaveLength(0);
  });

  it('deletes one report with its results and the marker it leaves empty', async () => {
    await createLabResult(userId, {
      marker_key: 'hba1c',
      entry_date: '2026-03-01',
      value_numeric: 5.4,
      unit: '%',
      source: 'manual',
    });
    const saved = await importReport();

    const outcome = await deleteLabReports(userId, saved.report.id);

    expect(outcome).toEqual({ reports: 1, results: 3, markers: 1 });
    expect(await reportRows(saved.report.id)).toBe(0);
    const kept = await listLabResults(userId, {
      markerKey: 'hba1c',
      limit: 10,
    });
    expect(kept.map((r) => r.entry_date)).toEqual(['2026-03-01']);
    expect(
      (await listLabMarkers(userId)).some(
        (m) => m.name.toLowerCase() === 'apob'
      )
    ).toBe(false);

    await deleteResultsForMarkerKey(userId, 'hba1c');
  });

  it('keeps a custom marker that still has results from elsewhere', async () => {
    const first = await importReport('Lab one');
    const second = await importReport('Lab two');

    const outcome = await deleteLabReports(userId, first.report.id);

    expect(outcome).toEqual({ reports: 1, results: 3, markers: 0 });
    expect(
      (await listLabMarkers(userId)).some(
        (m) => m.name.toLowerCase() === 'apob'
      )
    ).toBe(true);

    await deleteLabReports(userId, second.report.id);
  });

  it('deletes every imported report and leaves hand-typed results', async () => {
    await createLabResult(userId, {
      marker_key: 'ldl',
      entry_date: '2026-03-01',
      value_numeric: 120,
      unit: 'mg/dL',
      source: 'manual',
    });
    await importReport('A');
    await importReport('B');

    const outcome = await deleteLabReports(userId, null);

    expect(outcome).toMatchObject({ reports: 2, results: 6 });
    expect(await reportRows()).toBe(0);
    const typed = await listLabResults(userId, { markerKey: 'ldl', limit: 10 });
    expect(typed).toHaveLength(1);

    await deleteResultsForMarkerKey(userId, 'ldl');
  });

  it('answers null for a report that is not the user’s', async () => {
    const saved = await importReport();

    expect(await deleteLabReports(otherUserId, saved.report.id)).toBeNull();
    expect(await reportRows(saved.report.id)).toBe(1);

    await deleteLabReports(userId, saved.report.id);
  });

  it('deletes every result of one built-in marker and nothing else', async () => {
    for (const date of ['2026-03-01', '2026-09-12']) {
      await createLabResult(userId, {
        marker_key: 'hba1c',
        entry_date: date,
        value_numeric: 5.2,
        unit: '%',
        source: 'manual',
      });
    }
    await createLabResult(userId, {
      marker_key: 'ldl',
      entry_date: '2026-09-12',
      value_numeric: 100,
      unit: 'mg/dL',
      source: 'manual',
    });

    expect(await deleteResultsForMarkerKey(userId, 'hba1c')).toBe(2);
    expect(
      await listLabResults(userId, { markerKey: 'ldl', limit: 10 })
    ).toHaveLength(1);

    await deleteResultsForMarkerKey(userId, 'ldl');
  });

  it('returns the saved report when the same client key is sent again', async () => {
    const key = randomUUID();
    const body = {
      client_request_id: key,
      lab_name: 'Quest',
      entry_date: '2026-09-12',
      results: [
        {
          marker_key: 'hba1c',
          value_numeric: 5.1,
          unit: '%',
          ref_range_low: 4.8,
          ref_range_high: 5.6,
        },
        {
          marker_name: 'Retry marker',
          value_numeric: 7,
          unit: 'x',
          ref_range_low: null,
          ref_range_high: null,
        },
      ],
    };
    const before = await reportRows();

    const first = await importLabReport(userId, body);
    const again = await importLabReport(userId, body);

    expect(again.report.id).toBe(first.report.id);
    expect(again.results.map((r) => r.id).sort()).toEqual(
      first.results.map((r) => r.id).sort()
    );
    expect(await reportRows()).toBe(before + 1);
    const linked = await db.query(
      'SELECT count(*) FROM public.lab_results WHERE report_id = $1',
      [first.report.id]
    );
    expect(Number(linked.rows[0].count)).toBe(2);

    await deleteLabReports(userId, first.report.id);
  });

  it('saves two reports sent at once with the same key only once', async () => {
    const key = randomUUID();
    const body = {
      client_request_id: key,
      lab_name: 'Quest',
      entry_date: '2026-09-12',
      results: [
        {
          marker_key: 'ldl',
          value_numeric: 100,
          unit: 'mg/dL',
          ref_range_low: null,
          ref_range_high: 99,
        },
      ],
    };

    const [a, b] = await Promise.all([
      importLabReport(userId, body),
      importLabReport(userId, body),
    ]);

    expect(a.report.id).toBe(b.report.id);
    const rows = await db.query(
      'SELECT count(*) FROM public.lab_reports WHERE user_id = $1 AND client_request_id = $2',
      [userId, key]
    );
    expect(Number(rows.rows[0].count)).toBe(1);

    await deleteLabReports(userId, a.report.id);
  });

  it('keeps the same key of two users apart', async () => {
    const key = randomUUID();
    const body = {
      client_request_id: key,
      lab_name: null,
      entry_date: '2026-09-12',
      results: [
        {
          marker_key: 'hba1c',
          value_numeric: 5,
          unit: '%',
          ref_range_low: null,
          ref_range_high: null,
        },
      ],
    };

    const mine = await importLabReport(userId, body);
    const theirs = await importLabReport(otherUserId, body);

    expect(theirs.report.id).not.toBe(mine.report.id);
    expect(theirs.report.user_id).toBe(otherUserId);

    await deleteLabReports(userId, mine.report.id);
    await deleteLabReports(otherUserId, theirs.report.id);
  });

  it('creates a new marker with its first result in one step', async () => {
    const saved = await createLabResult(userId, {
      custom_marker_name: 'Zonulin',
      entry_date: '2026-09-12',
      value_numeric: 40,
      unit: 'ng/mL',
      ref_range_low: null,
      ref_range_high: 107,
      source: 'manual',
    });

    const marker = (await listLabMarkers(userId)).find(
      (m) => m.name === 'Zonulin'
    );
    expect(marker).toMatchObject({ unit: 'ng/mL', ref_range_high: 107 });
    expect(saved?.custom_marker_id).toBe(marker?.id);

    // The same name in another case reuses the marker.
    const second = await createLabResult(userId, {
      custom_marker_name: 'ZONULIN',
      entry_date: '2026-10-01',
      value_numeric: 35,
      unit: 'ng/mL',
      source: 'manual',
    });
    expect(second?.custom_marker_id).toBe(marker?.id);

    await db.query('DELETE FROM public.lab_markers WHERE id = $1', [
      marker?.id,
    ]);
  });

  it('saves two results racing to create the same new marker, on one marker', async () => {
    const save = (value: number) =>
      createLabResult(userId, {
        custom_marker_name: 'Race marker',
        entry_date: '2026-09-12',
        value_numeric: value,
        unit: 'x',
        source: 'manual',
      });

    const [a, b] = await Promise.all([save(1), save(2)]);

    expect(a?.custom_marker_id).toBeTruthy();
    expect(b?.custom_marker_id).toBe(a?.custom_marker_id);
    const markers = (await listLabMarkers(userId)).filter(
      (m) => m.name === 'Race marker'
    );
    expect(markers).toHaveLength(1);

    await db.query('DELETE FROM public.lab_markers WHERE id = $1', [
      a?.custom_marker_id,
    ]);
  });

  it('leaves no marker behind when the result with a new name is rejected', async () => {
    await expect(
      createLabResult(userId, {
        // The marker itself is valid; the result fails its own check (no
        // value at all), after the marker was created in the transaction.
        custom_marker_name: 'Never saved',
        entry_date: '2026-09-12',
        value_numeric: null,
        value_text: null,
        unit: 'x',
        source: 'manual',
      })
    ).rejects.toMatchObject({ code: '23514' });

    const markers = await listLabMarkers(userId);
    expect(markers.some((m) => m.name === 'Never saved')).toBe(false);
  });
});

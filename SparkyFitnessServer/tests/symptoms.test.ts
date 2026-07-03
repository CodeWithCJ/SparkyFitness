import { vi, beforeEach, afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error supertest has no bundled types in this project
import request from 'supertest';
import express from 'express';
import { getSymptomPatternHints } from '@workspace/shared';
import symptomRepository from '../models/symptomRepository.js';
import symptomRoutes from '../routes/v2/symptomRoutes.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
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

const UID = '550e8400-e29b-41d4-a716-446655440000';
const cookie = ['userId=testUser'];

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
    vi.clearAllMocks();
  });

  it('createCustomSymptom inserts correctly', async () => {
    const customSymptom = {
      id: UID,
      user_id: 'testUser',
      name: 'headache',
      display_name: 'Headache',
      scale_type: '1-10',
      unit: null,
      is_glp1_flagged: false,
    };
    mockClient.query.mockResolvedValue({ rows: [customSymptom] });

    const result = await symptomRepository.createCustomSymptom('testUser', {
      name: 'Headache ',
      display_name: 'Headache',
      scale_type: '1-10',
      is_glp1_flagged: false,
    });

    expect(result).toEqual(customSymptom);
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_custom_symptoms'),
      ['testUser', 'headache', 'Headache', '1-10', null, false]
    );
  });

  it('listCustomSymptoms lists custom symptoms', async () => {
    const list = [{ id: UID, name: 'nausea' }];
    mockClient.query.mockResolvedValue({ rows: list });

    const result = await symptomRepository.listCustomSymptoms('testUser');
    expect(result).toEqual(list);
  });

  it('deleteCustomSymptom returns true if deleted', async () => {
    mockClient.query.mockResolvedValue({ rowCount: 1, rows: [{ id: UID }] });

    const result = await symptomRepository.deleteCustomSymptom('testUser', UID);
    expect(result).toBe(true);
  });

  it('createCustomLocation inserts (trimmed) correctly', async () => {
    const loc = { id: UID, user_id: 'testUser', name: 'Left shoulder' };
    mockClient.query.mockResolvedValue({ rows: [loc] });

    const result = await symptomRepository.createCustomLocation('testUser', {
      name: 'Left shoulder ',
    });

    expect(result).toEqual(loc);
    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_custom_symptom_locations'),
      ['testUser', 'Left shoulder']
    );
  });

  it('listCustomLocations lists locations', async () => {
    const list = [{ id: UID, name: 'Jaw' }];
    mockClient.query.mockResolvedValue({ rows: list });
    const result = await symptomRepository.listCustomLocations('testUser');
    expect(result).toEqual(list);
  });

  it('deleteCustomLocation returns true if deleted', async () => {
    mockClient.query.mockResolvedValue({ rowCount: 1, rows: [{ id: UID }] });
    const result = await symptomRepository.deleteCustomLocation(
      'testUser',
      UID
    );
    expect(result).toBe(true);
  });

  it('createSymptomEntry inserts entry', async () => {
    const entry = {
      id: UID,
      user_id: 'testUser',
      symptom_name_snapshot: 'Nausea',
      severity: 5,
    };
    mockClient.query.mockResolvedValue({ rows: [entry] });

    const result = await symptomRepository.createSymptomEntry('testUser', {
      symptom_name_snapshot: 'Nausea',
      severity: 5,
    });

    expect(result).toEqual(entry);
  });

  it('listSymptomEntries filters and queries correctly', async () => {
    mockClient.query.mockResolvedValue({ rows: [] });

    await symptomRepository.listSymptomEntries('testUser', {
      fromDate: '2026-06-01',
      toDate: '2026-06-30',
      symptomName: ' Nausea ',
    });

    expect(mockClient.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'WHERE user_id = $1 AND entry_date >= $2 AND entry_date <= $3 AND LOWER(symptom_name_snapshot) = $4'
      ),
      ['testUser', '2026-06-01', '2026-06-30', 'nausea']
    );
  });
});

describe('Symptom Routes V2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v2/symptoms/custom', () => {
    it('lists custom symptoms', async () => {
      const mockList = [{ id: UID, name: 'dizziness' }];
      vi.spyOn(symptomRepository, 'listCustomSymptoms').mockResolvedValue(
        mockList
      );

      const res = await request(app)
        .get('/api/v2/symptoms/custom')
        .set('Cookie', cookie);

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(mockList);
      expect(symptomRepository.listCustomSymptoms).toHaveBeenCalledWith(
        'testUser'
      );
    });
  });

  describe('POST /api/v2/symptoms/custom', () => {
    it('creates custom symptom successfully', async () => {
      const mockItem = { id: UID, name: 'bloating' };
      vi.spyOn(symptomRepository, 'createCustomSymptom').mockResolvedValue(
        mockItem
      );

      const res = await request(app)
        .post('/api/v2/symptoms/custom')
        .set('Cookie', cookie)
        .send({
          name: 'bloating',
          scale_type: 'none-severe',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(mockItem);
    });

    it('returns 400 when validation fails', async () => {
      const res = await request(app)
        .post('/api/v2/symptoms/custom')
        .set('Cookie', cookie)
        .send({
          scale_type: 'invalid-scale',
        });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/v2/symptoms/custom/:id', () => {
    it('deletes custom symptom', async () => {
      vi.spyOn(symptomRepository, 'deleteCustomSymptom').mockResolvedValue(
        true
      );

      const res = await request(app)
        .delete(`/api/v2/symptoms/custom/${UID}`)
        .set('Cookie', cookie);

      expect(res.statusCode).toBe(204);
    });

    it('returns 404 if custom symptom does not exist', async () => {
      vi.spyOn(symptomRepository, 'deleteCustomSymptom').mockResolvedValue(
        false
      );

      const res = await request(app)
        .delete(`/api/v2/symptoms/custom/${UID}`)
        .set('Cookie', cookie);

      expect(res.statusCode).toBe(404);
    });
  });

  describe('Custom Locations /api/v2/symptoms/locations', () => {
    it('GET lists custom locations', async () => {
      const mockList = [{ id: UID, name: 'Jaw' }];
      vi.spyOn(symptomRepository, 'listCustomLocations').mockResolvedValue(
        mockList
      );
      const res = await request(app)
        .get('/api/v2/symptoms/locations')
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual(mockList);
    });

    it('POST creates a custom location', async () => {
      const mockItem = { id: UID, name: 'Left shoulder' };
      vi.spyOn(symptomRepository, 'createCustomLocation').mockResolvedValue(
        mockItem
      );
      const res = await request(app)
        .post('/api/v2/symptoms/locations')
        .set('Cookie', cookie)
        .send({ name: 'Left shoulder' });
      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(mockItem);
    });

    it('POST returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/v2/symptoms/locations')
        .set('Cookie', cookie)
        .send({});
      expect(res.statusCode).toBe(400);
    });

    it('DELETE removes a custom location', async () => {
      vi.spyOn(symptomRepository, 'deleteCustomLocation').mockResolvedValue(
        true
      );
      const res = await request(app)
        .delete(`/api/v2/symptoms/locations/${UID}`)
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(204);
    });

    it('DELETE returns 404 when not found', async () => {
      vi.spyOn(symptomRepository, 'deleteCustomLocation').mockResolvedValue(
        false
      );
      const res = await request(app)
        .delete(`/api/v2/symptoms/locations/${UID}`)
        .set('Cookie', cookie);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /api/v2/symptoms/entries', () => {
    it('creates symptom entry successfully', async () => {
      const mockEntry = { id: UID, symptom_name_snapshot: 'vomiting' };
      vi.spyOn(symptomRepository, 'createSymptomEntry').mockResolvedValue(
        mockEntry
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
        });

      expect(res.statusCode).toBe(201);
      expect(res.body).toEqual(mockEntry);
    });

    it('returns 400 when bristol_type is out of range', async () => {
      const res = await request(app)
        .post('/api/v2/symptoms/entries')
        .set('Cookie', cookie)
        .send({
          symptom_name_snapshot: 'vomiting',
          severity: 3,
          bristol_type: 8,
        });

      expect(res.statusCode).toBe(400);
    });
  });
});

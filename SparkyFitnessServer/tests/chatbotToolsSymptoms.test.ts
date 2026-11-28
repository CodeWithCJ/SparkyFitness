import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import { buildSymptomTools } from '../ai/tools/symptomTools.js';
import symptomService from '../services/symptomService.js';
import { toolOpts } from './helpers/toolExecutionOptions.js';

vi.mock('../services/symptomService', () => ({
  default: {
    listDefinitions: vi.fn(),
    createDefinition: vi.fn(),
    updateDefinition: vi.fn(),
    deleteDefinition: vi.fn(),
    listEntries: vi.fn(),
    listOngoing: vi.fn(),
    createEntry: vi.fn(),
    addSeverity: vi.fn(),
    endEpisode: vi.fn(),
    markSymptomFree: vi.fn(),
    listOptions: vi.fn(),
    createOption: vi.fn(),
  },
}));

describe('sparky_manage_symptoms tool', () => {
  const userId = 'user-123';
  const tz = 'America/New_York';
  const tools = buildSymptomTools(userId, tz);
  const tool = tools.sparky_manage_symptoms;
  const opts = toolOpts;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lists symptom definitions', async () => {
    vi.mocked(symptomService.listDefinitions).mockResolvedValueOnce([
      {
        id: 'def-1',
        user_id: userId,
        name: 'Migraine',
        display_name: null,
        category: 'head',
        template: 'headache',
        scale_type: '1-10',
        unit: null,
        is_glp1_flagged: false,
        sections: {},
        custom_field_defs: [],
        is_episodic: true,
        color: null,
        icon: null,
        is_pinned: true,
        sort_order: 0,
        is_archived: false,
        created_at: '2026-09-29T12:00:00.000Z',
        updated_at: '2026-09-29T12:00:00.000Z',
      },
    ]);

    const result = await tool.execute({ action: 'list_definitions' }, opts);
    expect(result).toContain('Migraine');
    // update_definition/delete_definition need it.
    expect(result).toContain('[ID: def-1]');
    expect(result).toContain('head');
  });

  it('creates a definition', async () => {
    vi.mocked(symptomService.createDefinition).mockResolvedValueOnce({
      id: 'def-2',
      user_id: userId,
      name: 'Lower Back Pain',
      display_name: null,
      category: 'pain',
      template: 'pain',
      scale_type: '1-10',
      unit: null,
      is_glp1_flagged: false,
      sections: {},
      custom_field_defs: [],
      is_episodic: false,
      color: null,
      icon: null,
      is_pinned: false,
      sort_order: 0,
      is_archived: false,
      created_at: '2026-09-29T12:00:00.000Z',
      updated_at: '2026-09-29T12:00:00.000Z',
    });

    const result = await tool.execute(
      {
        action: 'create_definition',
        name: 'Lower Back Pain',
        category: 'pain',
        template: 'pain',
        scale_type: '1-10',
      },
      opts
    );
    expect(result).toContain('Created symptom definition "Lower Back Pain"');
  });

  it('logs a quick symptom entry', async () => {
    vi.mocked(symptomService.createEntry).mockResolvedValueOnce({
      id: 'entry-1',
      user_id: userId,
      medication_id: null,
      symptom_id: null,
      symptom_name_snapshot: 'Headache',
      severity: 6,
      severity_label: '6',
      entry_date: '2026-10-01',
      logged_at: '2026-10-01T14:00:00.000Z',
      started_at: null,
      ended_at: null,
      body_location: 'Forehead',
      body_locations: ['Forehead'],
      qualities: ['throbbing'],
      associated_symptoms: ['nausea'],
      triggers: ['poor sleep'],
      phases: {},
      impact: 'mild',
      peak_severity: 6,
      severity_timeline: [],
      context_text: 'Felt it around noon',
      bristol_type: null,
      source: 'manual',
      custom_fields: {},
      created_at: '2026-10-01T14:00:00.000Z',
      updated_at: '2026-10-01T14:00:00.000Z',
      treatments: [],
      photo_ids: [],
    });

    const result = await tool.execute(
      {
        action: 'log_entry',
        symptom_name: 'Headache',
        severity: 6,
        body_locations: ['Forehead'],
        qualities: ['throbbing'],
      },
      opts
    );
    expect(result).toContain('Logged Headache for 2026-10-01');
    expect(result).toContain('Severity: 6');
  });

  it('starts and ends an ongoing episode', async () => {
    vi.mocked(symptomService.createEntry).mockResolvedValueOnce({
      id: 'entry-ep-1',
      user_id: userId,
      medication_id: null,
      symptom_id: null,
      symptom_name_snapshot: 'Migraine',
      severity: 7,
      severity_label: '7',
      entry_date: '2026-10-01',
      logged_at: '2026-10-01T15:00:00.000Z',
      started_at: '2026-10-01T15:00:00.000Z',
      ended_at: null,
      body_location: null,
      body_locations: ['behind left eye'],
      qualities: ['throbbing'],
      associated_symptoms: ['aura'],
      triggers: [],
      phases: {},
      impact: 'severe',
      peak_severity: 7,
      severity_timeline: [{ at: '2026-10-01T15:00:00.000Z', severity: 7 }],
      context_text: null,
      bristol_type: null,
      source: 'manual',
      custom_fields: {},
      created_at: '2026-10-01T15:00:00.000Z',
      updated_at: '2026-10-01T15:00:00.000Z',
      treatments: [],
      photo_ids: [],
    });

    const startResult = await tool.execute(
      {
        action: 'start_episode',
        symptom_name: 'Migraine',
        severity: 7,
        started_at: '2026-10-01T15:00:00.000Z',
      },
      opts
    );
    expect(startResult).toContain('Started ongoing episode for Migraine');

    vi.mocked(symptomService.endEpisode).mockResolvedValueOnce({
      id: 'entry-ep-1',
      user_id: userId,
      medication_id: null,
      symptom_id: null,
      symptom_name_snapshot: 'Migraine',
      severity: 7,
      severity_label: '7',
      entry_date: '2026-10-01',
      logged_at: '2026-10-01T15:00:00.000Z',
      started_at: '2026-10-01T15:00:00.000Z',
      ended_at: '2026-10-01T18:00:00.000Z',
      body_location: null,
      body_locations: ['behind left eye'],
      qualities: ['throbbing'],
      associated_symptoms: ['aura'],
      triggers: [],
      phases: {},
      impact: 'severe',
      peak_severity: 7,
      severity_timeline: [{ at: '2026-10-01T15:00:00.000Z', severity: 7 }],
      context_text: null,
      bristol_type: null,
      source: 'manual',
      custom_fields: {},
      created_at: '2026-10-01T15:00:00.000Z',
      updated_at: '2026-10-01T18:00:00.000Z',
      treatments: [],
      photo_ids: [],
    });

    const endResult = await tool.execute(
      {
        action: 'end_episode',
        id: '11111111-1111-1111-1111-111111111111',
      },
      opts
    );
    expect(endResult).toContain('Ended episode for Migraine');
  });

  it('marks a day symptom-free', async () => {
    vi.mocked(symptomService.markSymptomFree).mockResolvedValueOnce({
      id: 'free-1',
      entry_date: '2026-10-01',
    });

    const result = await tool.execute(
      {
        action: 'mark_symptom_free',
        entry_date: '2026-10-01',
      },
      opts
    );
    expect(result).toContain('Marked 2026-10-01 as a symptom-free day');
  });
});

describe('manageSymptomsInput (published MCP schema)', () => {
  it('keeps at and treatments[].taken_at, which the MCP layer would otherwise strip', async () => {
    const { manageSymptomsInput } =
      await import('../ai/tools/schemas/symptoms.js');
    const parsed = manageSymptomsInput.parse({
      action: 'update_severity',
      id: 'e1',
      severity: 6,
      at: '2026-11-25T08:00:00+01:00',
      treatments: [
        { name_snapshot: 'Ibuprofen', taken_at: '2026-11-25T07:30:00+01:00' },
      ],
    });
    expect(parsed.at).toBe('2026-11-25T08:00:00+01:00');
    expect(parsed.treatments?.[0].taken_at).toBe('2026-11-25T07:30:00+01:00');
  });
});

describe('sparky_manage_symptoms over MCP: published schema, then execute', () => {
  const tool = buildSymptomTools('user-123', 'UTC').sparky_manage_symptoms;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The MCP layer parses with the flat schema first and passes only what it
  // keeps, so each call goes through manageSymptomsInput before execute.
  const callOverMcp = async (args: Record<string, unknown>) => {
    const { manageSymptomsInput } =
      await import('../ai/tools/schemas/symptoms.js');
    return tool.execute!(manageSymptomsInput.parse(args), toolOpts);
  };

  it('passes update_severity at to the service', async () => {
    vi.mocked(symptomService.addSeverity).mockResolvedValueOnce({
      peak_severity: 6,
    } as never);
    await callOverMcp({
      action: 'update_severity',
      id: 'entry-1',
      severity: 6,
      at: '2026-11-25T08:00:00+01:00',
    });
    expect(symptomService.addSeverity).toHaveBeenCalledWith(
      'user-123',
      'entry-1',
      expect.objectContaining({ at: '2026-11-25T08:00:00+01:00' })
    );
  });

  it('passes treatments[].taken_at to the service', async () => {
    vi.mocked(symptomService.createEntry).mockResolvedValueOnce({
      id: 'entry-1',
      entry_date: '2026-11-25',
    } as never);
    await callOverMcp({
      action: 'log_entry',
      symptom_name: 'Headache',
      treatments: [
        { name_snapshot: 'Ibuprofen', taken_at: '2026-11-25T07:30:00+01:00' },
      ],
    });
    expect(symptomService.createEntry).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({
        treatments: [
          expect.objectContaining({ taken_at: '2026-11-25T07:30:00+01:00' }),
        ],
      })
    );
  });

  it('passes create_definition color and icon to the service', async () => {
    vi.mocked(symptomService.createDefinition).mockResolvedValueOnce({
      id: 'def-1',
      name: 'Migraine',
    } as never);
    await callOverMcp({
      action: 'create_definition',
      name: 'Migraine',
      color: '#ff0000',
      icon: 'brain',
    });
    expect(symptomService.createDefinition).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ color: '#ff0000', icon: 'brain' })
    );
  });

  it('publishes every field the per-action schemas accept', async () => {
    const { manageSymptomsInput, manageSymptomsSchema } =
      await import('../ai/tools/schemas/symptoms.js');
    const published = new Set(Object.keys(manageSymptomsInput.shape));
    const missing = manageSymptomsSchema.options.flatMap((option) =>
      Object.keys(option.shape)
        .filter((key) => !published.has(key))
        .map((key) => `${option.shape.action.value}.${key}`)
    );
    expect(missing).toEqual([]);
  });

  it('publishes every treatment field the per-action schemas accept', async () => {
    const { manageSymptomsInput, manageSymptomsSchema } =
      await import('../ai/tools/schemas/symptoms.js');
    // Unwrap optional/default to the array, then take its item object.
    const itemKeys = (schema: unknown): string[] => {
      let s = schema as {
        def: { type: string; innerType?: unknown; element?: unknown };
      };
      while (s.def.type === 'optional' || s.def.type === 'default') {
        s = s.def.innerType as typeof s;
      }
      return Object.keys((s.def.element as { shape: object }).shape);
    };
    const published = new Set(itemKeys(manageSymptomsInput.shape.treatments));
    const missing = manageSymptomsSchema.options.flatMap((option) => {
      const shape = option.shape as Record<string, unknown>;
      if (!shape.treatments) return [];
      return itemKeys(shape.treatments)
        .filter((key) => !published.has(key))
        .map((key) => `${option.shape.action.value}.treatments.${key}`);
    });
    expect(missing).toEqual([]);
  });

  describe('published schema bounds', () => {
    const base = { action: 'update_severity', id: 'entry-1' };
    it.each([
      ['severity 11', { ...base, severity: 11 }],
      ['severity -1', { ...base, severity: -1 }],
      [
        'at without offset',
        { ...base, severity: 5, at: '2026-11-25T08:00:00' },
      ],
      [
        'started_at without offset',
        {
          action: 'start_episode',
          symptom_name: 'Migraine',
          started_at: '2026-11-25T08:00:00',
        },
      ],
      [
        'taken_at as a date',
        {
          action: 'log_entry',
          symptom_name: 'Headache',
          treatments: [{ name_snapshot: 'Ibuprofen', taken_at: '2026-11-25' }],
        },
      ],
      [
        'empty treatment name',
        {
          action: 'log_entry',
          symptom_name: 'Headache',
          treatments: [{ name_snapshot: '' }],
        },
      ],
    ])('refuses %s', async (_label, args) => {
      const { manageSymptomsInput } =
        await import('../ai/tools/schemas/symptoms.js');
      expect(manageSymptomsInput.safeParse(args).success).toBe(false);
    });

    it.each([
      ['severity 0', { ...base, severity: 0 }],
      [
        'severity 10 with a Z timestamp',
        { ...base, severity: 10, at: '2026-11-25T08:00:00Z' },
      ],
      [
        'offset timestamps',
        {
          action: 'log_entry',
          symptom_name: 'Headache',
          started_at: '2026-11-25T07:00:00+01:00',
          ended_at: '2026-11-25T09:00:00+01:00',
          treatments: [
            {
              name_snapshot: 'Ibuprofen',
              taken_at: '2026-11-25T07:30:00+01:00',
            },
          ],
        },
      ],
    ])('accepts %s', async (_label, args) => {
      const { manageSymptomsInput } =
        await import('../ai/tools/schemas/symptoms.js');
      expect(manageSymptomsInput.safeParse(args).success).toBe(true);
    });

    it('publishes the datetime fields without the regex pattern', async () => {
      const { manageSymptomsInput } =
        await import('../ai/tools/schemas/symptoms.js');
      const json = JSON.stringify(
        z.toJSONSchema(manageSymptomsInput, { io: 'input' })
      );
      expect(json).toContain('"format":"date-time"');
      expect(json).not.toContain('"pattern"');
    });
  });

  it('get_ongoing shows each episode id for update_severity/end_episode', async () => {
    vi.mocked(symptomService.listOngoing).mockResolvedValueOnce([
      {
        id: 'entry-11',
        symptom_name_snapshot: 'Migraine',
        started_at: '2026-11-25T07:00:00.000Z',
        severity: 6,
      },
    ] as never);
    const result = await callOverMcp({ action: 'get_ongoing' });
    expect(result).toMatch(
      /• Migraine \(Started [^)]* · Severity: 6\) \[ID: entry-11\]/
    );
  });

  it('list_entries shows each entry id for update_severity/end_episode', async () => {
    vi.mocked(symptomService.listEntries).mockResolvedValueOnce([
      {
        id: 'entry-9',
        symptom_name_snapshot: 'Migraine',
        entry_date: '2026-11-24',
        severity: 7,
        started_at: '2026-11-24T08:00:00.000Z',
        ended_at: '2026-11-24T12:00:00.000Z',
        body_locations: [],
      },
      {
        id: 'entry-10',
        symptom_name_snapshot: 'Headache',
        entry_date: '2026-11-25',
        severity: null,
        started_at: '2026-11-25T07:00:00.000Z',
        ended_at: null,
        body_locations: ['left temple'],
      },
    ] as never);
    const result = await tool.execute!(
      { action: 'list_entries', from: '2026-11-20', to: '2026-11-25' },
      toolOpts
    );
    expect(result).toContain(
      '• 2026-11-24: Migraine · Severity 7 [ID: entry-9]'
    );
    expect(result).toContain(
      '• 2026-11-25: Headache [ONGOING] (left temple) [ID: entry-10]'
    );
  });

  describe('from/to day keywords', () => {
    // 03:00 UTC on the 26th is still the 25th in New York.
    const nyTool = buildSymptomTools(
      'user-123',
      'America/New_York'
    ).sparky_manage_symptoms;
    const callInNewYork = async (args: Record<string, unknown>) => {
      const { manageSymptomsInput } =
        await import('../ai/tools/schemas/symptoms.js');
      return nyTool.execute!(manageSymptomsInput.parse(args), toolOpts);
    };

    afterEach(() => {
      vi.useRealTimers();
    });

    it('resolves today and yesterday in the user timezone for list_entries', async () => {
      vi.useFakeTimers({
        now: new Date('2026-11-26T03:00:00Z'),
        toFake: ['Date'],
      });
      vi.mocked(symptomService.listEntries).mockResolvedValueOnce([]);

      await callInNewYork({
        action: 'list_entries',
        from: 'yesterday',
        to: 'Today',
      });

      expect(symptomService.listEntries).toHaveBeenCalledWith('user-123', {
        fromDate: '2026-11-24',
        toDate: '2026-11-25',
        symptomId: undefined,
        episodesOnly: undefined,
      });
    });

    it('returns a validation error, not a crash, for arguments that are not an object', async () => {
      const result = await nyTool.execute!(null as never, toolOpts);
      expect(String(result)).toContain('Error');
    });

    it('resolves keywords and timestamps for get_metrics', async () => {
      vi.useFakeTimers({
        now: new Date('2026-11-26T03:00:00Z'),
        toFake: ['Date'],
      });
      vi.mocked(symptomService.listEntries).mockResolvedValueOnce([]);

      const result = await callInNewYork({
        action: 'get_metrics',
        from: '2026-11-01T00:00:00Z',
        to: 'today',
      });

      expect(symptomService.listEntries).toHaveBeenCalledWith('user-123', {
        fromDate: '2026-11-01',
        toDate: '2026-11-25',
      });
      expect(result).toContain('from 2026-11-01 to 2026-11-25');
    });
  });
});

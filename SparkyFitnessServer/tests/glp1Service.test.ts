import { vi, beforeEach, describe, expect, it } from 'vitest';
import injectionRepository from '../models/injectionRepository.js';
import medicationRepository from '../models/medicationRepository.js';
import glp1Service from '../services/glp1Service.js';

vi.mock('../models/injectionRepository.js');
vi.mock('../models/medicationRepository.js');

const USER_ID = 'user-1';
const MED_ID = 'med-1';

// `name` has to resolve to a real GLP-1 profile, otherwise the service short-circuits
// to the empty-curve branch before it ever computes an anchor.
const OZEMPIC = {
  id: MED_ID,
  name: 'Ozempic',
  custom_fields: null,
};

function mockInjections(injectedAt: string[]) {
  vi.mocked(injectionRepository.listInjections).mockResolvedValue(
    injectedAt.map((at, i) => ({
      id: `inj-${i}`,
      injected_at: at,
      site: null,
      dose_mg: 1,
    })) as never
  );
}

describe('glp1Service.getSerumCurve — anchorDate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(medicationRepository.getMedicationById).mockResolvedValue(
      OZEMPIC as never
    );
  });

  it('anchors day 0 at the earliest injection', async () => {
    mockInjections([
      '2026-03-10T09:00:00.000Z',
      '2026-03-03T09:00:00.000Z',
      '2026-03-17T09:00:00.000Z',
    ]);

    const result = await glp1Service.getSerumCurve(USER_ID, MED_ID);

    expect(result.anchorDate).toBe('2026-03-03T09:00:00.000Z');
  });

  it('anchors on the earliest injection even when rows arrive out of order', async () => {
    mockInjections([
      '2026-05-20T12:00:00.000Z',
      '2026-05-06T12:00:00.000Z',
      '2026-05-13T12:00:00.000Z',
    ]);

    const result = await glp1Service.getSerumCurve(USER_ID, MED_ID);

    expect(result.anchorDate).toBe('2026-05-06T12:00:00.000Z');
  });

  it('places each doseDay at the offset the anchor implies', async () => {
    mockInjections([
      '2026-03-03T09:00:00.000Z',
      '2026-03-10T09:00:00.000Z',
      '2026-03-17T09:00:00.000Z',
    ]);

    const result = await glp1Service.getSerumCurve(USER_ID, MED_ID);

    // Weekly dosing anchored at the first shot: day 0, 7 and 14. This is what lets a
    // client reconstruct real dates as anchorDate + day, so it has to stay in step.
    expect(result.doseDays).toEqual([0, 7, 14]);
    expect(result.anchorDate).toBe('2026-03-03T09:00:00.000Z');
  });

  it('returns a null anchor when there are no injections to anchor to', async () => {
    mockInjections([]);

    const result = await glp1Service.getSerumCurve(USER_ID, MED_ID);

    expect(result.anchorDate).toBeNull();
    expect(result.curve).toEqual([]);
  });

  it('returns a null anchor when the drug is not a recognized GLP-1', async () => {
    vi.mocked(medicationRepository.getMedicationById).mockResolvedValue({
      id: MED_ID,
      name: 'Not A GLP-1',
      custom_fields: null,
    } as never);
    mockInjections(['2026-03-03T09:00:00.000Z']);

    const result = await glp1Service.getSerumCurve(USER_ID, MED_ID);

    expect(result.anchorDate).toBeNull();
  });
});

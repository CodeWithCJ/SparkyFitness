import {
  glp1FormDefaults,
  isAutofilledGlp1Name,
  penDosesLeft,
  penExpiryStatus,
  resolveMapSites,
  usablePens,
} from '../../src/utils/glp1';
import type { MedicationPen } from '@workspace/shared';

const pen = (overrides: Partial<MedicationPen>): MedicationPen => ({
  id: 'p',
  medication_id: 'm',
  kind: 'pen',
  label: null,
  dose_mg: null,
  concentration_mg_ml: null,
  volume_ml: null,
  doses_total: 4,
  doses_used: 1,
  status: 'sealed',
  opened_at: null,
  expiry_date: null,
  bud_date: null,
  reorder_flag: false,
  reorder_threshold: null,
  notes: null,
  ...overrides,
});

describe('glp1 utils', () => {
  it('returns every drawable site when no active set is saved', () => {
    const sites = resolveMapSites(null);
    expect(sites.length).toBeGreaterThan(10);
    expect(sites.some((s) => s.id === 'unknown')).toBe(false);
  });

  it('honors the saved active sites and their order', () => {
    const ids = resolveMapSites(['left_thigh', 'bogus', 'left_arm']).map(
      (s) => s.id
    );
    expect(ids).toEqual(['left_thigh', 'left_arm']);
  });

  it('counts doses left without going negative', () => {
    expect(penDosesLeft(pen({ doses_total: 4, doses_used: 1 }))).toBe(3);
    expect(penDosesLeft(pen({ doses_total: 4, doses_used: 6 }))).toBe(0);
    expect(penDosesLeft(pen({ doses_total: null }))).toBeNull();
  });

  it('classifies expiry by calendar day', () => {
    expect(penExpiryStatus(null, '2026-10-05')).toBeNull();
    expect(penExpiryStatus('2026-10-04', '2026-10-05')).toBe('expired');
    expect(penExpiryStatus('2026-10-05', '2026-10-05')).toBe('soon');
    expect(penExpiryStatus('2026-10-12', '2026-10-05')).toBe('soon');
    expect(penExpiryStatus('2026-10-13', '2026-10-05')).toBe('ok');
  });

  it('puts the in-use pen first and drops finished ones', () => {
    const ordered = usablePens([
      pen({ id: 'a', status: 'sealed' }),
      pen({ id: 'b', status: 'finished' }),
      pen({ id: 'c', status: 'in_use' }),
    ]).map((p) => p.id);
    expect(ordered).toEqual(['c', 'a']);
  });
});

describe('glp1FormDefaults', () => {
  it('makes injectable drugs an injection in mg', () => {
    expect(glp1FormDefaults('tirzepatide')).toEqual({
      name: 'Tirzepatide',
      typeId: 'injection',
      strengthUnit: 'mg',
      doseUnit: 'mg',
    });
  });

  it('makes oral semaglutide a tablet', () => {
    expect(glp1FormDefaults('oral_semaglutide')?.typeId).toBe('tablet');
  });

  it('returns null for an unknown drug', () => {
    expect(glp1FormDefaults('nope')).toBeNull();
  });

  it('only overwrites an empty or previously autofilled name', () => {
    expect(isAutofilledGlp1Name('')).toBe(true);
    expect(isAutofilledGlp1Name('Semaglutide')).toBe(true);
    expect(isAutofilledGlp1Name('My Ozempic')).toBe(false);
  });
});

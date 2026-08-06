import { positiveDoseOrNull } from '@/pages/Medications/medicationUtils';

// The server's dose_amount schema is `.positive().nullable()`, so the only two shapes
// it accepts from these inputs are a positive number or null. The number inputs that
// feed it are saved via onClick rather than a native form submit, so their `min`
// attribute never runs constraint validation and the normalisation has to happen here.
describe('positiveDoseOrNull', () => {
  it('keeps positive doses, including fractional ones', () => {
    expect(positiveDoseOrNull('1')).toBe(1);
    expect(positiveDoseOrNull('0.5')).toBe(0.5);
    expect(positiveDoseOrNull('600')).toBe(600);
  });

  it('maps zero to null rather than sending a value the API rejects', () => {
    expect(positiveDoseOrNull('0')).toBeNull();
    expect(positiveDoseOrNull('0.0')).toBeNull();
  });

  it('maps negatives to null', () => {
    expect(positiveDoseOrNull('-1')).toBeNull();
    expect(positiveDoseOrNull('-0.5')).toBeNull();
  });

  it('treats an empty or non-numeric input as "no dose"', () => {
    expect(positiveDoseOrNull('')).toBeNull();
    expect(positiveDoseOrNull('   ')).toBeNull();
    expect(positiveDoseOrNull('abc')).toBeNull();
  });
});

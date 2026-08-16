import { isCountableForm } from '@/pages/Medications/medicationUtils';

jest.mock('@/i18n', () => ({
  __esModule: true,
  default: { t: (key: string, defaultValue?: string) => defaultValue || key },
}));

describe('isCountableForm', () => {
  it.each(['tablet', 'capsule', 'softgel', 'gummy', 'pill'])(
    'counts %s',
    (form) => {
      expect(isCountableForm(form)).toBe(true);
    }
  );

  it.each(['powder', 'liquid'])('does not count %s', (form) => {
    // A serving of these is a scoop or a volume, so "1 serving = 1 liquid" is not a
    // sentence. The panel heading alone is unambiguous for them.
    expect(isCountableForm(form)).toBe(false);
  });

  it('handles a missing form', () => {
    expect(isCountableForm(null)).toBe(false);
    expect(isCountableForm(undefined)).toBe(false);
    expect(isCountableForm('')).toBe(false);
  });
});

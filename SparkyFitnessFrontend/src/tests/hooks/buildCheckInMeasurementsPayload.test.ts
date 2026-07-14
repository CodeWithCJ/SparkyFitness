// Break the transitive import of better-auth (ESM-only), which Jest cannot
// parse; the function under test is pure and never touches these modules.
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({}),
}));

import { buildCheckInMeasurementsPayload } from '@/hooks/CheckIn/useCheckInLogic';
import { CheckInMeasurementsResponse } from '@workspace/shared';

const emptyForm = {
  weight: '',
  neck: '',
  waist: '',
  hips: '',
  steps: '',
  height: '',
  bodyFatPercentage: '',
};

const dayRecord = (
  overrides: Partial<CheckInMeasurementsResponse>
): CheckInMeasurementsResponse => ({
  id: 'record-1',
  user_id: 'user-1',
  entry_date: '2026-07-14',
  weight: null,
  neck: null,
  waist: null,
  hips: null,
  steps: null,
  height: null,
  body_fat_percentage: null,
  created_by_user_id: 'user-1',
  updated_by_user_id: 'user-1',
  updated_at: '2026-07-14T00:00:00Z',
  ...overrides,
});

describe('buildCheckInMeasurementsPayload', () => {
  it('omits fields with no input and nothing recorded on the day', () => {
    const payload = buildCheckInMeasurementsPayload(
      '2026-07-14',
      { ...emptyForm, weight: '80.5' },
      null
    );

    expect(payload).toEqual({ entry_date: '2026-07-14', weight: 80.5 });
  });

  it('omits untouched empty fields even when other fields are recorded on the day', () => {
    const payload = buildCheckInMeasurementsPayload(
      '2026-07-14',
      { ...emptyForm, weight: '80.5' },
      dayRecord({ weight: 81 })
    );

    expect(payload).toEqual({ entry_date: '2026-07-14', weight: 80.5 });
    expect(payload).not.toHaveProperty('waist');
    expect(payload).not.toHaveProperty('height');
  });

  it('clears a field recorded on the day when the user empties it', () => {
    const payload = buildCheckInMeasurementsPayload(
      '2026-07-14',
      emptyForm,
      dayRecord({ waist: 90 })
    );

    expect(payload).toEqual({ entry_date: '2026-07-14', waist: null });
  });

  it('parses steps as an integer', () => {
    const payload = buildCheckInMeasurementsPayload(
      '2026-07-14',
      { ...emptyForm, steps: '10500' },
      null
    );

    expect(payload).toEqual({ entry_date: '2026-07-14', steps: 10500 });
  });

  it('treats whitespace-only input as empty', () => {
    const payload = buildCheckInMeasurementsPayload(
      '2026-07-14',
      { ...emptyForm, neck: '   ' },
      null
    );

    expect(payload).toEqual({ entry_date: '2026-07-14' });
  });

  it('omits unparseable input instead of clearing the recorded value', () => {
    const payload = buildCheckInMeasurementsPayload(
      '2026-07-14',
      { ...emptyForm, weight: 'abc' },
      dayRecord({ weight: 81 })
    );

    expect(payload).toEqual({ entry_date: '2026-07-14' });
  });
});

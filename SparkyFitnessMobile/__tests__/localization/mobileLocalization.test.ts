import {
  MOBILE_LANGUAGE,
  MOBILE_LOCALE,
  isMobileRtl,
  localizeExerciseCategory,
  mobileT,
} from '../../src/localization';

describe('mobile localization', () => {
  it('defaults to Saudi Arabic and RTL', () => {
    expect(MOBILE_LANGUAGE).toBe('ar');
    expect(MOBILE_LOCALE).toBe('ar-SA');
    expect(isMobileRtl).toBe(true);
  });

  it('renders Najdi copy and interpolates values', () => {
    expect(mobileT('tabs.dashboard')).toBe('الرئيسية');
    expect(
      mobileT('alerts.unsavedDraft', {
        activityType: 'تمرين',
      }),
    ).toBe('عندك مسودة تمرين ما حفظتها. وش تبي تسوي؟');
  });

  it('falls back to the supplied copy for a missing key', () => {
    expect(mobileT('missing.key', undefined, 'نص احتياطي')).toBe('نص احتياطي');
  });

  it('localizes known exercise categories without changing custom categories', () => {
    expect(localizeExerciseCategory('strength')).toBe('قوة');
    expect(localizeExerciseCategory('CrossFit')).toBe('CrossFit');
  });
});

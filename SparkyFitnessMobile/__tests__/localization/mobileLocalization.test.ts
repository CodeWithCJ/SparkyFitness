import {
  MOBILE_LANGUAGE,
  MOBILE_LOCALE,
  isMobileRtl,
  formatMobileCalories,
  formatMobileDuration,
  formatMobileExerciseCount,
  formatMobileFoodVariantLabel,
  formatMobileNumber,
  formatMobileRepCount,
  formatMobileServingCount,
  formatMobileSetCount,
  localizeExerciseCategory,
  localizeMealType,
  localizeServingDescription,
  localizeServingUnit,
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

  it('localizes diary meal types, serving units, and numbers', () => {
    expect(localizeMealType('Breakfast')).toBe('الفطور');
    expect(localizeMealType('وجبة النادي')).toBe('وجبة النادي');
    expect(localizeServingUnit('cups')).toBe('كوب');
    expect(formatMobileNumber(1234.5)).toBe('١٬٢٣٤٫٥');
    expect(formatMobileCalories(350)).toBe('٣٥٠ سعرة');
    expect(localizeServingDescription('1 cup (250 ml)')).toBe('١ كوب (٢٥٠ مل)');
    expect(localizeServingDescription('1.5 fl oz')).toBe(
      '١٫٥ أونصة سائلة',
    );
    expect(
      formatMobileFoodVariantLabel({
        servingSize: 1,
        servingUnit: 'oz',
        calories: 120,
      }),
    ).toBe('١ أونصة (١٢٠ سعرة)');
  });

  it('uses natural Arabic serving counts', () => {
    expect(formatMobileServingCount(1)).toBe('حصة واحدة');
    expect(formatMobileServingCount(2)).toBe('حصتين');
    expect(formatMobileServingCount(5)).toBe('٥ حصص');
    expect(formatMobileServingCount(1.5)).toBe('١٫٥ حصة');
  });

  it('uses Arabic singular, dual, and plural workout summaries', () => {
    expect(formatMobileExerciseCount(1)).toBe('تمرين واحد');
    expect(formatMobileExerciseCount(2)).toBe('تمرينين');
    expect(formatMobileExerciseCount(5)).toBe('٥ تمارين');
    expect(formatMobileSetCount(2)).toBe('مجموعتين');
    expect(formatMobileRepCount(1)).toBe('تكرار واحد');
    expect(formatMobileRepCount(8)).toBe('٨ تكرارات');
    expect(formatMobileDuration(90)).toBe('ساعة و٣٠ دقيقة');
  });
});

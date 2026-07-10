import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import MoodMeter from '@/pages/CheckIn/MoodMeter';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue?: string | Record<string, string>,
      options?: Record<string, string>
    ) => {
      const values =
        typeof defaultValue === 'object' ? defaultValue : (options ?? {});
      const translations: Record<string, string> = {
        'moodMeter.intensity': 'مزاجك بشكل عام',
        'moodMeter.moods': 'وش تحس فيه؟',
        'moodMeter.manage': 'تخصيص',
        'moodMeter.manageMoods': 'تخصيص المشاعر',
        'moodMeter.addCustom': 'أضف شعورًا يناسبك',
        'moodMeter.moodName': 'اسم الشعور',
        'moodMeter.addMood': 'إضافة الشعور',
        'moodMeter.showHide': 'اختر المشاعر اللي تظهر لك',
        'moodMeter.sad': 'حزين',
        'moodMeter.angry': 'معصّب',
        'moodMeter.worried': 'قلقان',
        'moodMeter.neutral': 'عادي',
        'moodMeter.thoughtful': 'متأمل',
        'moodMeter.calm': 'رايق',
        'moodMeter.confident': 'واثق',
        'moodMeter.happy': 'مبسوط',
        'moodMeter.excited': 'متحمّس',
        'moodMeter.energetic': 'نشيط',
        'moodMeter.sensitive': 'حسّاس',
        'moodMeter.tired': 'تعبان',
        'moodMeter.low': 'طاقتي منخفضة',
        'moodMeter.anxious': 'متوتر',
        'moodMeter.irritable': 'منزعج',
        'moodMeter.selectEmoji': 'اختيار الرمز {{emoji}}',
        'moodMeter.selectColor': 'اختيار اللون {{color}}',
        'moodMeter.colors.sky': 'السماوي',
        'moodMeter.colors.green': 'الأخضر الهادئ',
        'moodMeter.colors.amber': 'الذهبي',
        'moodMeter.colors.period': 'المرجاني',
        'moodMeter.colors.lavender': 'البنفسجي الفاتح',
        'moodMeter.colors.neutral': 'الحيادي',
        'moodMeter.hideMood': 'إخفاء {{mood}}',
      };
      const fallback = typeof defaultValue === 'string' ? defaultValue : key;
      const template = translations[key] ?? fallback;
      return Object.entries(values).reduce(
        (value, [name, replacement]) =>
          value.replaceAll(`{{${name}}}`, replacement),
        template
      );
    },
  }),
}));

jest.mock('@/hooks/CheckIn/useMood', () => ({
  useCustomMoods: () => ({ data: [] }),
  useCreateCustomMoodMutation: () => ({
    isPending: false,
    mutateAsync: jest.fn(),
  }),
  useDeleteCustomMoodMutation: () => ({ mutate: jest.fn() }),
  useMoodDisplayPreferences: () => ({ data: { hidden_moods: [] } }),
  useUpdateMoodDisplayPreferencesMutation: () => ({ mutate: jest.fn() }),
}));

describe('MoodMeter', () => {
  it('uses localized names for built-in moods and controls', () => {
    render(
      <MoodMeter
        mood={65}
        notes=""
        moodTags={[]}
        onMoodChange={jest.fn()}
        onNotesChange={jest.fn()}
        onTagsChange={jest.fn()}
      />
    );

    expect(
      screen.getByRole('slider', { name: 'مزاجك بشكل عام' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'رايق' })).toBeInTheDocument();
    expect(screen.queryByText('Calm')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'تخصيص' }));

    expect(
      screen.getByRole('dialog', { name: 'تخصيص المشاعر' })
    ).toBeInTheDocument();
    expect(screen.getByLabelText('اسم الشعور')).toBeInTheDocument();
    expect(screen.getByLabelText('اختيار الرمز 🙂')).toBeInTheDocument();
    expect(screen.getByLabelText('اختيار اللون السماوي')).toBeInTheDocument();
    expect(screen.getByLabelText('إخفاء حزين')).toBeInTheDocument();
    expect(screen.queryByText(/Sad|Calm|Happy/)).not.toBeInTheDocument();
  });
});

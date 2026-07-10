import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { UnitInput } from '@/components/ui/UnitInput';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      key: string,
      defaultValue?: string,
      options?: Record<string, string>
    ) => {
      const translations: Record<string, string> = {
        'units.kilogram': 'كجم',
        'units.pound': 'رطل',
        'units.stone': 'ستون',
        'units.foot': 'قدم',
        'units.inch': 'بوصة',
        'unitInput.valueInUnit': '{{label}}: {{unit}}',
      };
      const template = translations[key] ?? defaultValue ?? key;
      return Object.entries(options ?? {}).reduce(
        (value, [name, replacement]) =>
          value.replaceAll(`{{${name}}}`, replacement),
        template
      );
    },
  }),
}));

describe('UnitInput', () => {
  it('localizes a single unit and keeps numeric entry left-to-right', () => {
    const { container } = render(
      <UnitInput
        value={72.5}
        unit="kg"
        type="weight"
        aria-label="الوزن"
        onChange={jest.fn()}
      />
    );

    expect(screen.getByLabelText('الوزن')).toHaveAttribute('dir', 'ltr');
    expect(screen.getByText('كجم')).toHaveClass('end-6');
    expect(container.querySelector('input')).toHaveClass('pe-16');
  });

  it('gives both stone-and-pound fields distinct Arabic labels', () => {
    render(
      <UnitInput
        value={72.5}
        unit="st_lbs"
        type="weight"
        aria-label="الوزن"
        onChange={jest.fn()}
      />
    );

    expect(screen.getByLabelText('الوزن: ستون')).toBeInTheDocument();
    expect(screen.getByLabelText('الوزن: رطل')).toBeInTheDocument();
  });
});

import { useState } from 'react';
import type { CustomCategoriesResponse } from '@workspace/shared';
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CheckInForm } from '@/pages/CheckIn/CheckInForm';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    // Mirrors the two call shapes used here: a plain default string, and an
    // options object carrying `defaultValue` plus interpolation values.
    t: (_key: string, arg?: unknown) =>
      typeof arg === 'string'
        ? arg
        : ((arg as { defaultValue?: string } | undefined)?.defaultValue ??
          _key),
  }),
}));

jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({
    weightUnit: 'kg',
    measurementUnit: 'cm',
  }),
}));

const emptyPlaceholders = {
  weight: null,
  neck: null,
  waist: null,
  hips: null,
  height: null,
  bodyFatPercentage: null,
  bmr: null,
};

const defaultProps = {
  bodyFatPercentage: '',
  muscleMassKg: '',
  boneMassKg: '',
  bodyWaterPercentage: '',
  bmr: '',
  customCategories: [],
  customNotes: {},
  customPlaceholders: {},
  customValues: {},
  handleCalculateBodyFat: jest.fn(),
  handleSubmit: jest.fn(),
  height: '180',
  hips: '',
  loading: false,
  neck: '',
  placeholders: emptyPlaceholders,
  setBodyFatPercentage: jest.fn(),
  setMuscleMassKg: jest.fn(),
  setBoneMassKg: jest.fn(),
  setBodyWaterPercentage: jest.fn(),
  setBmr: jest.fn(),
  setCustomNotes: jest.fn(),
  setCustomValues: jest.fn(),
  setHeight: jest.fn(),
  setHips: jest.fn(),
  setNeck: jest.fn(),
  setSteps: jest.fn(),
  setUseMostRecentForCalculation: jest.fn(),
  setWaist: jest.fn(),
  setWeight: jest.fn(),
  shouldConvertCustomMeasurement: jest.fn(),
  steps: '',
  useMostRecentForCalculation: false,
  waist: '',
  weight: '',
};

describe('CheckInForm', () => {
  it('renders the height input with the current height value', () => {
    render(<CheckInForm {...defaultProps} />);

    const heightInput = screen.getByLabelText('Height');

    expect(heightInput).toBeInTheDocument();
    expect(heightInput).toHaveValue(180);
  });

  it('shows carried-forward values as placeholders, not input values', () => {
    render(
      <CheckInForm
        {...defaultProps}
        weight=""
        placeholders={{ ...emptyPlaceholders, weight: 82.5 }}
      />
    );

    const weightInput = screen.getByLabelText('Weight');

    expect(weightInput).toHaveValue(null);
    expect(weightInput).toHaveAttribute('placeholder', '82.5');
  });

  it('prefers the entered value over the placeholder', () => {
    render(
      <CheckInForm
        {...defaultProps}
        weight="80"
        placeholders={{ ...emptyPlaceholders, weight: 82.5 }}
      />
    );

    expect(screen.getByLabelText('Weight')).toHaveValue(80);
  });

  it('adopts the carried-forward value when "Use last" is clicked', () => {
    const setWeight = jest.fn();
    render(
      <CheckInForm
        {...defaultProps}
        weight=""
        placeholders={{ ...emptyPlaceholders, weight: 82.5 }}
        setWeight={setWeight}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use last' }));

    expect(setWeight).toHaveBeenCalledWith('82.5');
  });

  it('hides "Use last" when the field already has a value', () => {
    render(
      <CheckInForm
        {...defaultProps}
        weight="80"
        placeholders={{ ...emptyPlaceholders, weight: 82.5 }}
      />
    );

    expect(
      screen.queryByRole('button', { name: 'Use last' })
    ).not.toBeInTheDocument();
  });

  it('hides "Use last" when there is no carried-forward value', () => {
    render(<CheckInForm {...defaultProps} weight="" />);

    expect(
      screen.queryByRole('button', { name: 'Use last' })
    ).not.toBeInTheDocument();
  });

  describe('measurement field layout', () => {
    const categories: CustomCategoriesResponse[] = [
      {
        id: 'sample-size',
        name: 'A long custom measurement label that can wrap across lines',
        display_name: null,
        measurement_type: 'cm',
        frequency: 'Daily',
        data_type: 'numeric',
      },
      {
        id: 'sample-text',
        name: 'Sample journal',
        display_name: null,
        measurement_type: 'text',
        frequency: 'Daily',
        data_type: 'text',
      },
    ];
    const fieldIds = [
      'weight',
      'height',
      'steps',
      'neck',
      'waist',
      'hips',
      'bodyFat',
      'muscleMass',
      'boneMass',
      'bodyWater',
      'bmr',
      'custom-sample-size',
      'custom-sample-text',
    ];

    it('shares responsive header/control tracks for all fields, with or without actions', () => {
      const props = {
        ...defaultProps,
        customCategories: categories,
        placeholders: { ...emptyPlaceholders, weight: 72.5 },
        customPlaceholders: { 'sample-size': 28 },
      };
      const { container, rerender } = render(<CheckInForm {...props} />);

      // jsdom cannot measure geometry. Guard the shared layout contract here;
      // input baselines and wrapping also need a real-browser check.
      const assertLayout = () => {
        const grid = container.querySelector('form > div')!;
        expect(grid).toHaveClass('grid-cols-1', 'md:grid-cols-2');
        expect(grid.children).toHaveLength(fieldIds.length);
        Array.from(grid.children).forEach((field, index) => {
          expect(field).toHaveClass(
            'min-w-0',
            'gap-1',
            'md:row-span-2',
            'md:grid-rows-subgrid'
          );
          const header = field.children[0]!;
          expect(header).toHaveClass('min-h-7', 'min-w-0', 'flex-wrap');
          expect(header.querySelector('label')).toHaveAttribute(
            'for',
            fieldIds[index]
          );
          expect(header.querySelector('label')).toHaveClass('break-words');
          expect(field.children[1]!.querySelector('input[id]')).toHaveAttribute(
            'id',
            fieldIds[index]
          );
        });
        for (const category of categories) {
          const value = container.querySelector(`#custom-${category.id}`)!;
          const notes = container.querySelector(
            `#custom-notes-${category.id}`
          )!;
          expect(notes).toHaveClass('mt-2');
          expect(value.compareDocumentPosition(notes)).toBe(
            Node.DOCUMENT_POSITION_FOLLOWING
          );
        }
      };

      assertLayout();
      expect(screen.getAllByRole('button', { name: 'Use last' })).toHaveLength(
        2
      );

      rerender(
        <CheckInForm
          {...props}
          weight="72.5"
          customValues={{ 'sample-size': '28' }}
        />
      );
      expect(
        screen.queryByRole('button', { name: 'Use last' })
      ).not.toBeInTheDocument();
      assertLayout();
    });

    it('keeps body-fat actions separate from form submission', () => {
      const handleSubmit = jest.fn();
      const handleCalculateBodyFat = jest.fn();
      const setUseMostRecentForCalculation = jest.fn();
      const setBodyFatPercentage = jest.fn();
      render(
        <CheckInForm
          {...defaultProps}
          handleSubmit={handleSubmit}
          handleCalculateBodyFat={handleCalculateBodyFat}
          setUseMostRecentForCalculation={setUseMostRecentForCalculation}
          setBodyFatPercentage={setBodyFatPercentage}
          placeholders={{ ...emptyPlaceholders, bodyFatPercentage: 21.5 }}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Use last' }));
      expect(setBodyFatPercentage).toHaveBeenCalledWith('21.5');
      fireEvent.click(screen.getByRole('switch', { name: 'Use Recent' }));
      expect(setUseMostRecentForCalculation).toHaveBeenCalledWith(true);
      fireEvent.click(screen.getByRole('button', { name: 'Calculate' }));
      expect(handleCalculateBodyFat).toHaveBeenCalledTimes(1);
      expect(handleSubmit).not.toHaveBeenCalled();
    });

    it('preserves custom values and notes when adopting and editing measurements', () => {
      function StatefulForm() {
        const [customValues, setCustomValues] = useState<
          Record<string, string>
        >({});
        const [customNotes, setCustomNotes] = useState<Record<string, string>>({
          'sample-size': 'Synthetic note',
        });
        return (
          <CheckInForm
            {...defaultProps}
            customCategories={categories}
            shouldConvertCustomMeasurement={(unit) => unit === 'cm'}
            customValues={customValues}
            customNotes={customNotes}
            setCustomValues={setCustomValues}
            setCustomNotes={setCustomNotes}
            customPlaceholders={{
              'sample-size': 28,
              'sample-text': 'Sample text',
            }}
          />
        );
      }
      const { container } = render(<StatefulForm />);
      const size = screen.getByLabelText(`${categories[0]!.name} (cm)`);
      const journal = screen.getByLabelText('Sample journal (text)');
      const sizeField = size.closest('.md\\:row-span-2')!;
      fireEvent.click(
        within(sizeField as HTMLElement).getByRole('button', {
          name: 'Use last',
        })
      );
      expect(size).toHaveValue(28);
      expect(container.querySelector('#custom-notes-sample-size')).toHaveValue(
        'Synthetic note'
      );

      fireEvent.change(size, { target: { value: '30.5' } });
      fireEvent.blur(size);
      fireEvent.change(journal, { target: { value: 'Updated sample' } });
      fireEvent.change(container.querySelector('#custom-notes-sample-text')!, {
        target: { value: 'Another synthetic note' },
      });
      expect(size).toHaveValue(30.5);
      expect(journal).toHaveValue('Updated sample');
      expect(container.querySelector('#custom-notes-sample-size')).toHaveValue(
        'Synthetic note'
      );
      expect(container.querySelector('#custom-notes-sample-text')).toHaveValue(
        'Another synthetic note'
      );
      expect(
        screen.queryByRole('button', { name: 'Use last' })
      ).not.toBeInTheDocument();
    });
  });

  describe('custom category previous values', () => {
    const numericCategory = {
      id: 'cat-1',
      name: 'Chest',
      display_name: 'Chest',
      measurement_type: 'cm',
      frequency: 'Daily',
      data_type: 'numeric',
    };
    const textCategory = {
      id: 'cat-2',
      name: 'Notes Field',
      display_name: 'Notes Field',
      measurement_type: '',
      frequency: 'Daily',
      data_type: 'text',
    };

    it('shows a previous custom value as a placeholder, not an input value', () => {
      render(
        <CheckInForm
          {...defaultProps}
          customCategories={[numericCategory]}
          customValues={{}}
          customPlaceholders={{ 'cat-1': '97.5' }}
        />
      );

      const field = screen.getByLabelText('Chest (cm)');
      expect(field).toHaveAttribute('placeholder', '97.5');
      expect(field).toHaveValue(null);
    });

    it('adopts a custom previous value through "Use last"', () => {
      const setCustomValues = jest.fn();
      render(
        <CheckInForm
          {...defaultProps}
          customCategories={[numericCategory]}
          customValues={{}}
          customPlaceholders={{ 'cat-1': '97.5' }}
          setCustomValues={setCustomValues}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Use last' }));

      expect(setCustomValues).toHaveBeenCalled();
    });

    it('does not offer a custom previous value when the day already has one', () => {
      render(
        <CheckInForm
          {...defaultProps}
          customCategories={[numericCategory]}
          customValues={{ 'cat-1': '99' }}
          customPlaceholders={{ 'cat-1': '97.5' }}
        />
      );

      expect(screen.getByLabelText('Chest (cm)')).toHaveValue(99);
      expect(
        screen.queryByRole('button', { name: 'Use last' })
      ).not.toBeInTheDocument();
    });

    it('uses a text custom value verbatim as the placeholder', () => {
      const { container } = render(
        <CheckInForm
          {...defaultProps}
          customCategories={[textCategory]}
          customValues={{}}
          customPlaceholders={{ 'cat-2': 'felt strong' }}
        />
      );

      const field = container.querySelector('#custom-cat-2');
      expect(field).toHaveAttribute('placeholder', 'felt strong');
    });

    it('renders no custom placeholder when none was loaded', () => {
      const { container } = render(
        <CheckInForm
          {...defaultProps}
          customCategories={[numericCategory]}
          customValues={{}}
          customPlaceholders={{}}
        />
      );

      // With nothing loaded the field falls back to its generic prompt, so no
      // number appears where a previous value would be.
      expect(container.querySelector('#custom-cat-1')).toHaveAttribute(
        'placeholder',
        'Enter chest'
      );
    });
  });
});

import { renderWithClient } from '../test-utils';
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CsvHeaderMappingDialog from '@/components/CsvImport/CsvHeaderMappingDialog';
import {
  CSV_FIELD_DESCRIPTIONS,
  HEALTH_CSV_FIELD_DESCRIPTIONS,
} from '@/components/CsvImport/csvFieldDescriptions';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

describe('CsvHeaderMappingDialog', () => {
  const props = {
    open: true,
    onOpenChange: jest.fn(),
    requiredHeaders: ['date', 'meal_type', 'quantity'],
    fileHeaders: ['Day', 'Meal', 'Amt'],
    headerMapping: {},
    onHeaderMappingChange: jest.fn(),
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
  };

  it('renders the field labels', () => {
    renderWithClient(<CsvHeaderMappingDialog {...props} />);
    expect(screen.getByText('date:')).toBeInTheDocument();
    expect(screen.getByText('meal type:')).toBeInTheDocument();
    expect(screen.getByText('quantity:')).toBeInTheDocument();
  });

  it('shows the description beside each standard field', () => {
    renderWithClient(<CsvHeaderMappingDialog {...props} />);
    expect(
      screen.getByText(CSV_FIELD_DESCRIPTIONS['date']!.fallback)
    ).toBeInTheDocument();
    expect(
      screen.getByText(CSV_FIELD_DESCRIPTIONS['meal_type']!.fallback)
    ).toBeInTheDocument();
    expect(
      screen.getByText(CSV_FIELD_DESCRIPTIONS['quantity']!.fallback)
    ).toBeInTheDocument();
  });

  it('does not render a description for a field missing from the map', () => {
    renderWithClient(
      <CsvHeaderMappingDialog
        {...props}
        requiredHeaders={['date', 'custom_nutrient_x']}
      />
    );
    // The label renders (underscore -> space), but no description is attached
    // because the field is not in CSV_FIELD_DESCRIPTIONS.
    expect(screen.getByText('custom nutrient x:')).toBeInTheDocument();
    expect(
      screen.getByText(CSV_FIELD_DESCRIPTIONS['date']!.fallback)
    ).toBeInTheDocument();
  });

  it('applies a per-importer override for a colliding field name', () => {
    // Health's `unit` is a metric unit, not the shared food-unit description.
    renderWithClient(
      <CsvHeaderMappingDialog
        {...props}
        requiredHeaders={['date', 'unit']}
        fieldDescriptions={HEALTH_CSV_FIELD_DESCRIPTIONS}
      />
    );
    expect(
      screen.getByText(CSV_FIELD_DESCRIPTIONS['date']!.fallback)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(CSV_FIELD_DESCRIPTIONS['unit']!.fallback)
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(HEALTH_CSV_FIELD_DESCRIPTIONS['unit']!.fallback)
    ).toBeInTheDocument();
  });

  it('associates the select trigger with the description via aria-describedby', () => {
    renderWithClient(
      <CsvHeaderMappingDialog
        {...props}
        requiredHeaders={['date', 'custom_field']}
      />
    );
    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes).toHaveLength(2);

    // 'date' has a description in CSV_FIELD_DESCRIPTIONS
    const dateDescId = comboboxes[0]!.getAttribute('aria-describedby');
    expect(dateDescId).toBe('csv-field-desc-date');
    const descElement = document.getElementById(dateDescId!);
    expect(descElement).toBeInTheDocument();
    expect(descElement).toHaveTextContent(
      CSV_FIELD_DESCRIPTIONS['date']!.fallback
    );

    // 'custom_field' has no description in the map, so aria-describedby is omitted
    expect(comboboxes[1]).not.toHaveAttribute('aria-describedby');
  });
});

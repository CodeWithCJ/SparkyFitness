import { renderWithClient } from '../test-utils';
import { screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import CsvFormatBar from '@/components/CsvImport/CsvFormatBar';
import { DEFAULT_CSV_FORMAT, type CsvFormatOptions } from '@workspace/shared';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

const baseValue: CsvFormatOptions = {
  ...DEFAULT_CSV_FORMAT,
  dateFormat: 'MM/dd/yyyy',
};

// Guards the user's explicit constraint: an axis an importer doesn't need
// (e.g. Food Database has no date column) must not render a control at all
// — not a disabled one — rather than showing every axis unconditionally.
describe('CsvFormatBar', () => {
  it('renders no date control when capabilities.date is false', () => {
    renderWithClient(
      <CsvFormatBar
        capabilities={{
          delimiter: true,
          decimal: true,
          quote: true,
          date: false,
        }}
        value={baseValue}
        onChange={jest.fn()}
      />
    );
    // Expand the bar so any present controls would be visible.
    fireEvent.click(screen.getByText('Change'));
    expect(screen.queryByText('Date format')).not.toBeInTheDocument();
  });

  it('renders a date control when capabilities.date is true', () => {
    renderWithClient(
      <CsvFormatBar
        capabilities={{
          delimiter: true,
          decimal: true,
          quote: true,
          date: true,
        }}
        value={baseValue}
        onChange={jest.fn()}
      />
    );
    fireEvent.click(screen.getByText('Change'));
    expect(screen.getByText('Date format')).toBeInTheDocument();
  });

  it('renders only the enabled axes (Food DB / Exercise DB shape: no date)', () => {
    renderWithClient(
      <CsvFormatBar
        capabilities={{
          delimiter: true,
          decimal: true,
          quote: false,
          date: false,
        }}
        value={baseValue}
        onChange={jest.fn()}
      />
    );
    fireEvent.click(screen.getByText('Change'));
    expect(screen.getByText('Delimiter')).toBeInTheDocument();
    expect(screen.getByText('Number format')).toBeInTheDocument();
    expect(screen.queryByText('Date format')).not.toBeInTheDocument();
    expect(screen.queryByText('Advanced')).not.toBeInTheDocument();
  });

  it('surfaces the delimiter-detection-failed hint and auto-expands', () => {
    renderWithClient(
      <CsvFormatBar
        capabilities={{
          delimiter: true,
          decimal: false,
          quote: false,
          date: false,
        }}
        value={baseValue}
        onChange={jest.fn()}
        detection={{
          delimiter: null,
          delimiterFailed: true,
          decimal: { format: 'us', confident: false },
        }}
      />
    );
    expect(
      screen.getByText("Couldn't detect a delimiter — pick one below.")
    ).toBeInTheDocument();
    // Auto-expanded, so the delimiter control is already visible without a click.
    expect(screen.getByText('Delimiter')).toBeInTheDocument();
  });
});

import { renderWithClient } from '../test-utils';
import { screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import CsvFormatPreview from '@/components/CsvImport/CsvFormatPreview';
import { DEFAULT_CSV_FORMAT, type CsvFormatOptions } from '@workspace/shared';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback,
  }),
}));

// Health and Food Diary never transform the date column at submission —
// they pass the string through as-is. The preview must not show a false
// "raw → —" failure for an already-ISO date just because it doesn't match
// the selected display date format (e.g. MM/dd/yyyy), or it misleadingly
// looks like the import is broken when it isn't.
describe('CsvFormatPreview', () => {
  const baseOptions: CsvFormatOptions = {
    ...DEFAULT_CSV_FORMAT,
    dateFormat: 'MM/dd/yyyy',
  };

  it('renders an already-ISO date as-is, not "raw → —"', () => {
    renderWithClient(
      <CsvFormatPreview
        headers={['date', 'weight']}
        rows={[{ date: '2022-06-13', weight: '80.2' }]}
        options={baseOptions}
        decimalDetection={{ format: 'us', confident: false }}
        dateColumn="date"
        totalRowCount={1}
      />
    );
    expect(screen.getByText('2022-06-13')).toBeInTheDocument();
    expect(screen.queryByText(/→/)).not.toBeInTheDocument();
  });

  it('still evaluates a non-ISO date against the selected format', () => {
    renderWithClient(
      <CsvFormatPreview
        headers={['date', 'weight']}
        rows={[{ date: '06/13/2022', weight: '80.2' }]}
        options={baseOptions}
        decimalDetection={{ format: 'us', confident: false }}
        dateColumn="date"
        totalRowCount={1}
      />
    );
    expect(screen.getByText(/06\/13\/2022/)).toBeInTheDocument();
    expect(screen.getByText(/2022-06-13/)).toBeInTheDocument();
  });

  it('shows a destructive failure for a date matching neither ISO nor the selected format', () => {
    renderWithClient(
      <CsvFormatPreview
        headers={['date', 'weight']}
        rows={[{ date: 'not-a-date', weight: '80.2' }]}
        options={baseOptions}
        decimalDetection={{ format: 'us', confident: false }}
        dateColumn="date"
        totalRowCount={1}
      />
    );
    expect(screen.getByText(/not-a-date/)).toBeInTheDocument();
    expect(screen.getByText('—', { exact: false })).toBeInTheDocument();
  });
});

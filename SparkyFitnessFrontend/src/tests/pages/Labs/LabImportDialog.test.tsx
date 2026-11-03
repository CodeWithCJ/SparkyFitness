import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildLabMarkers } from '@workspace/shared';
import * as labApi from '@/api/Labs/labResultsApi';
import LabImportDialog from '@/pages/Labs/LabImportDialog';
import { first, result, wrapper } from './labsTestKit';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/api/Labs/labResultsApi');
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ timezone: 'UTC' }),
}));
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

const api = jest.mocked(labApi);

const scanResponse = {
  report: {
    lab_name: 'Quest',
    collected_on: '2026-09-12',
    results: [
      {
        name: 'HbA1c',
        marker_key: 'hba1c',
        value: 5.1,
        unit: '%',
        ref_low: 4,
        ref_high: 5.6,
      },
      {
        name: 'Hemoglobin A1c',
        marker_key: 'hba1c',
        value: 5.3,
        unit: '%',
        ref_low: 4,
        ref_high: 5.6,
      },
      {
        name: 'Ferritin x',
        marker_key: null,
        value: 80,
        unit: 'ng/mL',
        ref_low: null,
        ref_high: null,
      },
      {
        name: 'LDL',
        marker_key: 'ldl',
        value: 130,
        unit: 'mmol/L',
        ref_low: null,
        ref_high: null,
      },
    ],
  },
};

const renderDialog = (
  latest = [result({ marker_key: 'ldl', unit: 'mg/dL', value_numeric: 120 })]
) => {
  const { Wrapper } = wrapper();
  const onOpenChange = jest.fn();
  const markers = buildLabMarkers([], latest, {}, null);
  render(
    <LabImportDialog
      open
      onOpenChange={onOpenChange}
      markers={markers}
      labels={{}}
      sex={null}
    />,
    { wrapper: Wrapper }
  );
  return { onOpenChange };
};

const pick = (file: File) =>
  fireEvent.change(screen.getByTestId('lab-report-file'), {
    target: { files: [file] },
  });

beforeEach(() => jest.clearAllMocks());

describe('LabImportDialog', () => {
  it('reads a report, blocks a duplicate marker, warns on a unit change and saves the rest', async () => {
    api.scanLabReport.mockResolvedValue(scanResponse);
    api.importLabReport.mockResolvedValue({
      report: {} as never,
      results: [result()],
    });
    const { onOpenChange } = renderDialog();

    pick(new File(['%PDF-1.4'], 'report.pdf', { type: 'application/pdf' }));

    expect(
      await screen.findByText('Already included from this report.')
    ).toBeInTheDocument();
    expect(api.scanLabReport).toHaveBeenCalledWith(
      expect.any(String),
      'application/pdf'
    );
    expect(
      screen.getByText(
        /Your earlier results use mg\/dL, but this report uses mmol\/L/
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('New marker', { exact: false })
    ).toBeInTheDocument();

    // Correct a value before saving.
    fireEvent.change(first(screen.getAllByLabelText('Result for HbA1c')), {
      target: { value: '5.2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save 3 results' }));

    await waitFor(() => expect(api.importLabReport).toHaveBeenCalledTimes(1));
    const body = first(api.importLabReport.mock.calls)[0];
    expect(body).toMatchObject({ lab_name: 'Quest', entry_date: '2026-09-12' });
    expect(body.results).toHaveLength(3);
    expect(first(body.results)).toMatchObject({
      marker_key: 'hba1c',
      value_numeric: 5.2,
      unit: '%',
    });
    expect(body.results.at(1)).toMatchObject({
      marker_name: 'Ferritin x',
      value_numeric: 80,
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('keeps the review open and saves nothing when the import fails', async () => {
    api.scanLabReport.mockResolvedValue(scanResponse);
    api.importLabReport.mockRejectedValue(new Error('boom'));
    const { onOpenChange } = renderDialog();
    pick(new File(['x'], 'r.png', { type: 'image/png' }));

    fireEvent.click(
      await screen.findByRole('button', { name: /^Save \d results$/ })
    );

    await waitFor(() => expect(api.importLabReport).toHaveBeenCalled());
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(
      first(screen.getAllByLabelText('Result for HbA1c'))
    ).toBeInTheDocument();
  });

  it('refuses a file over the size limit without reading it', async () => {
    renderDialog();
    const big = new File(['x'], 'big.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: 15 * 1024 * 1024 });
    pick(big);

    expect(await screen.findByRole('alert')).toHaveTextContent(/too large/);
    expect(api.scanLabReport).not.toHaveBeenCalled();
  });

  it('disables saving when a value is not a number', async () => {
    api.scanLabReport.mockResolvedValue(scanResponse);
    renderDialog();
    pick(new File(['x'], 'r.pdf', { type: 'application/pdf' }));

    fireEvent.change(
      first(await screen.findAllByLabelText('Result for HbA1c')),
      {
        target: { value: 'abc' },
      }
    );
    expect(
      screen.getByRole('button', { name: /^Save \d results$/ })
    ).toBeDisabled();
  });
});

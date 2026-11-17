import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { buildLabMarkers, importLabReportBodySchema } from '@workspace/shared';
import { HttpApiError } from '@/api/api';
import * as labApi from '@/api/Labs/labResultsApi';
import { toast } from '@/hooks/use-toast';
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

  it('saves a large value as typed, without a grouping separator', async () => {
    api.scanLabReport.mockResolvedValue({
      report: {
        lab_name: null,
        collected_on: '2026-09-12',
        results: [
          {
            name: 'Platelets',
            marker_key: null,
            value: 250000,
            unit: '/uL',
            ref_low: null,
            ref_high: null,
          },
        ],
      },
    });
    api.importLabReport.mockResolvedValue({
      report: {} as never,
      results: [result()],
    });
    renderDialog();
    pick(new File(['x'], 'r.pdf', { type: 'application/pdf' }));

    // The field is prefilled with the value as it will be parsed back.
    expect(await screen.findByLabelText('Result for Platelets')).toHaveValue(
      '250000'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save 1 result' }));

    await waitFor(() => expect(api.importLabReport).toHaveBeenCalledTimes(1));
    expect(first(api.importLabReport.mock.calls)[0].results[0]).toMatchObject({
      value_numeric: 250000,
    });
  });

  it('says so when the file cannot be read', async () => {
    renderDialog();
    const file = new File(['x'], 'r.pdf', { type: 'application/pdf' });
    jest
      .spyOn(FileReader.prototype, 'readAsDataURL')
      .mockImplementation(function (this: FileReader) {
        this.dispatchEvent(new Event('error'));
      });
    pick(file);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not open that file.'
    );
    expect(api.scanLabReport).not.toHaveBeenCalled();
    jest.restoreAllMocks();
  });

  it('ignores the result of a report replaced by a newer pick', async () => {
    let finishFirst: (value: typeof scanResponse) => void = () => undefined;
    api.scanLabReport
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = resolve;
          })
      )
      .mockResolvedValueOnce({
        report: {
          lab_name: 'Second lab',
          collected_on: '2026-10-01',
          results: [
            {
              name: 'LDL',
              marker_key: 'ldl',
              value: 99,
              unit: 'mg/dL',
              ref_low: null,
              ref_high: null,
            },
          ],
        },
      });
    renderDialog();

    pick(new File(['a'], 'first.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(api.scanLabReport).toHaveBeenCalledTimes(1));
    pick(new File(['b'], 'second.pdf', { type: 'application/pdf' }));
    expect(
      await screen.findByLabelText('Result for LDL Cholesterol')
    ).toHaveValue('99');

    // Let the earlier scan finish and every update it causes settle.
    await act(async () => {
      finishFirst(scanResponse);
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(screen.getByLabelText('Lab')).toHaveValue('Second lab');
    expect(screen.queryByLabelText('Result for HbA1c')).not.toBeInTheDocument();
  });

  it('does not scan a file whose read finishes after a newer pick', async () => {
    const realRead = FileReader.prototype.readAsDataURL;
    let finishFirstRead: () => void = () => undefined;
    let reads = 0;
    jest
      .spyOn(FileReader.prototype, 'readAsDataURL')
      .mockImplementation(function (this: FileReader, blob: Blob) {
        reads += 1;
        if (reads === 1) {
          // Hold the first read open until the second file has been picked.
          finishFirstRead = () => realRead.call(this, blob);
          return;
        }
        realRead.call(this, blob);
      });
    api.scanLabReport.mockResolvedValue(scanResponse);
    renderDialog();

    pick(new File(['first'], 'first.pdf', { type: 'application/pdf' }));
    pick(new File(['second'], 'second.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(api.scanLabReport).toHaveBeenCalledTimes(1));
    await act(async () => {
      finishFirstRead();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(api.scanLabReport).toHaveBeenCalledTimes(1);
    // base64 of "second"
    expect(api.scanLabReport).toHaveBeenCalledWith(
      'c2Vjb25k',
      'application/pdf'
    );
    jest.restoreAllMocks();
  });

  it('shows a scan failure inline, with the reason the server gave', async () => {
    api.scanLabReport.mockRejectedValue(new Error('No AI service is set up.'));
    renderDialog();
    pick(new File(['x'], 'r.pdf', { type: 'application/pdf' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not read that report. No AI service is set up.'
    );
  });

  it('says nothing about a failed scan of a report replaced by a newer pick', async () => {
    let failFirst: (error: Error) => void = () => undefined;
    api.scanLabReport
      .mockImplementationOnce(
        () =>
          new Promise((_resolve, reject) => {
            failFirst = reject;
          })
      )
      .mockResolvedValueOnce(scanResponse);
    renderDialog();

    pick(new File(['a'], 'first.pdf', { type: 'application/pdf' }));
    await waitFor(() => expect(api.scanLabReport).toHaveBeenCalledTimes(1));
    pick(new File(['b'], 'second.pdf', { type: 'application/pdf' }));
    await screen.findAllByLabelText('Result for HbA1c');

    await act(async () => {
      failFirst(new Error('boom'));
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(
      screen.queryByText(/Could not read that report/)
    ).not.toBeInTheDocument();
    // Nor does a toast: the scan reports failures only in the dialog.
    expect(toast).not.toHaveBeenCalled();
  });

  it('saves an untouched scanned value exactly, and an edited one as typed', async () => {
    const precise = 1.2345678901234567;
    api.scanLabReport.mockResolvedValue({
      report: {
        lab_name: null,
        collected_on: '2026-09-12',
        results: [
          {
            name: 'Alpha marker',
            marker_key: null,
            value: precise,
            unit: 'x',
            ref_low: null,
            ref_high: null,
          },
          {
            name: 'Beta marker',
            marker_key: null,
            value: precise,
            unit: 'x',
            ref_low: null,
            ref_high: null,
          },
        ],
      },
    });
    api.importLabReport.mockResolvedValue({
      report: {} as never,
      results: [result()],
    });
    renderDialog();
    pick(new File(['x'], 'r.pdf', { type: 'application/pdf' }));

    fireEvent.change(await screen.findByLabelText('Result for Beta marker'), {
      target: { value: '1,5' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save 2 results' }));

    await waitFor(() => expect(api.importLabReport).toHaveBeenCalledTimes(1));
    const saved = first(api.importLabReport.mock.calls)[0].results;
    expect(first(saved).value_numeric).toBe(precise);
    expect(saved.at(1)?.value_numeric).toBe(1.5);
  });

  it('refuses a photo over the 6 MB the server reads, before sending it', async () => {
    renderDialog();
    const photo = new File(['x'], 'r.jpg', { type: 'image/jpeg' });
    Object.defineProperty(photo, 'size', { value: 7 * 1024 * 1024 });
    pick(photo);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /photo is too large/
    );
    expect(api.scanLabReport).not.toHaveBeenCalled();
  });

  it('does not save a report without a test date', async () => {
    api.scanLabReport.mockResolvedValue(scanResponse);
    renderDialog();
    pick(new File(['x'], 'r.pdf', { type: 'application/pdf' }));

    fireEvent.change(await screen.findByLabelText('Date of test'), {
      target: { value: '' },
    });

    expect(screen.getByText('Enter the date of the test.')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^Save \d results$/ })
    ).toBeDisabled();
  });

  it('keeps a newer report on screen when an earlier save finishes', async () => {
    let finishSave: () => void = () => undefined;
    api.scanLabReport
      .mockResolvedValueOnce(scanResponse)
      .mockResolvedValueOnce({
        report: {
          lab_name: 'Second lab',
          collected_on: '2026-10-01',
          results: [
            {
              name: 'LDL',
              marker_key: 'ldl',
              value: 99,
              unit: 'mg/dL',
              ref_low: null,
              ref_high: null,
            },
          ],
        },
      });
    api.importLabReport.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishSave = () =>
            resolve({ report: {} as never, results: [result()] });
        })
    );
    const { onOpenChange } = renderDialog();
    pick(new File(['a'], 'first.pdf', { type: 'application/pdf' }));
    fireEvent.click(
      await screen.findByRole('button', { name: /^Save \d results$/ })
    );
    await waitFor(() => expect(api.importLabReport).toHaveBeenCalledTimes(1));

    fireEvent.click(
      screen.getByRole('button', { name: 'Choose a different report' })
    );
    pick(new File(['b'], 'second.pdf', { type: 'application/pdf' }));
    await screen.findByLabelText('Result for LDL Cholesterol');

    await act(async () => {
      finishSave();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // The second report is still the one on screen.
    expect(screen.getByLabelText('Lab')).toHaveValue('Second lab');
    expect(screen.getByLabelText('Result for LDL Cholesterol')).toHaveValue(
      '99'
    );
    expect(screen.queryByLabelText('Result for HbA1c')).not.toBeInTheDocument();
  });

  it('applies the photo limit and sends a type when the browser gives none', async () => {
    api.scanLabReport.mockResolvedValue(scanResponse);
    renderDialog();
    const big = new File(['x'], 'report.JPG', { type: '' });
    Object.defineProperty(big, 'size', { value: 7 * 1024 * 1024 });
    pick(big);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /photo is too large/
    );
    expect(api.scanLabReport).not.toHaveBeenCalled();

    pick(new File(['x'], 'report.png', { type: '' }));
    await waitFor(() =>
      expect(api.scanLabReport).toHaveBeenCalledWith(
        expect.any(String),
        'image/png'
      )
    );
  });

  it('sends one key per reviewed report, the same on a retry', async () => {
    api.scanLabReport.mockResolvedValue(scanResponse);
    api.importLabReport
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ report: {} as never, results: [result()] });
    renderDialog();
    pick(new File(['x'], 'r.pdf', { type: 'application/pdf' }));

    const save = await screen.findByRole('button', {
      name: /^Save \d results$/,
    });
    fireEvent.click(save);
    await waitFor(() => expect(api.importLabReport).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /^Save \d results$/ }));
    await waitFor(() => expect(api.importLabReport).toHaveBeenCalledTimes(2));

    const [firstTry, retry] = api.importLabReport.mock.calls.map(([b]) => b);
    // The key passes the server's own request schema (a valid UUID).
    expect(importLabReportBodySchema.safeParse(firstTry).success).toBe(true);
    expect(firstTry?.client_request_id).toEqual(expect.any(String));
    expect(retry?.client_request_id).toBe(firstTry?.client_request_id);
  });

  it('uses a new key for a different report', async () => {
    api.scanLabReport.mockResolvedValue(scanResponse);
    api.importLabReport.mockRejectedValue(new Error('network'));
    renderDialog();

    pick(new File(['a'], 'a.pdf', { type: 'application/pdf' }));
    fireEvent.click(
      await screen.findByRole('button', { name: /^Save \d results$/ })
    );
    await waitFor(() => expect(api.importLabReport).toHaveBeenCalledTimes(1));
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose a different report' })
    );
    pick(new File(['b'], 'b.pdf', { type: 'application/pdf' }));
    fireEvent.click(
      await screen.findByRole('button', { name: /^Save \d results$/ })
    );
    await waitFor(() => expect(api.importLabReport).toHaveBeenCalledTimes(2));

    const [a, b] = api.importLabReport.mock.calls.map(([body]) => body);
    expect(b?.client_request_id).not.toBe(a?.client_request_id);
  });

  it('locks the review after a save that may have been stored', async () => {
    api.scanLabReport.mockResolvedValue(scanResponse);
    api.importLabReport.mockRejectedValueOnce(new Error('network'));
    renderDialog();
    pick(new File(['x'], 'r.pdf', { type: 'application/pdf' }));

    fireEvent.click(
      await screen.findByRole('button', { name: /^Save \d results$/ })
    );

    expect(
      await screen.findByText(/this review is locked/)
    ).toBeInTheDocument();
    expect(first(screen.getAllByLabelText('Result for HbA1c'))).toBeDisabled();
    expect(screen.getByLabelText('Lab')).toBeDisabled();
    expect(screen.getByLabelText('Date of test')).toBeDisabled();
    // Save stays available, to retry with exactly the same report.
    expect(
      screen.getByRole('button', { name: /^Save \d results$/ })
    ).toBeEnabled();

    // Choosing the report again starts an editable review.
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose a different report' })
    );
    pick(new File(['y'], 'r.pdf', { type: 'application/pdf' }));
    expect(
      first(await screen.findAllByLabelText('Result for HbA1c'))
    ).toBeEnabled();
  });

  it('keeps the review editable when the server refused the save', async () => {
    api.scanLabReport.mockResolvedValue(scanResponse);
    api.importLabReport.mockRejectedValueOnce(
      new HttpApiError('Invalid request body', 400)
    );
    renderDialog();
    pick(new File(['x'], 'r.pdf', { type: 'application/pdf' }));

    fireEvent.click(
      await screen.findByRole('button', { name: /^Save \d results$/ })
    );
    await waitFor(() => expect(api.importLabReport).toHaveBeenCalledTimes(1));

    expect(screen.queryByText(/this review is locked/)).not.toBeInTheDocument();
    expect(first(screen.getAllByLabelText('Result for HbA1c'))).toBeEnabled();
  });

  it('blocks a retry when no key could be made for the report', async () => {
    const realCrypto = globalThis.crypto;
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
    });
    try {
      api.scanLabReport.mockResolvedValue(scanResponse);
      api.importLabReport.mockRejectedValueOnce(new Error('network'));
      renderDialog();
      pick(new File(['x'], 'r.pdf', { type: 'application/pdf' }));

      fireEvent.click(
        await screen.findByRole('button', { name: /^Save \d results$/ })
      );

      expect(await screen.findByRole('alert')).toHaveTextContent(
        /check your lab results/
      );
      expect(first(api.importLabReport.mock.calls)[0]).not.toHaveProperty(
        'client_request_id'
      );
      expect(
        screen.getByRole('button', { name: /^Save \d results$/ })
      ).toBeDisabled();
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        value: realCrypto,
        configurable: true,
      });
    }
  });
});

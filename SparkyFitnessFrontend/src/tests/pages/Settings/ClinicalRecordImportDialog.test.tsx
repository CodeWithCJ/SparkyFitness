import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ClinicalRecordImportDialog from '@/pages/Settings/ClinicalRecordImportDialog';
import * as clinicalRecordsApi from '@/api/ClinicalRecords/clinicalRecordsApi';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/api/ClinicalRecords/clinicalRecordsApi');
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));

const api = jest.mocked(clinicalRecordsApi);

describe('ClinicalRecordImportDialog', () => {
  const previewData = {
    vitalsCount: 1,
    labsCount: 1,
    sourceDocuments: ['DOC0001.XML'],
    vitals: [
      {
        kind: 'systolic',
        sparkyType: 'blood_pressure_systolic',
        value: 122,
        unit: 'mmHg',
        rawDate: '20261127',
        isoDate: '2026-11-27',
        recordedAt: '2026-11-27T10:00:00Z',
      },
    ],
    labs: [
      {
        markerName: 'Glucose',
        loinc: '2345-7',
        entryDate: '2026-11-27',
        recordedAt: '2026-11-27T10:00:00Z',
        valueNumeric: 92,
        unit: 'mg/dL',
        refRangeLow: 70,
        refRangeHigh: 99,
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders file upload prompt when open', () => {
    render(<ClinicalRecordImportDialog open={true} onOpenChange={jest.fn()} />);
    expect(screen.getByText(/Choose File/i)).toBeInTheDocument();
  });

  it('previews vitals and labs upon file selection', async () => {
    api.previewClinicalRecords.mockResolvedValueOnce(previewData);

    render(<ClinicalRecordImportDialog open={true} onOpenChange={jest.fn()} />);

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(['<xml></xml>'], 'DOC0001.XML', { type: 'text/xml' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/document\(s\) detected/i)).toBeInTheDocument();
      expect(screen.getByText('122')).toBeInTheDocument();
    });
  });

  it('imports selected vitals and labs', async () => {
    api.previewClinicalRecords.mockResolvedValueOnce(previewData);
    api.executeClinicalImport.mockResolvedValueOnce({
      vitalsImported: 1,
      vitalsSkipped: 0,
      labsImported: 1,
      errors: [],
    });

    const onImportComplete = jest.fn();
    const onOpenChange = jest.fn();

    render(
      <ClinicalRecordImportDialog
        open={true}
        onOpenChange={onOpenChange}
        onImportComplete={onImportComplete}
      />
    );

    const input = document.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const file = new File(['<xml></xml>'], 'DOC0001.XML', { type: 'text/xml' });

    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Import 2 Records/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Import 2 Records/i));

    await waitFor(() => {
      expect(api.executeClinicalImport).toHaveBeenCalledWith({
        vitals: previewData.vitals,
        labs: previewData.labs,
        sourceLabel: 'mychart_clinical_import',
      });
      expect(onImportComplete).toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});

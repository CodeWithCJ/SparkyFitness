import * as DocumentPicker from 'expo-document-picker';
import {
  LAB_REPORT_MAX_PDF_BYTES,
  pickLabReportPdf,
} from '../../src/services/labReportPicker';

const mockDelete = jest.fn();
const mockBase64 = jest.fn();
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    delete: mockDelete,
    base64: mockBase64,
  })),
}));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('../../src/utils/labelPhoto', () => ({
  prepareLabelPhoto: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

const picked = (asset: Record<string, unknown>) =>
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///cache/report.pdf', ...asset }],
  } as never);

describe('pickLabReportPdf', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBase64.mockResolvedValue('JVBERi0=');
  });

  it('reads the PDF and removes the cached copy', async () => {
    picked({ size: 1000 });

    await expect(pickLabReportPdf()).resolves.toEqual({
      status: 'ok',
      document: 'JVBERi0=',
      mimeType: 'application/pdf',
    });
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('removes the cached copy when it rejects an oversized selection', async () => {
    picked({ size: LAB_REPORT_MAX_PDF_BYTES + 1 });

    await expect(pickLabReportPdf()).resolves.toEqual({ status: 'too_large' });
    expect(mockBase64).not.toHaveBeenCalled();
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('removes the cached copy when reading it fails', async () => {
    picked({ size: 1000 });
    mockBase64.mockRejectedValue(new Error('read failed'));

    await expect(pickLabReportPdf()).resolves.toEqual({ status: 'failed' });
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('checks the size of what was read when the picker reports none', async () => {
    picked({});
    mockBase64.mockResolvedValue(
      'a'.repeat(Math.ceil((LAB_REPORT_MAX_PDF_BYTES * 4) / 3) + 1)
    );

    await expect(pickLabReportPdf()).resolves.toEqual({ status: 'too_large' });
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  it('does not fail the pick when the cached copy cannot be deleted', async () => {
    picked({ size: 1000 });
    mockDelete.mockImplementation(() => {
      throw new Error('gone');
    });

    await expect(pickLabReportPdf()).resolves.toMatchObject({ status: 'ok' });
  });

  it('answers cancelled when the picker is dismissed', async () => {
    jest
      .mocked(DocumentPicker.getDocumentAsync)
      .mockResolvedValue({ canceled: true, assets: null } as never);

    await expect(pickLabReportPdf()).resolves.toEqual({ status: 'cancelled' });
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

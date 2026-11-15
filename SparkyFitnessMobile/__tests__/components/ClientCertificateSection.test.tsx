import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { Platform } from 'react-native';
import ClientCertificateSection from '../../src/components/ClientCertificateSection';
import * as service from '../../src/services/clientCertificate';

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/clientCertificate', () => ({
  clientCertificateExpiry: jest.fn(),
  discardClientCertificateFile: jest.fn(),
  getClientCertificateInfo: jest.fn(),
  hasClientCertificateGap: jest.fn(),
  importClientCertificate: jest.fn(),
  isClientCertificateSupported: jest.fn(),
  pickClientCertificateFile: jest.fn(),
  refreshClientCertificateHosts: jest.fn(),
  removeClientCertificate: jest.fn(),
}));

const mocked = jest.mocked(service);
const file = { uri: 'file:///cache/phone.p12', name: 'phone.p12' };
const info = { subject: 'test-phone', expiresAt: Date.UTC(2027, 0, 15) };

const pickFile = async () => {
  mocked.pickClientCertificateFile.mockResolvedValue(file);
  await act(async () => {
    fireEvent.press(screen.getByText('Import certificate'));
  });
};

describe('ClientCertificateSection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.isClientCertificateSupported.mockReturnValue(true);
    mocked.getClientCertificateInfo.mockReturnValue(null);
    mocked.hasClientCertificateGap.mockReturnValue(false);
    mocked.clientCertificateExpiry.mockReturnValue('valid');
    mocked.refreshClientCertificateHosts.mockResolvedValue();
  });

  it('renders nothing in a build without the native module', () => {
    mocked.isClientCertificateSupported.mockReturnValue(false);

    render(<ClientCertificateSection />);

    expect(screen.queryByText('Client certificate')).toBeNull();
  });

  it('marks the feature as experimental whether or not a certificate is stored', () => {
    const view = render(<ClientCertificateSection />);
    expect(screen.getByText('Experimental')).toBeTruthy();
    expect(screen.getByText(/new and may not work/)).toBeTruthy();
    view.unmount();

    mocked.getClientCertificateInfo.mockReturnValue(info);
    render(<ClientCertificateSection />);
    expect(screen.getByText('Experimental')).toBeTruthy();
  });

  it('offers an import and explains the setting when none is stored', () => {
    render(<ClientCertificateSection />);

    expect(screen.getByText('Import certificate')).toBeTruthy();
    expect(screen.getByText(/requires a client certificate/)).toBeTruthy();
    expect(screen.queryByText('Remove')).toBeNull();
    expect(mocked.refreshClientCertificateHosts).toHaveBeenCalled();
  });

  it('imports a picked file with its password', async () => {
    mocked.importClientCertificate.mockResolvedValue({ ok: true, info });
    render(<ClientCertificateSection />);

    await pickFile();
    expect(screen.getByText('phone.p12')).toBeTruthy();
    fireEvent.changeText(
      screen.getByLabelText('Certificate password'),
      'secret'
    );
    await act(async () => {
      fireEvent.press(screen.getByText('Import'));
    });

    expect(mocked.importClientCertificate).toHaveBeenCalledWith(file, 'secret');
    await waitFor(() => expect(screen.getByText('test-phone')).toBeTruthy());
    expect(screen.getByText('Replace certificate')).toBeTruthy();
    expect(screen.getByText(/Expires on/)).toBeTruthy();
  });

  it('keeps the file and shows why after a wrong password', async () => {
    mocked.importClientCertificate.mockResolvedValue({
      ok: false,
      error: 'wrongPassword',
    });
    render(<ClientCertificateSection />);

    await pickFile();
    await act(async () => {
      fireEvent.press(screen.getByText('Import'));
    });

    expect(
      screen.getByText('That password does not open this file.')
    ).toBeTruthy();
    expect(screen.getByText('phone.p12')).toBeTruthy();
    expect(mocked.discardClientCertificateFile).not.toHaveBeenCalled();
  });

  it('discards the picked file on cancel', async () => {
    render(<ClientCertificateSection />);

    await pickFile();
    fireEvent.press(screen.getByText('Cancel'));

    expect(mocked.discardClientCertificateFile).toHaveBeenCalledWith(file);
    expect(screen.getByText('Import certificate')).toBeTruthy();
  });

  it('removes the picked file when the screen closes mid-import', async () => {
    const view = render(<ClientCertificateSection />);

    await pickFile();
    view.unmount();

    expect(mocked.discardClientCertificateFile).toHaveBeenCalledWith(file);
  });

  it('removes the first file when another is picked', async () => {
    const other = { uri: 'file:///cache/other.p12', name: 'other.p12' };
    mocked.importClientCertificate.mockResolvedValue({
      ok: false,
      error: 'wrongPassword',
    });
    render(<ClientCertificateSection />);
    await pickFile();

    // The form stays open after a failed import; cancel, then pick again.
    fireEvent.press(screen.getByText('Cancel'));
    mocked.pickClientCertificateFile.mockResolvedValue(other);
    await act(async () => {
      fireEvent.press(screen.getByText('Import certificate'));
    });

    expect(mocked.discardClientCertificateFile).toHaveBeenCalledTimes(1);
    expect(mocked.discardClientCertificateFile).toHaveBeenCalledWith(file);
    expect(screen.getByText('other.p12')).toBeTruthy();
  });

  it('does not delete the file twice after a successful import', async () => {
    mocked.importClientCertificate.mockResolvedValue({ ok: true, info });
    const view = render(<ClientCertificateSection />);

    await pickFile();
    await act(async () => {
      fireEvent.press(screen.getByText('Import'));
    });
    view.unmount();

    // The service removes the copy itself once the certificate is stored.
    expect(mocked.discardClientCertificateFile).not.toHaveBeenCalled();
  });

  it('asks iPhone users to restart the app after an import', async () => {
    const original = Platform.OS;
    Platform.OS = 'ios';
    try {
      mocked.importClientCertificate.mockResolvedValue({ ok: true, info });
      render(<ClientCertificateSection />);
      expect(screen.queryByText(/Fully close and reopen/)).toBeNull();

      await pickFile();
      await act(async () => {
        fireEvent.press(screen.getByText('Import'));
      });

      expect(screen.getByText(/Fully close and reopen/)).toBeTruthy();
    } finally {
      Platform.OS = original;
    }
  });

  it('does not ask Android users to restart', async () => {
    const original = Platform.OS;
    Platform.OS = 'android';
    try {
      mocked.importClientCertificate.mockResolvedValue({ ok: true, info });
      render(<ClientCertificateSection />);

      await pickFile();
      await act(async () => {
        fireEvent.press(screen.getByText('Import'));
      });

      expect(screen.queryByText(/Fully close and reopen/)).toBeNull();
    } finally {
      Platform.OS = original;
    }
  });

  it('does nothing when the picker is cancelled', async () => {
    mocked.pickClientCertificateFile.mockResolvedValue(null);
    render(<ClientCertificateSection />);

    await act(async () => {
      fireEvent.press(screen.getByText('Import certificate'));
    });

    expect(screen.queryByLabelText('Certificate password')).toBeNull();
  });

  it('removes a stored certificate', () => {
    mocked.getClientCertificateInfo.mockReturnValueOnce(info);
    render(<ClientCertificateSection />);

    fireEvent.press(screen.getByText('Remove'));

    expect(mocked.removeClientCertificate).toHaveBeenCalled();
    expect(screen.getByText('Import certificate')).toBeTruthy();
  });

  it('shows what is really stored when removal fails', () => {
    mocked.getClientCertificateInfo.mockReturnValue(info);
    mocked.removeClientCertificate.mockImplementationOnce(() => {
      throw new Error('native refused');
    });
    render(<ClientCertificateSection />);

    expect(() => fireEvent.press(screen.getByText('Remove'))).not.toThrow();

    // Still stored, so it is still shown and can be removed again.
    expect(screen.getByText('test-phone')).toBeTruthy();
    expect(screen.getByText('Remove')).toBeTruthy();
  });

  it.each([
    ['expired', /Expired on/],
    ['expiring', /Expires soon/],
  ] as const)('warns when the certificate is %s', (state, text) => {
    mocked.getClientCertificateInfo.mockReturnValue(info);
    mocked.clientCertificateExpiry.mockReturnValue(state);

    render(<ClientCertificateSection />);

    expect(screen.getByText(text)).toBeTruthy();
  });

  it('warns when this build cannot present it on every request path', () => {
    mocked.hasClientCertificateGap.mockReturnValue(true);

    render(<ClientCertificateSection />);

    expect(screen.getByText(/cannot use the certificate/)).toBeTruthy();
  });
});

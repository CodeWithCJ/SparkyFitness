import { Platform } from 'react-native';
import NfcManager, { Ndef } from 'react-native-nfc-manager';
import {
  cancelNfcRequest,
  generateTagCode,
  readTag,
  writeTag,
} from '../../src/services/nfc/nfcService';

const CODE = '0123456789abcdef0123456789abcdef';
const LINK = `https://tag.sparkyfitness.com/t/${CODE}`;

const uriRecord = (url: string) => ({
  tnf: 1,
  type: 'U',
  payload: [...Buffer.from(url)],
});

const manager = jest.mocked(NfcManager);

describe('generateTagCode', () => {
  it('makes 32 lowercase hex characters, different each time', () => {
    const first = generateTagCode();
    expect(first).toMatch(/^[a-f0-9]{32}$/);
    expect(generateTagCode()).not.toBe(first);
  });
});

describe('readTag', () => {
  beforeEach(() => jest.clearAllMocks());

  it('recognises one of our tag links', async () => {
    manager.getTag.mockResolvedValueOnce({
      ndefMessage: [uriRecord(LINK)],
    } as never);
    expect(await readTag('hold')).toEqual({
      status: 'read',
      contents: { kind: 'sparky', code: CODE },
    });
    expect(manager.cancelTechnologyRequest).toHaveBeenCalled();
  });

  it('treats another link as something else, and a blank tag as empty', async () => {
    manager.getTag.mockResolvedValueOnce({
      ndefMessage: [uriRecord('https://example.com/x')],
    } as never);
    expect(await readTag('hold')).toEqual({
      status: 'read',
      contents: { kind: 'other' },
    });
    // The mock's default tag has no records.
    expect(await readTag('hold')).toEqual({
      status: 'read',
      contents: { kind: 'empty' },
    });
  });

  it('reports a cancelled scan quietly', async () => {
    manager.requestTechnology.mockRejectedValueOnce(new Error('UserCancel'));
    expect(await readTag('hold')).toEqual({ status: 'cancelled' });
  });
});

describe('cancelNfcRequest', () => {
  beforeEach(() => jest.clearAllMocks());

  it('tries again when the cancel reached the phone before the request did', async () => {
    let rejectRequest: (error: Error) => void = () => {};
    manager.requestTechnology.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectRequest = reject;
        })
    );
    // The first cancel finds nothing; the native request exists by the second.
    manager.cancelTechnologyRequest
      .mockImplementationOnce(() => Promise.resolve())
      .mockImplementationOnce(() => {
        rejectRequest(new Error('cancelled'));
        return Promise.resolve();
      });

    const scan = readTag('hold');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await cancelNfcRequest();

    expect(await scan).toEqual({ status: 'cancelled' });
    expect(manager.cancelTechnologyRequest.mock.calls.length).toBeGreaterThan(
      1
    );
  });

  it('does not retry when nothing is waiting', async () => {
    await cancelNfcRequest();
    expect(manager.cancelTechnologyRequest).toHaveBeenCalledTimes(1);
  });

  it('never starts a request cancelled while NFC is still starting', async () => {
    let finishStart: () => void = () => {};
    let service: typeof import('../../src/services/nfc/nfcService');
    let isolated: typeof manager;
    jest.isolateModules(() => {
      isolated = require('react-native-nfc-manager').default;
      service = require('../../src/services/nfc/nfcService');
    });
    isolated!.start.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishStart = resolve;
        })
    );

    const scan = service!.readTag('hold');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const cancelled = service!.cancelNfcRequest();
    finishStart();

    expect(await scan).toEqual({ status: 'cancelled' });
    await cancelled;
    expect(isolated!.requestTechnology).not.toHaveBeenCalled();
  });
});

describe('session options', () => {
  beforeEach(() => jest.clearAllMocks());

  it('uses reader mode on Android so the system does not open the link', async () => {
    const restore = jest.replaceProperty(Platform, 'OS', 'android');
    try {
      await readTag('hold');
      expect(manager.requestTechnology).toHaveBeenCalledWith(
        'Ndef',
        expect.objectContaining({
          isReaderModeEnabled: true,
          readerModeFlags: 15,
        })
      );
    } finally {
      restore.restore();
    }
  });

  it('keeps the plain session on iPhone', async () => {
    await readTag('hold');
    expect(manager.requestTechnology).toHaveBeenCalledWith('Ndef', {
      alertMessage: 'hold',
    });
  });
});

describe('writeTag', () => {
  beforeEach(() => jest.clearAllMocks());

  it('writes the link to a blank tag', async () => {
    manager.getTag.mockResolvedValueOnce({ ndefMessage: [] } as never);
    expect(await writeTag(CODE, { alertMessage: 'hold' })).toEqual({
      status: 'written',
    });
    expect(Ndef.uriRecord).toHaveBeenCalledWith(LINK);
    expect(manager.ndefHandler.writeNdefMessage).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite a tag that already holds data', async () => {
    manager.getTag.mockResolvedValueOnce({
      ndefMessage: [uriRecord('https://example.com/card')],
    } as never);
    const result = await writeTag(CODE, { alertMessage: 'hold' });
    expect(result).toEqual({
      status: 'has_data',
      contents: { kind: 'other' },
    });
    expect(manager.ndefHandler.writeNdefMessage).not.toHaveBeenCalled();
  });

  it('overwrites when asked to', async () => {
    manager.getTag.mockResolvedValueOnce({
      ndefMessage: [uriRecord('https://example.com/card')],
    } as never);
    expect(
      await writeTag(CODE, { alertMessage: 'hold', overwrite: true })
    ).toEqual({ status: 'written' });
    expect(manager.ndefHandler.writeNdefMessage).toHaveBeenCalledTimes(1);
  });

  it('reports a failed write and always releases the session', async () => {
    manager.getTag.mockResolvedValueOnce({ ndefMessage: [] } as never);
    manager.ndefHandler.writeNdefMessage.mockRejectedValueOnce(
      new Error('tag is locked')
    );
    const result = await writeTag(CODE, { alertMessage: 'hold' });
    expect(result.status).toBe('error');
    expect(manager.cancelTechnologyRequest).toHaveBeenCalled();
  });
});

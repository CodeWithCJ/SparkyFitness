import NfcManager, { Ndef } from 'react-native-nfc-manager';
import {
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

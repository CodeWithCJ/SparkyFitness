import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import {
  ComplicationFileTooLargeError,
  pickComplicationsFile,
  shareComplicationsFile,
} from '../../src/services/watchComplicationFile';
import type { WatchComplicationDefinition } from '../../src/utils/watchComplications';

const mockFile = {
  exists: false,
  uri: 'file:///cache/sparkyfitness-watch-complications.json',
  create: jest.fn(),
  write: jest.fn(),
  delete: jest.fn(),
  text: jest.fn(),
};

jest.mock('expo-file-system', () => ({
  File: jest.fn(() => mockFile),
  Paths: { cache: 'cache' },
}));
jest.mock('expo-sharing', () => ({ shareAsync: jest.fn() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));

const share = Sharing.shareAsync as jest.Mock;
const pick = DocumentPicker.getDocumentAsync as jest.Mock;

const water: WatchComplicationDefinition = {
  id: 'w',
  name: 'Water',
  source: 'water',
  format: 'percent',
  gauge: true,
  color: 'water',
  icon: 'drop.fill',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFile.exists = false;
  share.mockResolvedValue(undefined);
});

describe('shareComplicationsFile', () => {
  it('writes the list as JSON and opens the share sheet', async () => {
    await expect(shareComplicationsFile([water])).resolves.toBe(true);
    expect(mockFile.create).toHaveBeenCalled();
    const written = JSON.parse(mockFile.write.mock.calls[0][0]);
    expect(written.type).toBe('sparkyfitness.watch-complications');
    expect(written.complications).toHaveLength(1);
    expect(share).toHaveBeenCalledWith(
      mockFile.uri,
      expect.objectContaining({ mimeType: 'application/json' })
    );
  });

  it('replaces an earlier export instead of failing on it', async () => {
    mockFile.exists = true;
    await shareComplicationsFile([water]);
    expect(mockFile.delete).toHaveBeenCalled();
  });

  it('resolves to false when the sheet is closed, and throws other failures', async () => {
    share.mockRejectedValueOnce(new Error('User cancelled'));
    await expect(shareComplicationsFile([water])).resolves.toBe(false);
    share.mockRejectedValueOnce(new Error('disk full'));
    await expect(shareComplicationsFile([water])).rejects.toThrow('disk full');
  });
});

describe('pickComplicationsFile', () => {
  it('returns the text of the picked file and removes the cached copy', async () => {
    pick.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picked.json', size: 200 }],
    });
    mockFile.text.mockResolvedValue('{"a":1}');
    await expect(pickComplicationsFile()).resolves.toBe('{"a":1}');
    expect(mockFile.delete).toHaveBeenCalled();
  });

  it('returns null when the picker is closed', async () => {
    pick.mockResolvedValue({ canceled: true, assets: null });
    await expect(pickComplicationsFile()).resolves.toBeNull();
  });

  it('refuses a file that is too large, without reading it', async () => {
    pick.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///big.json', size: 5_000_000 }],
    });
    await expect(pickComplicationsFile()).rejects.toBeInstanceOf(
      ComplicationFileTooLargeError
    );
    expect(mockFile.text).not.toHaveBeenCalled();
    expect(mockFile.delete).toHaveBeenCalled();
  });
});

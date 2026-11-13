import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { shareGpxFile } from '../../src/services/gpxExport';

const mockWrite = jest.fn();
const mockCreate = jest.fn();
const mockRemove = jest.fn();
let mockExists = false;
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((_dir: unknown, name: string) => ({
    uri: `file:///cache/${name}`,
    get exists() {
      return mockExists;
    },
    create: (...args: unknown[]) => mockCreate(...args),
    write: (...args: unknown[]) => mockWrite(...args),
    delete: (...args: unknown[]) => mockRemove(...args),
  })),
  Paths: { cache: { uri: 'file:///cache/' } },
}));

const share = Sharing.shareAsync as jest.Mock;
const options = { xml: '<gpx/>', fileName: 'loop.gpx', title: 'Loop' };

beforeEach(() => {
  jest.clearAllMocks();
  mockExists = false;
  share.mockResolvedValue(undefined);
});

describe('shareGpxFile', () => {
  it('writes the file to the cache and opens the share sheet', async () => {
    await expect(shareGpxFile(options)).resolves.toBe(true);
    expect(File).toHaveBeenCalledWith(expect.anything(), 'loop.gpx');
    expect(mockWrite).toHaveBeenCalledWith('<gpx/>');
    expect(share).toHaveBeenCalledWith(
      'file:///cache/loop.gpx',
      expect.objectContaining({
        mimeType: 'application/gpx+xml',
        dialogTitle: 'Loop',
      })
    );
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('replaces a file left from an earlier share', async () => {
    mockExists = true;
    await shareGpxFile(options);
    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('resolves to false when the sheet is dismissed', async () => {
    share.mockRejectedValueOnce(new Error('User cancelled'));
    await expect(shareGpxFile(options)).resolves.toBe(false);
  });

  it('lets other failures through', async () => {
    share.mockRejectedValueOnce(new Error('Sharing is not available'));
    await expect(shareGpxFile(options)).rejects.toThrow('not available');
  });
});

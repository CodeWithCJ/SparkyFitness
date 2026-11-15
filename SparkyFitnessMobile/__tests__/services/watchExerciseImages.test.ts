import { File } from 'expo-file-system';
import { ImageManipulator } from 'expo-image-manipulator';
import WatchConnectivity from '../../modules/watch-connectivity';
import { sendWatchExerciseImages } from '../../src/services/watchExerciseImages';

jest.mock('expo-file-system', () => {
  const files: { uri: string; delete: jest.Mock }[] = [];
  const MockFile = jest.fn().mockImplementation((...parts: unknown[]) => {
    const last = parts[parts.length - 1];
    const file = {
      uri: typeof last === 'string' ? last : `file:///cache/${String(last)}`,
      delete: jest.fn(),
    };
    files.push(file);
    return file;
  });
  (MockFile as unknown as { downloadFileAsync: jest.Mock }).downloadFileAsync =
    jest.fn();
  return {
    File: MockFile,
    Paths: { cache: 'cache' },
    __files: files,
  };
});

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg' },
}));

jest.mock('../../modules/watch-connectivity', () => ({
  __esModule: true,
  default: {
    isSupported: jest.fn(() => true),
    sendExerciseImage: jest.fn(),
  },
}));

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(async () => ({ url: 'https://srv' })),
}));

const mockDownload = (File as unknown as { downloadFileAsync: jest.Mock })
  .downloadFileAsync;
const mockManipulate = ImageManipulator.manipulate as jest.Mock;
const mockSend = WatchConnectivity.sendExerciseImage as unknown as jest.Mock;
const created = (
  jest.requireMock('expo-file-system') as {
    __files: { uri: string; delete: jest.Mock }[];
  }
).__files;

const exercise = {
  exercise_snapshot: { id: 'ex-1', images: ['https://img/a.jpg'] },
};

let armed = 1000;
let downloaded: { uri: string; delete: jest.Mock };
let resized: { uri: string };

beforeEach(() => {
  jest.clearAllMocks();
  created.length = 0;
  armed += 1;
  downloaded = { uri: 'file:///cache/original.jpg', delete: jest.fn() };
  resized = { uri: 'file:///cache/resized.jpg' };
  mockDownload.mockResolvedValue(downloaded);
  mockManipulate.mockReturnValue({
    resize: () => ({
      renderAsync: async () => ({ saveAsync: async () => resized }),
    }),
  });
  mockSend.mockResolvedValue(undefined);
});

function resizedFile() {
  return created.find((f) => f.uri === resized.uri);
}

describe('sendWatchExerciseImages', () => {
  it('deletes the resized JPEG and the original after a send', async () => {
    await sendWatchExerciseImages([exercise], armed);
    expect(mockSend).toHaveBeenCalledWith({
      key: 'ex-1',
      index: 0,
      uri: resized.uri,
    });
    expect(resizedFile()?.delete).toHaveBeenCalledTimes(1);
    expect(downloaded.delete).toHaveBeenCalledTimes(1);
  });

  it('deletes the resized JPEG when the send fails', async () => {
    mockSend.mockRejectedValueOnce(new Error('unreachable'));
    await sendWatchExerciseImages([exercise], armed);
    expect(resizedFile()?.delete).toHaveBeenCalledTimes(1);
  });

  it('does not retry a failed download for the same arm', async () => {
    mockDownload.mockRejectedValue(new Error('404'));
    await sendWatchExerciseImages([exercise], armed);
    await sendWatchExerciseImages([exercise], armed);
    expect(mockDownload).toHaveBeenCalledTimes(1);
    // A new arm tries again.
    await sendWatchExerciseImages([exercise], armed + 1000);
    expect(mockDownload).toHaveBeenCalledTimes(2);
  });

  it('retries when the send was rejected, then stops once it is sent', async () => {
    mockSend.mockRejectedValueOnce(new Error('unreachable'));
    await sendWatchExerciseImages([exercise], armed);
    await sendWatchExerciseImages([exercise], armed);
    expect(mockSend).toHaveBeenCalledTimes(2);
    await sendWatchExerciseImages([exercise], armed);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});

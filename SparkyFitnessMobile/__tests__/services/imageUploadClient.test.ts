import {
  postImageMultipart,
  postPayloadWithImages,
} from '../../src/services/api/imageUploadClient';
import { getActiveServerConfig, proxyHeadersToRecord } from '../../src/services/storage';
import { getAuthHeaders } from '../../src/services/api/authService';
import { fetchWithTimeout } from '../../src/utils/concurrency';

jest.mock('../../src/services/storage', () => ({
  getActiveServerConfig: jest.fn(),
  proxyHeadersToRecord: jest.fn(),
}));

jest.mock('../../src/services/api/authService', () => ({
  getAuthHeaders: jest.fn(),
  notifySessionExpired: jest.fn(),
}));

jest.mock('../../src/services/api/apiClient', () => ({
  normalizeUrl: (url: string) => url.replace(/\/$/, ''),
}));

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

jest.mock('../../src/utils/concurrency', () => ({
  UPLOAD_TIMEOUT_MS: 30000,
  fetchWithTimeout: jest.fn(),
}));

// expo-file-system's File is a Blob; the real one needs a native module, so
// stand in a marker object that records the uri it was constructed with.
jest.mock('expo-file-system', () => ({
  // Must extend Blob: jsdom's FormData stringifies anything that is not a
  // Blob/File, which would silently turn the upload into a text field — the
  // same class of failure expo/fetch raises at runtime for RN file parts.
  File: class extends Blob {
    uri: string;
    constructor(uri: string) {
      super([uri]);
      this.uri = uri;
    }
  },
}));

const mockFetch = fetchWithTimeout as jest.MockedFunction<typeof fetchWithTimeout>;

function okResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

describe('postImageMultipart', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getActiveServerConfig as jest.Mock).mockResolvedValue({
      id: 'srv',
      url: 'https://example.com',
      apiKey: 'k',
    });
    (proxyHeadersToRecord as jest.Mock).mockReturnValue({ 'X-Proxy': 'p' });
    (getAuthHeaders as jest.Mock).mockReturnValue({ Authorization: 'Bearer k' });
    mockFetch.mockResolvedValue(okResponse({ id: 'entry-1' }));
  });

  it('posts the order array and one file part per upload', async () => {
    await postImageMultipart({
      endpoint: '/api/food-entries/e1/image',
      serviceName: 'Test',
      operation: 'set image',
      order: ['/uploads/foods/a/1.jpg', '__new__0'],
      newUris: ['file:///new.jpg'],
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://example.com/api/food-entries/e1/image');

    const form = (init as RequestInit).body as FormData;
    expect(form.getAll('images')).toHaveLength(2);
    expect(form.getAll('images')[0]).toBe(
      JSON.stringify(['/uploads/foods/a/1.jpg', '__new__0']),
    );
    // The file part must serialize as a Blob. An RN {uri, name, type} object
    // would land here as the string "[object Object]" — the same silent
    // corruption expo/fetch rejects outright at runtime.
    expect(form.getAll('images')[1]).toBeInstanceOf(Blob);
    expect(typeof form.getAll('images')[1]).not.toBe('string');
  });

  it('never sets Content-Type, so multer can supply the boundary', async () => {
    await postImageMultipart({
      endpoint: '/api/food-entries/e1/image',
      serviceName: 'Test',
      operation: 'set image',
      order: [],
      newUris: [],
    });

    const headers = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain(
      'content-type',
    );
  });

  it('sends proxy headers alongside auth', async () => {
    await postImageMultipart({
      endpoint: '/api/food-entries/e1/image',
      serviceName: 'Test',
      operation: 'set image',
      order: [],
      newUris: [],
    });

    const headers = (mockFetch.mock.calls[0][1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers['X-Proxy']).toBe('p');
    expect(headers.Authorization).toBe('Bearer k');
  });

  it('puts the order INSIDE the wrapper for wrapped routes', async () => {
    // Regression: the server's parseMultipartBody replaces the body with the
    // parsed wrapper and discards other text fields. A top-level `images`
    // field is therefore dropped, and the server reads the uploads as the
    // complete set — silently unlinking every existing photo on the food.
    await postImageMultipart({
      endpoint: '/api/foods',
      serviceName: 'Test',
      operation: 'save food',
      order: ['/uploads/foods/a/1.jpg', '__new__0'],
      newUris: ['file:///a.jpg'],
      payload: { name: 'Nutella' },
      wrapperField: 'foodData',
    });

    const form = (mockFetch.mock.calls[0][1] as RequestInit).body as FormData;
    expect(form.get('foodData')).toBe(
      JSON.stringify({
        name: 'Nutella',
        images: ['/uploads/foods/a/1.jpg', '__new__0'],
      }),
    );
    // Only the file part remains under `images`; no stray text field.
    const imageParts = form.getAll('images');
    expect(imageParts).toHaveLength(1);
    expect(imageParts[0]).toBeInstanceOf(Blob);
  });

  it('keeps the order top-level for unwrapped entry routes', async () => {
    // The per-entry image endpoints read req.body.images directly — they run
    // no wrapper parsing, so the field must NOT be nested there.
    await postImageMultipart({
      endpoint: '/api/food-entries/e1/image',
      serviceName: 'Test',
      operation: 'set image',
      order: ['__new__0'],
      newUris: ['file:///a.jpg'],
    });

    const form = (mockFetch.mock.calls[0][1] as RequestInit).body as FormData;
    expect(form.getAll('images')[0]).toBe(JSON.stringify(['__new__0']));
  });

  it('throws an ApiError carrying the status code on a failed response', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 413,
      text: async () => 'File too large',
    } as unknown as Response);

    // Inspected via catch rather than `.rejects.toMatchObject`, which compares
    // Errors by message and ignores extra properties like `status`.
    let caught: unknown;
    try {
      await postImageMultipart({
        endpoint: '/api/foods',
        serviceName: 'Test',
        operation: 'save food',
        order: [],
        newUris: [],
      });
    } catch (error) {
      caught = error;
    }

    expect((caught as { statusCode?: number })?.statusCode).toBe(413);
  });
});

describe('postPayloadWithImages', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getActiveServerConfig as jest.Mock).mockResolvedValue({
      id: 'srv',
      url: 'https://example.com',
      apiKey: 'k',
    });
    (proxyHeadersToRecord as jest.Mock).mockReturnValue({});
    (getAuthHeaders as jest.Mock).mockReturnValue({});
    mockFetch.mockResolvedValue(okResponse({ id: 'food-1' }));
  });

  it('stays plain JSON when there are no files to upload', async () => {
    // Matches web: a save that touches no photos must not become multipart.
    const sendJson = jest.fn().mockResolvedValue({ id: 'food-1' });

    await postPayloadWithImages({
      endpoint: '/api/foods',
      serviceName: 'Test',
      operation: 'save food',
      payload: { name: 'Oreo' },
      wrapperField: 'foodData',
      order: ['/uploads/foods/a/1.jpg'],
      newUris: [],
      sendJson,
    });

    expect(mockFetch).not.toHaveBeenCalled();
    expect(sendJson).toHaveBeenCalledWith({
      name: 'Oreo',
      images: ['/uploads/foods/a/1.jpg'],
    });
  });

  it('switches to multipart as soon as a file is present', async () => {
    const sendJson = jest.fn();

    await postPayloadWithImages({
      endpoint: '/api/foods',
      serviceName: 'Test',
      operation: 'save food',
      payload: { name: 'Oreo' },
      wrapperField: 'foodData',
      order: ['__new__0'],
      newUris: ['file:///a.jpg'],
      sendJson,
    });

    expect(sendJson).not.toHaveBeenCalled();
    expect(mockFetch).toHaveBeenCalled();
  });
});

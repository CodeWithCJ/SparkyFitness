import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { promises as fsp } from 'node:fs';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

// Point downloads at a scratch dir before the module reads the env at import,
// then restore it so this value doesn't leak into other test files' fresh
// imageDownloader instances in the same worker.
const TMP_UPLOADS = path.join(os.tmpdir(), `sparky-imgdl-test-${process.pid}`);
const priorUploadsDir = process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY;
process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY = TMP_UPLOADS;

const { downloadImage } = await import('../utils/imageDownloader.js');

if (priorUploadsDir === undefined) {
  delete process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY;
} else {
  process.env.SPARKY_FITNESS_CUSTOM_UPLOADS_DIRECTORY = priorUploadsDir;
}

const MB = 1024 * 1024;
const realFetch = globalThis.fetch;

function imageResponse(
  body: BodyInit,
  headers: Record<string, string>
): Response {
  return new Response(body, { status: 200, headers });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

afterAll(async () => {
  await fsp.rm(TMP_UPLOADS, { recursive: true, force: true });
});

describe('imageDownloader - downloadImage', () => {
  it('downloads a valid image and returns the web path', async () => {
    const bytes = Buffer.from('fake-png-bytes');
    globalThis.fetch = vi.fn().mockResolvedValue(
      imageResponse(bytes, {
        'content-type': 'image/png',
        'content-length': String(bytes.length),
      })
    );

    const result = await downloadImage(
      'https://cdn.example.com/good.png',
      'ex-ok'
    );

    expect(result).toBe('/uploads/exercises/ex-ok/good.png');
    const written = await fsp.readFile(
      path.join(TMP_UPLOADS, 'exercises', 'ex-ok', 'good.png')
    );
    expect(written.toString()).toBe('fake-png-bytes');
  });

  it('rejects a private/link-local host before making a request (SSRF)', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    await expect(
      downloadImage('http://169.254.169.254/latest/meta.png', 'ex-ssrf')
    ).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects a loopback host before making a request (SSRF)', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    await expect(
      downloadImage('http://localhost/internal.png', 'ex-loopback')
    ).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('derives a safe extension for an extensionless image URL', async () => {
    const bytes = Buffer.from('fake-png-bytes');
    globalThis.fetch = vi.fn().mockResolvedValue(
      imageResponse(bytes, {
        'content-type': 'image/png',
        'content-length': String(bytes.length),
      })
    );

    const result = await downloadImage(
      'https://cdn.example.com/image?id=123',
      'ex-no-ext'
    );

    expect(result).toBe('/uploads/exercises/ex-no-ext/image.png');
    expect(
      fs.existsSync(
        path.join(TMP_UPLOADS, 'exercises', 'ex-no-ext', 'image.png')
      )
    ).toBe(true);
  });

  it('replaces a misleading extension with one matching the response type', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        imageResponse('fake-png-bytes', { 'content-type': 'image/png' })
      );

    const result = await downloadImage(
      'https://cdn.example.com/evil.html',
      'ex-safe-ext'
    );

    expect(result).toBe('/uploads/exercises/ex-safe-ext/evil.png');
  });

  it('follows redirects through the guarded fetch path', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: '/images/final.png' },
        })
      )
      .mockResolvedValueOnce(
        imageResponse('redirected-png', { 'content-type': 'image/png' })
      );

    const result = await downloadImage(
      'https://cdn.example.com/start.png',
      'ex-redirect'
    );

    expect(result).toBe('/uploads/exercises/ex-redirect/start.png');
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      'https://cdn.example.com/images/final.png',
      expect.any(Object)
    );
  });

  it('blocks a redirect to a private host', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/internal.png' },
      })
    );

    await expect(
      downloadImage('https://cdn.example.com/start.png', 'ex-redirect-ssrf')
    ).rejects.toThrow();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-image content-type', async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        imageResponse('<html>phishing</html>', { 'content-type': 'text/html' })
      );

    await expect(
      downloadImage('https://cdn.example.com/x.png', 'ex-ct')
    ).rejects.toThrow(/disallowed content-type/);
    expect(
      fs.existsSync(path.join(TMP_UPLOADS, 'exercises', 'ex-ct', 'x.png'))
    ).toBe(false);
  });

  it('rejects an image exceeding the size cap via declared content-length', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      imageResponse('tiny', {
        'content-type': 'image/png',
        'content-length': String(20 * MB),
      })
    );

    await expect(
      downloadImage('https://cdn.example.com/big.png', 'ex-declared')
    ).rejects.toThrow(/exceeds maximum size/);
  });

  it('rejects and cleans up an image that streams past the size cap without a declared length', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(6 * MB));
        controller.enqueue(new Uint8Array(6 * MB));
        controller.close();
      },
    });
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        imageResponse(stream, { 'content-type': 'image/png' })
      );

    await expect(
      downloadImage('https://cdn.example.com/streambig.png', 'ex-streamed')
    ).rejects.toThrow(/exceeds maximum size/);
    expect(
      fs.existsSync(
        path.join(TMP_UPLOADS, 'exercises', 'ex-streamed', 'streambig.png')
      )
    ).toBe(false);
  });
});

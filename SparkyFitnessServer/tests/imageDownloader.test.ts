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

    // The stem keeps the source name; the suffix is derived from the full URL
    // so two same-named images on one entity can't overwrite each other.
    expect(result).toMatch(
      /^\/uploads\/exercises\/ex-ok\/good_[0-9a-f]{8}\.png$/
    );
    const written = await fsp.readFile(
      path.join(TMP_UPLOADS, 'exercises', 'ex-ok', path.basename(result))
    );
    expect(written.toString()).toBe('fake-png-bytes');
  });

  it('writes under the requested domain subdirectory', async () => {
    const bytes = Buffer.from('fake-food-bytes');
    globalThis.fetch = vi.fn().mockResolvedValue(
      imageResponse(bytes, {
        'content-type': 'image/png',
        'content-length': String(bytes.length),
      })
    );

    const result = await downloadImage(
      'https://cdn.example.com/product.png',
      'food-1',
      'foods'
    );

    expect(result).toMatch(
      /^\/uploads\/foods\/food-1\/product_[0-9a-f]{8}\.png$/
    );
    const written = await fsp.readFile(
      path.join(TMP_UPLOADS, 'foods', 'food-1', path.basename(result))
    );
    expect(written.toString()).toBe('fake-food-bytes');
  });

  it('keeps two same-named images on one entity in separate files', async () => {
    const bytes = Buffer.from('first-bytes');
    globalThis.fetch = vi.fn().mockResolvedValue(
      imageResponse(bytes, {
        'content-type': 'image/png',
        'content-length': String(bytes.length),
      })
    );
    const first = await downloadImage(
      'https://cdn-a.example.com/a/image.png',
      'ex-collide'
    );

    const otherBytes = Buffer.from('second-bytes');
    globalThis.fetch = vi.fn().mockResolvedValue(
      imageResponse(otherBytes, {
        'content-type': 'image/png',
        'content-length': String(otherBytes.length),
      })
    );
    const second = await downloadImage(
      'https://cdn-b.example.com/b/image.png',
      'ex-collide'
    );

    // Same basename, same entity, different URLs — previously both wrote to
    // image.png and the first download was lost.
    expect(first).not.toBe(second);
    const firstBody = await fsp.readFile(
      path.join(TMP_UPLOADS, 'exercises', 'ex-collide', path.basename(first))
    );
    expect(firstBody.toString()).toBe('first-bytes');
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

    expect(result).toMatch(
      /^\/uploads\/exercises\/ex-no-ext\/image_[0-9a-f]{8}\.png$/
    );
    expect(
      fs.existsSync(
        path.join(TMP_UPLOADS, 'exercises', 'ex-no-ext', path.basename(result))
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

    expect(result).toMatch(
      /^\/uploads\/exercises\/ex-safe-ext\/evil_[0-9a-f]{8}\.png$/
    );
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

    expect(result).toMatch(
      /^\/uploads\/exercises\/ex-redirect\/start_[0-9a-f]{8}\.png$/
    );
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

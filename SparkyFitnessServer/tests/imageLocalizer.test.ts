import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../utils/imageDownloader.js', () => ({
  downloadImage: vi.fn(),
}));

const { downloadImage } = await import('../utils/imageDownloader.js');
const { localizeImages, toImageArray, isRemoteImage, resolveImageInput } =
  await import('../utils/imageLocalizer.js');

const mockDownloadImage = vi.mocked(downloadImage);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('toImageArray', () => {
  it('keeps only non-empty strings', () => {
    expect(toImageArray(['a', '', 'b', null, 3, undefined])).toEqual([
      'a',
      'b',
    ]);
  });

  it('returns an empty array for non-array input', () => {
    expect(toImageArray(null)).toEqual([]);
    expect(toImageArray('a')).toEqual([]);
  });
});

describe('isRemoteImage', () => {
  it('recognizes http(s) URLs only', () => {
    expect(isRemoteImage('https://cdn.example.com/a.png')).toBe(true);
    expect(isRemoteImage('http://cdn.example.com/a.png')).toBe(true);
    expect(isRemoteImage('/uploads/foods/1/a.png')).toBe(false);
  });
});

describe('resolveImageInput', () => {
  it('prefers an explicit images array', () => {
    expect(
      resolveImageInput({
        images: ['/uploads/foods/1/a.png'],
        image_url: 'https://cdn.example.com/b.png',
      })
    ).toEqual(['/uploads/foods/1/a.png']);
  });

  it('archives the full-size image_source_url over the thumbnail', () => {
    // Mealie hotlinks min-original.webp for search results but only
    // original.webp is guaranteed to exist, so that is what we store.
    expect(
      resolveImageInput({
        image_url:
          'https://mealie.test/api/media/recipes/r1/images/min-original.webp',
        image_source_url:
          'https://mealie.test/api/media/recipes/r1/images/original.webp',
      })
    ).toEqual([
      'https://mealie.test/api/media/recipes/r1/images/original.webp',
    ]);
  });

  it("falls back to a provider's single image_url", () => {
    expect(
      resolveImageInput({ image_url: 'https://cdn.example.com/b.png' })
    ).toEqual(['https://cdn.example.com/b.png']);
  });

  it('returns an empty array when neither is present', () => {
    expect(resolveImageInput({})).toEqual([]);
  });
});

describe('localizeImages', () => {
  it('returns null when nothing is remote, so no write is issued', async () => {
    const result = await localizeImages(
      ['/uploads/foods/1/a.png'],
      'food-1',
      'foods'
    );

    expect(result).toBeNull();
    expect(mockDownloadImage).not.toHaveBeenCalled();
  });

  it('replaces remote URLs with downloaded local paths', async () => {
    mockDownloadImage.mockResolvedValue('/uploads/foods/food-1/b.png');

    const result = await localizeImages(
      ['/uploads/foods/food-1/a.png', 'https://cdn.example.com/b.png'],
      'food-1',
      'foods'
    );

    expect(result).toEqual([
      '/uploads/foods/food-1/a.png',
      '/uploads/foods/food-1/b.png',
    ]);
    expect(mockDownloadImage).toHaveBeenCalledWith(
      'https://cdn.example.com/b.png',
      'food-1',
      'foods'
    );
  });

  it('keeps the remote URL when the download is rejected', async () => {
    // The downloader rejects disallowed content types, oversized files, and
    // private hosts; an import must still succeed in those cases.
    mockDownloadImage.mockRejectedValue(new Error('disallowed content-type'));

    const result = await localizeImages(
      ['https://cdn.example.com/b.png'],
      'food-1',
      'foods'
    );

    expect(result).toBeNull();
  });

  it('localizes only the images that succeeded', async () => {
    mockDownloadImage
      .mockRejectedValueOnce(new Error('too large'))
      .mockResolvedValueOnce('/uploads/foods/food-1/ok.png');

    const result = await localizeImages(
      ['https://cdn.example.com/bad.png', 'https://cdn.example.com/ok.png'],
      'food-1',
      'foods'
    );

    expect(result).toEqual([
      'https://cdn.example.com/bad.png',
      '/uploads/foods/food-1/ok.png',
    ]);
  });
});

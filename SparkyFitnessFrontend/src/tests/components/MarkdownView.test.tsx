import { embeddableImageSrc } from '@/components/ui/MarkdownView';

/**
 * Notes travel with shared food libraries, so an image in one is fetched by
 * everyone the library is shared with. `embeddableImageSrc` is the gate that
 * decides which sources are actually loaded; a regression here turns a note
 * into a tracking pixel that reports each viewer's IP and user-agent.
 */
describe('embeddableImageSrc', () => {
  const candidates = [
    '/uploads/foods/486d60ee/front_en_7_400_e8d12615.jpg',
    '/uploads/foods/486d60ee/e211191f-banana-chips-6.jpg',
  ];

  it('resolves a bare file name against the entity’s own photos', () => {
    // What the editor now writes: the directory is derived, not stored.
    expect(embeddableImageSrc('banana-chips-6.jpg', candidates)).toBeNull();
    expect(embeddableImageSrc('e211191f-banana-chips-6.jpg', candidates)).toBe(
      '/uploads/foods/486d60ee/e211191f-banana-chips-6.jpg'
    );
  });

  it('still renders notes that stored the whole path', () => {
    expect(embeddableImageSrc('/uploads/foods/abc/photo.jpg')).toBe(
      '/uploads/foods/abc/photo.jpg'
    );
  });

  it('refuses a file name that is not one of this entity’s photos', () => {
    // Guessing another entity's file must not resolve to a picture.
    expect(embeddableImageSrc('someone-elses.jpg', candidates)).toBeNull();
  });

  it.each([
    'https://evil.example/pixel.png',
    'http://evil.example/pixel.png',
    '//evil.example/pixel.png',
  ])('refuses the cross-origin source %s', (src) => {
    expect(embeddableImageSrc(src)).toBeNull();
  });

  it('refuses a protocol-smuggling attempt', () => {
    expect(embeddableImageSrc('javascript:alert(1)')).toBeNull();
    expect(embeddableImageSrc('data:image/svg+xml;base64,AAAA')).toBeNull();
  });

  it('refuses a path traversal dressed up as an upload', () => {
    expect(embeddableImageSrc('../../etc/passwd')).toBeNull();
    expect(embeddableImageSrc('../../etc/passwd', candidates)).toBeNull();
  });

  it('handles empty and missing values', () => {
    expect(embeddableImageSrc(undefined)).toBeNull();
    expect(embeddableImageSrc('')).toBeNull();
  });
});

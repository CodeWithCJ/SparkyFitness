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
    // Earlier notes embedded the full path. Those keep working, but now only
    // when the photo is one the item actually owns.
    expect(
      embeddableImageSrc(
        '/uploads/foods/486d60ee/front_en_7_400_e8d12615.jpg',
        candidates
      )
    ).toBe('/uploads/foods/486d60ee/front_en_7_400_e8d12615.jpg');
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

  it('refuses a candidate that is an absolute provider URL', () => {
    // `images` can hold an absolute URL when localizing a provider image
    // failed. Rendering one from a shared note would report every viewer to
    // that host, which is exactly what this allowlist exists to prevent.
    expect(
      embeddableImageSrc('front.jpg', ['https://images.example.com/front.jpg'])
    ).toBeNull();
  });

  it('refuses a traversal that resolves out of the uploads tree', () => {
    expect(
      embeddableImageSrc('/uploads/../../etc/passwd', [
        '/uploads/../../etc/passwd',
      ])
    ).toBeNull();
  });

  it('refuses a path that is not in the candidate list', () => {
    // No unchecked fallback: an upload path the entity does not own must not
    // render just because it starts with /uploads/.
    expect(
      embeddableImageSrc('/uploads/foods/other-user/secret.jpg', candidates)
    ).toBeNull();
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

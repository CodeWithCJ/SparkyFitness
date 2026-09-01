import { splitNoteSegments } from '../../src/utils/markdownImages';

const candidates = [
  '/uploads/foods/486d60ee/front_en_7_400.jpg',
  '/uploads/foods/486d60ee/e211191f-banana-chips-6.jpg',
];

describe('splitNoteSegments', () => {
  it('pulls every photo out, not just the first', () => {
    // The whole point: the native renderer clipped everything after image one.
    const segments = splitNoteSegments(
      'one\n![a](front_en_7_400.jpg)\ntwo\n![b](e211191f-banana-chips-6.jpg)',
      candidates
    );

    expect(segments.map((s) => s.kind)).toEqual([
      'text',
      'image',
      'text',
      'image',
    ]);
  });

  it('keeps the text around each photo in order', () => {
    const segments = splitNoteSegments(
      'before ![a](front_en_7_400.jpg) after',
      candidates
    );

    expect(segments[0]).toEqual({ kind: 'text', value: 'before ' });
    expect(segments[1]).toMatchObject({ kind: 'image', alt: 'a' });
    expect(segments[2]).toEqual({ kind: 'text', value: ' after' });
  });

  it('resolves a bare file name to the stored path', () => {
    const segments = splitNoteSegments('![a](front_en_7_400.jpg)', candidates);

    expect(segments).toEqual([
      {
        kind: 'image',
        path: '/uploads/foods/486d60ee/front_en_7_400.jpg',
        alt: 'a',
      },
    ]);
  });

  it('leaves a reference that is not one of this entity’s photos in the text', () => {
    const md = 'see ![x](https://example.com/p.png) here';
    expect(splitNoteSegments(md, candidates)).toEqual([
      { kind: 'text', value: md },
    ]);
  });

  it('drops whitespace-only text runs', () => {
    const segments = splitNoteSegments(
      '\n\n![a](front_en_7_400.jpg)\n\n',
      candidates
    );

    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe('image');
  });

  it('handles a note with no photos at all', () => {
    expect(splitNoteSegments('just words', candidates)).toEqual([
      { kind: 'text', value: 'just words' },
    ]);
  });

  it('handles empty input', () => {
    expect(splitNoteSegments('', candidates)).toEqual([]);
    expect(splitNoteSegments(null, candidates)).toEqual([]);
  });
});

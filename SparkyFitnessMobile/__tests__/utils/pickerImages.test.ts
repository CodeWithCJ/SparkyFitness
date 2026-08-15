import {
  MAX_IMAGES,
  toNewImage,
  toSavedImages,
  splitPickerImages,
  pickerImagesDiffer,
  setAsMain,
  removeImageAt,
  pickerImageKey,
  type PickerImage,
} from '../../src/utils/pickerImages';

const saved = (path: string): PickerImage => ({ kind: 'saved', path });

describe('toSavedImages', () => {
  it('drops empty and legacy "[]" entries', () => {
    expect(toSavedImages(['/a.jpg', '', '[]', '  ', '/b.jpg'])).toEqual([
      { kind: 'saved', path: '/a.jpg' },
      { kind: 'saved', path: '/b.jpg' },
    ]);
  });

  it('handles null input', () => {
    expect(toSavedImages(null)).toEqual([]);
  });
});

describe('splitPickerImages', () => {
  it('emits stored paths as-is and placeholders for uploads', () => {
    const items = [saved('/a.jpg'), toNewImage('file:///new1'), saved('/b.jpg')];

    expect(splitPickerImages(items)).toEqual({
      order: ['/a.jpg', '__new__0', '/b.jpg'],
      newUris: ['file:///new1'],
    });
  });

  it('numbers placeholders by upload position, not item position', () => {
    // __new__<n> indexes into the appended files, so the second new image is
    // __new__1 even though it is the fourth item.
    const items = [
      saved('/a.jpg'),
      toNewImage('file:///x'),
      saved('/b.jpg'),
      toNewImage('file:///y'),
    ];

    expect(splitPickerImages(items)).toEqual({
      order: ['/a.jpg', '__new__0', '/b.jpg', '__new__1'],
      newUris: ['file:///x', 'file:///y'],
    });
  });

  it('truncates to the server MAX_IMAGE_COUNT', () => {
    const items = Array.from({ length: MAX_IMAGES + 3 }, (_, i) =>
      saved(`/img-${i}.jpg`),
    );

    const { order } = splitPickerImages(items);
    expect(order).toHaveLength(MAX_IMAGES);
  });
});

describe('pickerImagesDiffer', () => {
  it('is true when a new upload is staged', () => {
    expect(pickerImagesDiffer([toNewImage('file:///x')], [])).toBe(true);
  });

  it('is false when nothing changed', () => {
    expect(
      pickerImagesDiffer([saved('/a.jpg'), saved('/b.jpg')], ['/a.jpg', '/b.jpg']),
    ).toBe(false);
  });

  it('is true when an image was removed', () => {
    expect(pickerImagesDiffer([saved('/a.jpg')], ['/a.jpg', '/b.jpg'])).toBe(
      true,
    );
  });

  it('is true when only the order changed', () => {
    // Order is not cosmetic: index 0 is the thumbnail, so a reorder alone is a
    // real change that must be saved.
    expect(
      pickerImagesDiffer([saved('/b.jpg'), saved('/a.jpg')], ['/a.jpg', '/b.jpg']),
    ).toBe(true);
  });
});

describe('setAsMain', () => {
  it('moves the chosen image to index 0 and keeps the rest in order', () => {
    const items = [saved('/a.jpg'), saved('/b.jpg'), saved('/c.jpg')];

    expect(setAsMain(items, 2)).toEqual([
      saved('/c.jpg'),
      saved('/a.jpg'),
      saved('/b.jpg'),
    ]);
  });

  it('is a no-op for index 0 and out-of-range indices', () => {
    const items = [saved('/a.jpg'), saved('/b.jpg')];
    expect(setAsMain(items, 0)).toBe(items);
    expect(setAsMain(items, 5)).toBe(items);
  });
});

describe('removeImageAt', () => {
  it('removes only the given index', () => {
    const items = [saved('/a.jpg'), saved('/b.jpg'), saved('/c.jpg')];
    expect(removeImageAt(items, 1)).toEqual([saved('/a.jpg'), saved('/c.jpg')]);
  });

  it('is a no-op out of range', () => {
    const items = [saved('/a.jpg')];
    expect(removeImageAt(items, 3)).toBe(items);
  });
});

describe('pickerImageKey', () => {
  it('gives new images a stable identity distinct from their uri', () => {
    const a = toNewImage('file:///same');
    const b = toNewImage('file:///same');
    // Two picks of the same file are separate list entries and must not
    // collide as React keys.
    expect(pickerImageKey(a)).not.toBe(pickerImageKey(b));
  });
});

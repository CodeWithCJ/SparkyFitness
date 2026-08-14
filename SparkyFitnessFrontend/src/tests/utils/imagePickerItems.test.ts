import {
  splitPickerImages,
  toSavedImages,
  toNewImage,
  reorderPickerImages,
  pickerImagesDiffer,
} from '@/utils/imagePickerItems';

const file = (name: string) =>
  new File(['x'], name, { type: 'image/png' }) as File;

describe('splitPickerImages', () => {
  it('emits placeholders that mark where each upload belongs', () => {
    const items = [
      ...toSavedImages(['/uploads/foods/f1/a.png']),
      toNewImage(file('b.png')),
      ...toSavedImages(['/uploads/foods/f1/c.png']),
      toNewImage(file('d.png')),
    ];

    const { order, files } = splitPickerImages(items);

    expect(order).toEqual([
      '/uploads/foods/f1/a.png',
      '__new__0',
      '/uploads/foods/f1/c.png',
      '__new__1',
    ]);
    expect(files.map((f) => f.name)).toEqual(['b.png', 'd.png']);
  });

  it('numbers placeholders by file order, not list position', () => {
    // A new file dragged to the front is still upload index 0.
    const items = [
      toNewImage(file('first.png')),
      ...toSavedImages(['/uploads/foods/f1/a.png']),
    ];

    const { order, files } = splitPickerImages(items);

    expect(order).toEqual(['__new__0', '/uploads/foods/f1/a.png']);
    expect(files.map((f) => f.name)).toEqual(['first.png']);
  });

  it('returns empty arrays for an empty list', () => {
    expect(splitPickerImages([])).toEqual({ order: [], files: [] });
  });
});

describe('toSavedImages', () => {
  it('drops blank and non-string entries', () => {
    expect(toSavedImages(['a.png', '', '  '])).toEqual([
      { kind: 'saved', path: 'a.png' },
    ]);
    expect(toSavedImages(null)).toEqual([]);
  });
});

describe('reorderPickerImages', () => {
  const items = toSavedImages(['a', 'b', 'c']);

  it('moves an item forward', () => {
    expect(
      reorderPickerImages(items, 0, 2).map((i) =>
        i.kind === 'saved' ? i.path : ''
      )
    ).toEqual(['b', 'c', 'a']);
  });

  it('moves an item backward', () => {
    expect(
      reorderPickerImages(items, 2, 0).map((i) =>
        i.kind === 'saved' ? i.path : ''
      )
    ).toEqual(['c', 'a', 'b']);
  });

  it('returns the list unchanged for a no-op or out-of-range move', () => {
    expect(reorderPickerImages(items, 1, 1)).toBe(items);
    expect(reorderPickerImages(items, 0, 9)).toBe(items);
    expect(reorderPickerImages(items, -1, 0)).toBe(items);
  });
});

describe('pickerImagesDiffer', () => {
  it('is false when nothing changed', () => {
    expect(pickerImagesDiffer(toSavedImages(['a', 'b']), ['a', 'b'])).toBe(
      false
    );
  });

  it('is true when the order changed', () => {
    expect(pickerImagesDiffer(toSavedImages(['b', 'a']), ['a', 'b'])).toBe(
      true
    );
  });

  it('is true when a file was staged', () => {
    expect(pickerImagesDiffer([toNewImage(file('a.png'))], [])).toBe(true);
  });

  it('is true when an image was removed', () => {
    expect(pickerImagesDiffer(toSavedImages(['a']), ['a', 'b'])).toBe(true);
  });
});

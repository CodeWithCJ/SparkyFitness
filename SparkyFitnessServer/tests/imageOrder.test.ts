import { describe, expect, it, vi } from 'vitest';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));

const { applyImageOrder } = await import('../middleware/imageUpload.js');

describe('applyImageOrder', () => {
  it('substitutes placeholders with the matching upload', () => {
    expect(
      applyImageOrder(
        ['/uploads/foods/f1/a.png', '__new__0'],
        ['/uploads/foods/f1/b.png']
      )
    ).toEqual(['/uploads/foods/f1/a.png', '/uploads/foods/f1/b.png']);
  });

  it('honours an upload placed before an existing image', () => {
    // This is the case that appending would get wrong.
    expect(
      applyImageOrder(
        ['__new__0', '/uploads/foods/f1/a.png'],
        ['/uploads/foods/f1/new.png']
      )
    ).toEqual(['/uploads/foods/f1/new.png', '/uploads/foods/f1/a.png']);
  });

  it('maps each placeholder to its own upload', () => {
    expect(
      applyImageOrder(['__new__1', '__new__0'], ['/first.png', '/second.png'])
    ).toEqual(['/second.png', '/first.png']);
  });

  it('drops placeholders that have no matching upload', () => {
    expect(applyImageOrder(['/kept.png', '__new__3'], [])).toEqual([
      '/kept.png',
    ]);
  });

  it('appends uploads the order never referenced', () => {
    // A client that sends files without an explicit order still gets them.
    expect(applyImageOrder(undefined, ['/a.png', '/b.png'])).toEqual([
      '/a.png',
      '/b.png',
    ]);
    expect(applyImageOrder(['/kept.png'], ['/extra.png'])).toEqual([
      '/kept.png',
      '/extra.png',
    ]);
  });

  it('treats a removal as an order with no placeholders', () => {
    expect(applyImageOrder(['/kept.png'], [])).toEqual(['/kept.png']);
    expect(applyImageOrder([], [])).toEqual([]);
  });

  it('ignores non-string entries in the order', () => {
    expect(applyImageOrder(['/kept.png', 42, null], [])).toEqual(['/kept.png']);
  });
});

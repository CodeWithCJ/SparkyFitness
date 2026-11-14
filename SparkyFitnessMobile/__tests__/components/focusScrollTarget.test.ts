import { focusScrollOffset } from '../../src/components/focusScrollTarget';

const base = {
  cardTop: 600,
  cardHeight: 220,
  headerTop: 400,
  viewportHeight: 800,
  bottomInset: 128,
  margin: 8,
};

describe('focusScrollOffset', () => {
  it('does not scroll when the whole card already clears the footer', () => {
    expect(focusScrollOffset({ ...base, cardTop: 300 })).toBe(0);
  });

  it('scrolls only as far as the card needs, keeping the header in view', () => {
    // Card bottom 828 + margin 8 against 672 visible: 156, header at 392.
    expect(focusScrollOffset(base)).toBe(156);
  });

  it('scrolls to the card top when the header would be pushed off', () => {
    expect(focusScrollOffset({ ...base, headerTop: 100 })).toBe(592);
    expect(focusScrollOffset({ ...base, viewportHeight: 500 })).toBe(592);
  });

  it('never scrolls past the card top without a header', () => {
    expect(
      focusScrollOffset({ ...base, headerTop: null, cardHeight: 800 })
    ).toBe(592);
    expect(focusScrollOffset({ ...base, headerTop: null })).toBe(156);
  });

  it('falls back to the card top before the viewport is measured', () => {
    expect(focusScrollOffset({ ...base, viewportHeight: 0 })).toBe(592);
  });

  it('never stops part-way down the title block', () => {
    // Needs 156 but the title block runs to 200: scroll on to the header.
    expect(focusScrollOffset({ ...base, titleBottom: 200 })).toBe(392);
    // Without a header, to the card top.
    expect(
      focusScrollOffset({ ...base, headerTop: null, titleBottom: 200 })
    ).toBe(592);
    // Already clear of the title block, or no scroll needed: unchanged.
    expect(focusScrollOffset({ ...base, titleBottom: 100 })).toBe(156);
    expect(focusScrollOffset({ ...base, cardTop: 300, titleBottom: 200 })).toBe(
      0
    );
  });
});

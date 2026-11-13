import { getAnchoredMenuPlacement } from '../../src/components/AnchoredMenu';

const noInsets = { left: 0, right: 0 };

describe('getAnchoredMenuPlacement', () => {
  it("hangs from the trigger's left edge in the left half", () => {
    expect(
      getAnchoredMenuPlacement({
        anchor: { x: 40, width: 24 },
        screenWidth: 400,
        insets: noInsets,
        minWidth: 200,
      })
    ).toEqual({ anchorsLeft: true, left: 40 });
  });

  it("hangs from the trigger's right edge in the right half", () => {
    expect(
      getAnchoredMenuPlacement({
        anchor: { x: 340, width: 24 },
        screenWidth: 400,
        insets: noInsets,
        minWidth: 200,
      })
    ).toEqual({ anchorsLeft: false, right: 36 });
  });

  it('keeps the menu clear of a vertical bar on the right', () => {
    const placement = getAnchoredMenuPlacement({
      anchor: { x: 280, width: 24 },
      screenWidth: 400,
      insets: { left: 0, right: 80 },
      minWidth: 200,
    });
    // Right edge at most 400 - 80 - 8 = 312: never into the bar.
    expect(placement.anchorsLeft).toBe(false);
    if (!placement.anchorsLeft) {
      expect(placement.right).toBeGreaterThanOrEqual(88);
    }
  });

  it("does not clip the menu's left edge when the nearer half cannot fit it", () => {
    // 400 wide, 80 bar on the right, trigger at x=150: the old midpoint test
    // picked right anchoring and started the menu at x=-30.
    const placement = getAnchoredMenuPlacement({
      anchor: { x: 150, width: 20 },
      screenWidth: 400,
      insets: { left: 0, right: 80 },
      minWidth: 200,
    });
    const leftEdge = placement.anchorsLeft
      ? placement.left
      : 400 - placement.right - 200;
    expect(leftEdge).toBeGreaterThanOrEqual(8);
    expect(leftEdge + 200).toBeLessThanOrEqual(400 - 80 - 8);
  });

  it('switches to the other edge when the preferred side would run off', () => {
    // Hanging from the left edge would put the menu over the bar, so it hangs
    // from the trigger's right edge instead.
    const placement = getAnchoredMenuPlacement({
      anchor: { x: 190, width: 20 },
      screenWidth: 400,
      insets: { left: 0, right: 80 },
      minWidth: 200,
    });
    const leftEdge = placement.anchorsLeft
      ? placement.left
      : 400 - placement.right - 200;
    expect(leftEdge + 200).toBeLessThanOrEqual(312);
    expect(leftEdge).toBeGreaterThanOrEqual(8);
  });

  it('clamps to the usable width when no placement can fit the menu', () => {
    const placement = getAnchoredMenuPlacement({
      anchor: { x: 20, width: 20 },
      screenWidth: 260,
      insets: { left: 0, right: 80 },
      minWidth: 200,
    });
    expect(placement.anchorsLeft).toBe(true);
    if (placement.anchorsLeft) expect(placement.left).toBe(8);
  });
});

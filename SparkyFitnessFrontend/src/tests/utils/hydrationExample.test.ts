import {
  linkedHydrationExample,
  plainHydrationExample,
} from '@workspace/shared';

describe('hydration factor worked example (#2115)', () => {
  it('scales a linked food by serving size, the way the server credits it', () => {
    // 220 ml of water per 250 ml serving, one 250 ml press, coffee at 0.9.
    expect(
      linkedHydrationExample(0.9, {
        waterMl: 220,
        servingSize: 250,
        quantity: 250,
      })
    ).toEqual({ credited: 198, total: 220, unit: 'ml' });
  });

  it('halves the credit for half a serving', () => {
    expect(
      linkedHydrationExample(1, {
        waterMl: 220,
        servingSize: 250,
        quantity: 125,
      })
    ).toEqual({ credited: 110, total: 110, unit: 'ml' });
  });

  it('does not divide by a zero serving size', () => {
    const result = linkedHydrationExample(1, {
      waterMl: 220,
      servingSize: 0,
      quantity: 1,
    });
    expect(result?.total).toBe(220);
  });

  it('has nothing to show for a food with no water of its own', () => {
    expect(
      linkedHydrationExample(0.9, { waterMl: 0, servingSize: 250, quantity: 1 })
    ).toBeNull();
  });

  it('reports a factor of 0 as crediting nothing, not as unknown', () => {
    expect(
      linkedHydrationExample(0, { waterMl: 30, servingSize: 30, quantity: 30 })
    ).toEqual({ credited: 0, total: 30, unit: 'ml' });
  });

  it('divides a plain container by its servings and keeps the typed unit', () => {
    expect(
      plainHydrationExample(1, { volume: 2, servings: 4, unit: 'liter' })
    ).toEqual({ credited: 0.5, total: 0.5, unit: 'liter' });
  });

  it('has nothing to show before a volume is typed', () => {
    expect(plainHydrationExample(1, { volume: '', servings: 1 })).toBeNull();
  });
});

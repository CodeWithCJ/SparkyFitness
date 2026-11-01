import { render, screen, waitFor } from '@testing-library/react';
import type { PlateInventoryResponse } from '@workspace/shared';
import { PlateCalculatorDialog } from '@/components/PlateCalculator/PlateCalculatorDialog';
import { usePlateInventory } from '@/hooks/PlateInventory/usePlateInventory';

jest.mock('@/hooks/PlateInventory/usePlateInventory', () => ({
  usePlateInventory: jest.fn(),
}));

const stored = (
  overrides: Partial<PlateInventoryResponse>
): PlateInventoryResponse => ({
  id: 'inv-1',
  user_id: 'user-1',
  weight_unit: 'kg',
  bars: [{ id: 'b1', name: null, kind: 'barbell', weight: 20 }],
  plates: [{ weight: 20, pairs: 1 }],
  collars_enabled: false,
  collar_weight: 0,
  created_at: '2026-10-24T00:00:00.000Z',
  updated_at: '2026-10-24T00:00:00.000Z',
  ...overrides,
});

const renderDialog = (
  props: Partial<React.ComponentProps<typeof PlateCalculatorDialog>> = {}
) =>
  render(
    <PlateCalculatorDialog
      open
      onOpenChange={jest.fn()}
      weightKg={100}
      weightUnit="kg"
      equipment={['barbell']}
      {...props}
    />
  );

describe('PlateCalculatorDialog', () => {
  beforeEach(() => {
    (usePlateInventory as jest.Mock).mockReturnValue({ data: null });
  });

  it('uses the standard kg set until an inventory is saved', () => {
    renderDialog();
    expect(screen.getByText('Target 100 kg')).toBeTruthy();
    expect(screen.getByText('1 × 25 kg')).toBeTruthy();
    expect(screen.getByText('1 × 15 kg')).toBeTruthy();
    expect(screen.getByText(/40 kg per side · 100 kg total/)).toBeTruthy();
  });

  it('loads pounds when the person works in pounds', () => {
    renderDialog({ weightKg: 102.0583, weightUnit: 'lbs' });
    // 225.0 lb shown, 45 lb bar: 90 lb per side is two 45s.
    expect(screen.getByText('Target 225 lbs')).toBeTruthy();
    expect(screen.getByText('2 × 45 lbs')).toBeTruthy();
  });

  it('never rounds: it names the nearest loadable weights', () => {
    (usePlateInventory as jest.Mock).mockReturnValue({
      data: stored({ plates: [{ weight: 20, pairs: 1 }] }),
    });
    renderDialog({ weightKg: 70 });
    expect(
      screen.getByText('Your plates cannot make exactly 70 kg.')
    ).toBeTruthy();
    expect(screen.getByText('Nearest below: 60 kg')).toBeTruthy();
    expect(screen.getByText('10 kg short of the target')).toBeTruthy();
    expect(
      screen.getByText('The target is heavier than your plates can load.')
    ).toBeTruthy();
  });

  it('says so when the target is lighter than the bar', () => {
    renderDialog({ weightKg: 15 });
    expect(
      screen.getByText(
        'The target is lighter than the empty bar, collars included.'
      )
    ).toBeTruthy();
    expect(screen.getByText('Nearest above: 20 kg')).toBeTruthy();
  });

  it('counts collars when the inventory does', () => {
    (usePlateInventory as jest.Mock).mockReturnValue({
      data: stored({
        plates: [
          { weight: 25, pairs: 1 },
          { weight: 10, pairs: 1 },
          { weight: 2.5, pairs: 1 },
        ],
        collars_enabled: true,
        collar_weight: 2.5,
      }),
    });
    renderDialog({ weightKg: 100 });
    expect(screen.getByText(/collars 5 kg/)).toBeTruthy();
    expect(screen.getByText(/37.5 kg per side/)).toBeTruthy();
  });

  it('asks for a weight when the set has none', () => {
    renderDialog({ weightKg: null });
    expect(
      screen.getAllByText('Enter a weight for the set first.').length
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/per side/)).toBeNull();
  });

  it('suggests the EZ bar for EZ bar exercises', async () => {
    (usePlateInventory as jest.Mock).mockReturnValue({
      data: stored({
        bars: [
          { id: 'b1', name: null, kind: 'barbell', weight: 20 },
          { id: 'b2', name: null, kind: 'ez', weight: 7.5 },
        ],
        plates: [{ weight: 10, pairs: 2 }],
      }),
    });
    renderDialog({ weightKg: 27.5, equipment: ['e-z curl bar'] });
    await waitFor(() =>
      expect(screen.getByText(/10 kg per side/)).toBeTruthy()
    );
    expect(screen.getByRole('combobox').textContent).toContain('EZ bar');
  });
});

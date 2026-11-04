import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { presetInventory } from '@workspace/shared';
import { PlateInventoryDialog } from '@/pages/Exercises/PlateInventoryDialog';

const renderDialog = (
  props: Partial<React.ComponentProps<typeof PlateInventoryDialog>> = {}
) => {
  const onSubmit = jest.fn().mockResolvedValue(undefined);
  const onReset = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <PlateInventoryDialog
      open
      onOpenChange={onOpenChange}
      initial={presetInventory('kg')}
      hasSaved={false}
      onSubmit={onSubmit}
      onReset={onReset}
      isSaving={false}
      {...props}
    />
  );
  return { onSubmit, onReset, onOpenChange };
};

describe('PlateInventoryDialog', () => {
  it('saves the standard kg set untouched', async () => {
    const { onSubmit } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const body = onSubmit.mock.calls[0]![0];
    expect(body.weight_unit).toBe('kg');
    expect(body.plates.map((p: { weight: number }) => p.weight)).toEqual([
      25, 20, 15, 10, 5, 2.5, 1.25, 0.5,
    ]);
    expect(body.bars.map((b: { weight: number }) => b.weight)).toEqual([
      20, 15, 7.5, 25,
    ]);
    expect(body.collars_enabled).toBe(false);
  });

  it('adds an odd plate and edits a count', async () => {
    const { onSubmit } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Add plate' }));
    const weights = screen.getAllByLabelText('Weight');
    // Plate rows come first; the new plate is the last of them.
    fireEvent.change(weights[8]!, { target: { value: '0.25' } });
    fireEvent.change(screen.getAllByLabelText('Pairs')[0]!, {
      target: { value: '4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const body = onSubmit.mock.calls[0]![0];
    expect(body.plates[0]).toEqual({ weight: 25, pairs: 4 });
    expect(body.plates.at(-1)).toEqual({ weight: 0.25, pairs: 1 });
  });

  it('switches to the pound preset', async () => {
    const { onSubmit } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Use lb plates' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const body = onSubmit.mock.calls[0]![0];
    expect(body.weight_unit).toBe('lbs');
    expect(body.plates.map((p: { weight: number }) => p.weight)).toEqual([
      45, 35, 25, 10, 5, 2.5, 1.25,
    ]);
    expect(body.bars[0].weight).toBe(45);
  });

  it('sends the collar weight only through the toggle', async () => {
    const { onSubmit } = renderDialog();
    fireEvent.click(screen.getByLabelText('Collars count'));
    fireEvent.change(screen.getByLabelText(/Weight of one collar/), {
      target: { value: '1.25' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const body = onSubmit.mock.calls[0]![0];
    expect(body.collars_enabled).toBe(true);
    expect(body.collar_weight).toBe(1.25);
  });

  it('blocks a duplicate plate size and explains why', async () => {
    const { onSubmit } = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Add plate' }));
    fireEvent.change(screen.getAllByLabelText('Weight')[8]!, {
      target: { value: '25' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('removes a bar but keeps at least one', () => {
    renderDialog({
      initial: {
        ...presetInventory('kg'),
        bars: presetInventory('kg').bars.slice(0, 1),
      },
    });
    const remove = screen.getByRole('button', { name: /Remove bar/ });
    expect((remove as HTMLButtonElement).disabled).toBe(true);
  });

  it('offers a reset only when something is saved', () => {
    const first = renderDialog();
    expect(
      screen.queryByRole('button', { name: 'Reset to standard' })
    ).toBeNull();
    const second = renderDialog({ hasSaved: true });
    fireEvent.click(screen.getByRole('button', { name: 'Reset to standard' }));
    expect(second.onReset).toHaveBeenCalled();
    expect(first.onReset).not.toHaveBeenCalled();
  });
});

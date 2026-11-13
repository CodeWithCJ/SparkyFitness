import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { NamedPortionEditor } from '@/components/FoodSearch/NamedPortionEditor';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }),
}));

describe('NamedPortionEditor', () => {
  it('shows saved portion summaries beside the add action', () => {
    render(
      <NamedPortionEditor unit="g" onAdd={jest.fn()}>
        <p>1 Package (150 g) - 180 kcal</p>
      </NamedPortionEditor>
    );
    expect(
      screen.getByText('1 Package (150 g) - 180 kcal')
    ).toBeInTheDocument();
  });
  it('adds a named measured portion and keeps cancel local to the draft', () => {
    const onAdd = jest.fn().mockReturnValue(true);
    render(<NamedPortionEditor unit="g" onAdd={onAdd} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add portion' }));
    fireEvent.change(screen.getByLabelText('Portion name'), {
      target: { value: 'Packung' },
    });
    fireEvent.change(screen.getByLabelText('Weight (g)'), {
      target: { value: '150' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Add portion to food' })
    );
    expect(onAdd).toHaveBeenCalledWith({
      name: 'Packung',
      amount: 150,
      unit: 'g',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add portion' }));
    fireEvent.change(screen.getByLabelText('Portion name'), {
      target: { value: 'Discarded' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Portion name')).not.toBeInTheDocument();
  });

  it('explains when a metric reference is required', () => {
    render(<NamedPortionEditor unit={null} onAdd={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Add portion' })).toBeDisabled();
    expect(
      screen.getByText(
        'Add a weight or volume unit first to calculate portions.'
      )
    ).toBeInTheDocument();
  });
});

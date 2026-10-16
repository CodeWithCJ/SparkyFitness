import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { enUS } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';

describe('Calendar caption dropdowns', () => {
  it.each(['rtl', 'ltr'] as const)(
    'preserves %s direction in the portaled menu',
    (dir) => {
      render(<Calendar locale={enUS} captionLayout="dropdown" dir={dir} />);
      const trigger = screen.getByRole('combobox', { name: /year/i });
      expect(trigger).toHaveAttribute('dir', dir);
      fireEvent.keyDown(trigger, { key: 'ArrowDown' });
      expect(screen.getByRole('listbox')).toHaveAttribute('dir', dir);
    }
  );

  it('preserves custom month and year dropdown classes and styles', () => {
    render(
      <Calendar
        locale={enUS}
        captionLayout="dropdown"
        classNames={{
          months_dropdown: 'custom-month',
          years_dropdown: 'custom-year',
        }}
        styles={{
          dropdown: { color: 'red' },
          months_dropdown: { width: 120 },
          years_dropdown: { width: 100 },
        }}
      />
    );
    const month = screen.getByRole('combobox', { name: /month/i });
    const year = screen.getByRole('combobox', { name: /year/i });
    expect(month).toHaveClass('custom-month', 'h-8');
    expect(year).toHaveClass('custom-year', 'h-8');
    expect(month).toHaveStyle({ color: 'rgb(255, 0, 0)', width: '120px' });
    expect(year).toHaveStyle({ color: 'rgb(255, 0, 0)', width: '100px' });
  });

  it('navigates years without selecting a day and retains descending years', () => {
    const onMonthChange = jest.fn();
    const onSelect = jest.fn();
    render(
      <Calendar
        locale={enUS}
        mode="single"
        captionLayout="dropdown"
        defaultMonth={new Date(2026, 4)}
        startMonth={new Date(1926, 0)}
        endMonth={new Date(2026, 11)}
        onMonthChange={onMonthChange}
        onSelect={onSelect}
      />
    );

    fireEvent.keyDown(screen.getByRole('combobox', { name: /year/i }), {
      key: 'ArrowDown',
    });
    const options = screen.getAllByRole('option');
    expect(options[0]).toHaveTextContent('2026');
    expect(options[options.length - 1]).toHaveTextContent('1926');
    fireEvent.click(screen.getByRole('option', { name: '2000' }));

    expect(onMonthChange).toHaveBeenCalledWith(new Date(2000, 4));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox', { name: /year/i })).toHaveTextContent(
      '2000'
    );
  });

  it('keeps out-of-range months disabled and navigates to an enabled month', () => {
    const onMonthChange = jest.fn();
    render(
      <Calendar
        locale={enUS}
        captionLayout="dropdown"
        defaultMonth={new Date(2026, 4)}
        startMonth={new Date(2026, 3)}
        endMonth={new Date(2026, 8)}
        onMonthChange={onMonthChange}
      />
    );

    fireEvent.keyDown(screen.getByRole('combobox', { name: /month/i }), {
      key: 'ArrowDown',
    });
    expect(screen.getByRole('option', { name: 'Jan' })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
    fireEvent.click(screen.getByRole('option', { name: 'Jun' }));
    expect(onMonthChange).toHaveBeenCalledWith(new Date(2026, 5));
  });
});

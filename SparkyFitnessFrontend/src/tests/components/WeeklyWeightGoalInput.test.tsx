import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { WeeklyWeightGoalInput } from '@/components/WeeklyWeightGoalInput';

describe('WeeklyWeightGoalInput', () => {
  it('refreshes an externally loaded rate while keeping the current display unit', () => {
    const props = { onChange: jest.fn(), onValidityChange: jest.fn() };
    const { rerender } = render(
      <WeeklyWeightGoalInput {...props} value={-0.5} />
    );
    fireEvent.keyDown(
      screen.getByRole('combobox', { name: 'Weekly amount unit' }),
      { key: 'ArrowDown' }
    );
    fireEvent.click(screen.getByRole('option', { name: 'g / week' }));

    rerender(<WeeklyWeightGoalInput {...props} value={0.25} />);
    expect(screen.getByRole('textbox', { name: 'Weekly amount' })).toHaveValue(
      '250'
    );
    expect(
      screen.getByRole('combobox', { name: 'Weight goal' })
    ).toHaveTextContent('Gain weight');
  });

  it('converts kilograms to grams without changing the requested rate', () => {
    const onChange = jest.fn();
    render(
      <WeeklyWeightGoalInput
        value={-0.5}
        onChange={onChange}
        onValidityChange={jest.fn()}
      />
    );
    fireEvent.keyDown(
      screen.getByRole('combobox', { name: 'Weekly amount unit' }),
      { key: 'ArrowDown' }
    );
    fireEvent.click(screen.getByRole('option', { name: 'g / week' }));
    const amount = screen.getByRole('textbox', { name: 'Weekly amount' });
    expect(amount).toHaveValue('500');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(amount, { target: { value: '250' } });
    expect(onChange).toHaveBeenLastCalledWith(-0.25);
  });

  it('switches between loss, gain and maintenance without losing the amount', () => {
    const onChange = jest.fn();
    render(
      <WeeklyWeightGoalInput
        value={-0.5}
        onChange={onChange}
        onValidityChange={jest.fn()}
      />
    );
    const direction = screen.getByRole('combobox', { name: 'Weight goal' });
    fireEvent.keyDown(direction, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'Gain weight' }));
    expect(onChange).toHaveBeenLastCalledWith(0.5);
    fireEvent.keyDown(direction, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'Maintain weight' }));
    expect(onChange).toHaveBeenLastCalledWith(0);
    expect(screen.queryByRole('textbox', { name: 'Weekly amount' })).toBeNull();
    fireEvent.keyDown(direction, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('option', { name: 'Lose weight' }));
    expect(onChange).toHaveBeenLastCalledWith(-0.5);
  });

  it('accepts a decimal comma and keeps loss signed when editing kilograms', () => {
    const onChange = jest.fn();
    const onValidityChange = jest.fn();
    render(
      <WeeklyWeightGoalInput
        value={-0.5}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Weekly amount' }), {
      target: { value: '0,25' },
    });
    expect(onChange).toHaveBeenLastCalledWith(-0.25);
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });

  it('blocks empty, non-finite and excessive rates instead of saving zero', () => {
    const onChange = jest.fn();
    const onValidityChange = jest.fn();
    render(
      <WeeklyWeightGoalInput
        value={-0.5}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
    );
    const amount = screen.getByRole('textbox', { name: 'Weekly amount' });

    for (const value of ['', 'Infinity', '2.1', '-1', '1e2']) {
      fireEvent.change(amount, { target: { value } });
      expect(onValidityChange).toHaveBeenLastCalledWith(false);
      expect(amount).toHaveAttribute('aria-invalid', 'true');
    }
    expect(onChange).not.toHaveBeenCalled();
  });

  it('starts in the profile pounds unit and stores edited pounds as kilograms', () => {
    const onChange = jest.fn();
    render(
      <WeeklyWeightGoalInput
        value={-0.5}
        weightUnit="lbs"
        onChange={onChange}
        onValidityChange={jest.fn()}
      />
    );
    expect(
      screen.getByRole('combobox', { name: 'Weekly amount unit' })
    ).toHaveTextContent('lbs / week');
    const amount = screen.getByRole('textbox', { name: 'Weekly amount' });
    expect(amount).toHaveValue('1.102');
    fireEvent.change(amount, { target: { value: '1.5' } });
    expect(onChange).toHaveBeenLastCalledWith(-0.68);
  });

  it('starts in stones and pounds with accessible fields and stores a pounds edit in kilograms', () => {
    const onChange = jest.fn();
    const onValidityChange = jest.fn();
    render(
      <WeeklyWeightGoalInput
        value={0.5}
        weightUnit="st_lbs"
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
    );
    expect(
      screen.getByRole('combobox', { name: 'Weekly amount unit' })
    ).toHaveTextContent('st + lbs / week');
    expect(
      screen.getByRole('textbox', { name: 'Stones per week' })
    ).toHaveValue('0');
    const pounds = screen.getByRole('textbox', { name: 'Pounds per week' });
    expect(pounds).toHaveValue('1.102');
    fireEvent.change(pounds, { target: { value: '2' } });
    expect(onChange).toHaveBeenLastCalledWith(0.907);
    fireEvent.change(screen.getByRole('textbox', { name: 'Stones per week' }), {
      target: { value: '1' },
    });
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    expect(pounds).toHaveAttribute('aria-invalid', 'true');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('rejects a pounds amount above the same two-kilogram limit', () => {
    const onChange = jest.fn();
    const onValidityChange = jest.fn();
    render(
      <WeeklyWeightGoalInput
        value={-0.5}
        weightUnit="lbs"
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Weekly amount' }), {
      target: { value: '5' },
    });
    expect(onValidityChange).toHaveBeenLastCalledWith(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the exact canonical rate through a kilogram, pounds and stone round trip', () => {
    const onChange = jest.fn();
    render(
      <WeeklyWeightGoalInput
        value={-0.333}
        onChange={onChange}
        onValidityChange={jest.fn()}
      />
    );
    for (const name of [
      'lbs / week',
      'st + lbs / week',
      'g / week',
      'kg / week',
    ]) {
      fireEvent.keyDown(
        screen.getByRole('combobox', { name: 'Weekly amount unit' }),
        {
          key: 'ArrowDown',
        }
      );
      fireEvent.click(screen.getByRole('option', { name }));
    }
    expect(screen.getByRole('textbox', { name: 'Weekly amount' })).toHaveValue(
      '0.333'
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('updates the display when the profile unit changes without changing the goal', () => {
    const props = {
      value: -0.5,
      onChange: jest.fn(),
      onValidityChange: jest.fn(),
    };
    const { rerender } = render(
      <WeeklyWeightGoalInput {...props} weightUnit="kg" />
    );
    rerender(<WeeklyWeightGoalInput {...props} weightUnit="lbs" />);
    expect(screen.getByRole('textbox', { name: 'Weekly amount' })).toHaveValue(
      '1.102'
    );
    expect(
      screen.getByRole('combobox', { name: 'Weekly amount unit' })
    ).toHaveTextContent('lbs / week');
    expect(props.onChange).not.toHaveBeenCalled();
  });

  it('lets a stone-profile maintenance goal become loss by entering only pounds', () => {
    const onChange = jest.fn();
    const onValidityChange = jest.fn();
    render(
      <WeeklyWeightGoalInput
        value={0}
        weightUnit="st_lbs"
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
    );
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Weight goal' }), {
      key: 'ArrowDown',
    });
    fireEvent.click(screen.getByRole('option', { name: 'Lose weight' }));
    expect(
      screen.getByRole('textbox', { name: 'Stones per week' })
    ).toHaveValue('0');
    fireEvent.change(screen.getByRole('textbox', { name: 'Pounds per week' }), {
      target: { value: '1' },
    });
    expect(onChange).toHaveBeenLastCalledWith(-0.454);
    expect(onValidityChange).toHaveBeenLastCalledWith(true);
  });
});

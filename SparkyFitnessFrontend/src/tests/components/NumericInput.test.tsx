import { ComponentProps, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NumericInput } from '@/components/NumericInput';

const TestNumericInput = () => {
  const [value, setValue] = useState<number | undefined>();

  const setExternalValue = (nextValue: number) => {
    setValue(nextValue);
  };

  return (
    <>
      <NumericInput
        aria-label="numeric input"
        value={value}
        onValueChange={setValue}
      />
      <button type="button" onClick={() => setExternalValue(10)}>
        10
      </button>
      <button type="button" onClick={() => setExternalValue(20)}>
        20
      </button>
    </>
  );
};

describe('NumericInput', () => {
  it('syncs external value changes while ignoring repeated same-value updates', () => {
    render(<TestNumericInput />);

    const input = screen.getByLabelText('numeric input');
    const setTenButton = screen.getByRole('button', { name: '10' });
    const setTwentyButton = screen.getByRole('button', { name: '20' });

    fireEvent.change(input, { target: { value: '5' } });
    expect(input).toHaveValue(5);

    fireEvent.click(setTenButton);
    expect(input).toHaveValue(10);

    fireEvent.click(setTenButton);
    expect(input).toHaveValue(10);

    fireEvent.click(setTwentyButton);
    expect(input).toHaveValue(20);
  });

  it('renders an empty string value without crashing', () => {
    // Callers (e.g. useFoodForm) store a cleared nutrient as '' rather than
    // undefined; the component must not call toFixed on a non-number.
    render(
      <NumericInput
        aria-label="numeric input"
        value={'' as unknown as number}
        onValueChange={() => {}}
      />
    );

    expect(screen.getByLabelText('numeric input')).toHaveValue(null);
  });

  it('clamps a negative entry up to min on blur', () => {
    // Nutrient amounts are non-negative server-side, so the nutrient grid passes
    // min="0" to get this clamp. Without a min the component does not clamp at
    // all and a typed negative reaches the API, which rejects the whole save.
    const ClampedInput = () => {
      const [value, setValue] = useState<number | undefined>();
      return (
        <NumericInput
          aria-label="numeric input"
          min="0"
          decimals={1}
          value={value}
          onValueChange={setValue}
        />
      );
    };
    render(<ClampedInput />);

    const input = screen.getByLabelText('numeric input');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '-5' } });
    fireEvent.blur(input);

    expect(input).toHaveValue(0);
  });
});

const MathInput = (props: Partial<ComponentProps<typeof NumericInput>>) => {
  const [value, setValue] = useState<number | undefined>(50);
  return (
    <form>
      <NumericInput
        aria-label="quantity"
        allowExpressions
        decimals={3}
        min={0.01}
        required
        value={value}
        onValueChange={setValue}
        {...props}
      />
      <output aria-label="calculated quantity">{value}</output>
      <button type="submit">Save</button>
    </form>
  );
};

describe('NumericInput arithmetic', () => {
  it.each([
    ['28/3', '9.333'],
    ['30*5', '150'],
    ['50+10', '60'],
    ['(50-10)/2', '20'],
    ['1,5*2', '3'],
  ])('previews and commits %s as %s', (expression, expected) => {
    render(<MathInput />);
    const input = screen.getByLabelText('quantity');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: expression } });
    expect(input).toHaveValue(expression);
    expect(screen.getByLabelText('calculated quantity')).toHaveTextContent(
      expected
    );
    fireEvent.blur(input);
    expect(input).toHaveValue(expected);
    expect(input).toBeValid();
  });

  it.each(['30*', '1/0', '1+alert(1)', 'NaN'])(
    'blocks saving %s without overwriting the last valid quantity',
    (expression) => {
      render(<MathInput />);
      const input = screen.getByLabelText('quantity');
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: expression } });
      fireEvent.blur(input);
      expect(input).toHaveValue(expression);
      expect(input).toBeInvalid();
      expect(screen.getByLabelText('calculated quantity')).toHaveTextContent(
        '50'
      );

      fireEvent.change(input, { target: { value: '30*5' } });
      expect(input).toBeValid();
      expect(screen.getByLabelText('calculated quantity')).toHaveTextContent(
        '150'
      );
    }
  );

  it('commits on Enter and preserves the caller key handler', () => {
    const onKeyDown = jest.fn();
    render(<MathInput onKeyDown={onKeyDown} />);
    const input = screen.getByLabelText('quantity');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '50+10' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(input).toHaveValue('60');
    expect(onKeyDown).toHaveBeenCalledTimes(1);
  });

  it('retains required, rounding and min/max constraints', () => {
    render(<MathInput max={100} />);
    const input = screen.getByLabelText('quantity');
    fireEvent.change(input, { target: { value: '60*2' } });
    expect(input).toBeInvalid();
    fireEvent.blur(input);
    expect(input).toHaveValue('100');
    expect(screen.getByLabelText('calculated quantity')).toHaveTextContent(
      '100'
    );
    fireEvent.change(input, { target: { value: '-1' } });
    fireEvent.blur(input);
    expect(input).toHaveValue('0.01');
    fireEvent.change(input, { target: { value: '' } });
    expect(input).toHaveValue('');
    expect(input).toBeInvalid();
    expect(screen.getByLabelText('calculated quantity')).toBeEmptyDOMElement();
  });
});

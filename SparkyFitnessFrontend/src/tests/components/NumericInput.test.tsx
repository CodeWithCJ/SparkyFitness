import { useState } from 'react';
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
});

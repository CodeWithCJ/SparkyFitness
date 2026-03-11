import { useState, ComponentProps } from 'react';
import { Input } from '@/components/ui/input';

interface NumericInputProps extends Omit<
  ComponentProps<typeof Input>,
  'value' | 'onChange' | 'onBlur' | 'onFocus' | 'type'
> {
  value: number | undefined | null;
  decimals?: number;
  onValueChange: (value: number | undefined) => void;
}

function formatValue(
  value: number | undefined | null,
  decimals: number
): string {
  if (value === undefined || value === null) return '';
  return Number(value.toFixed(decimals)).toString();
}

export const NumericInput = ({
  value,
  decimals = 0,
  onValueChange,
  min,
  max,
  ...inputProps
}: NumericInputProps) => {
  const minNum = min !== undefined ? Number(min) : undefined;
  const maxNum = max !== undefined ? Number(max) : undefined;

  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState(() =>
    formatValue(value, decimals)
  );
  const [prevValue, setPrevValue] = useState(value);
  const [prevDecimals, setPrevDecimals] = useState(decimals);

  // Sync from parent when value changes externally (e.g. preset applied),
  // but not while the user is actively typing.
  if (value !== prevValue || decimals !== prevDecimals) {
    setPrevValue(value);
    setPrevDecimals(decimals);
    if (!isFocused) {
      setLocalValue(formatValue(value, decimals));
    }
  }

  return (
    <Input
      {...inputProps}
      min={min}
      max={max}
      type="number"
      value={localValue}
      onFocus={() => {
        setIsFocused(true);
      }}
      onChange={(e) => {
        setLocalValue(e.target.value);
        const val = e.target.value === '' ? undefined : Number(e.target.value);
        setPrevValue(val);
        onValueChange(val);
      }}
      onBlur={(e) => {
        setIsFocused(false);
        if (e.target.value === '') {
          setLocalValue('');
          setPrevValue(undefined);
          if (value !== undefined) {
            onValueChange(undefined);
          }
          return;
        }
        let val = Number(e.target.value);
        val = Number(val.toFixed(decimals));
        if (minNum !== undefined && val < minNum) val = minNum;
        if (maxNum !== undefined && val > maxNum) val = maxNum;
        setLocalValue(formatValue(val, decimals));
        setPrevValue(val);
        if (val !== value) {
          onValueChange(val);
        }
      }}
    />
  );
};

import {
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  ComponentProps,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { evaluateArithmetic } from '@workspace/shared';

interface NumericInputProps extends Omit<
  ComponentProps<typeof Input>,
  'value' | 'onChange' | 'onBlur' | 'onFocus' | 'type'
> {
  value: number | undefined | null;
  decimals?: number;
  /**
   * Enables arithmetic expressions and a text keyboard for entering operators.
   * Outside a <form>, use onValidityChange to block custom save actions while an
   * expression is invalid; otherwise they can save the last valid numeric value.
   */
  allowExpressions?: boolean;
  onValidityChange?: (valid: boolean) => void;
  onValueChange: (value: number | undefined) => void;
}

function formatValue(
  value: number | string | undefined | null,
  decimals: number
): string {
  if (value === undefined || value === null || value === '') return '';
  // Callers may pass a stringified number (or an empty-ish value) even though
  // the prop type says number, so coerce and guard against NaN before toFixed.
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return '';
  return Number(num.toFixed(decimals)).toString();
}

export const NumericInput = ({
  value,
  decimals = 0,
  allowExpressions = false,
  onValidityChange,
  onValueChange,
  min,
  max,
  ref,
  onKeyDown,
  ...inputProps
}: NumericInputProps) => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(ref, () => inputRef.current!, []);
  const minNum = min !== undefined ? Number(min) : undefined;
  const maxNum = max !== undefined ? Number(max) : undefined;

  const [isFocused, setIsFocused] = useState(false);
  const [localValue, setLocalValue] = useState(() =>
    formatValue(value, decimals)
  );
  const [prevValue, setPrevValue] = useState(value);
  const [prevDecimals, setPrevDecimals] = useState(decimals);

  const expressionValue = allowExpressions
    ? evaluateArithmetic(localValue)
    : undefined;
  const expressionError =
    allowExpressions &&
    localValue.trim() !== '' &&
    (expressionValue === undefined ||
      (minNum !== undefined && expressionValue < minNum) ||
      (maxNum !== undefined && expressionValue > maxNum))
      ? t(
          'numericInput.invalidExpression',
          'Enter a valid calculation within the allowed range.'
        )
      : '';

  useEffect(() => {
    inputRef.current?.setCustomValidity(expressionError);
    onValidityChange?.(
      !expressionError && (!inputProps.required || localValue.trim() !== '')
    );
  }, [expressionError, localValue, inputProps.required, onValidityChange]);

  const commitExpression = () => {
    if (!localValue.trim() || expressionValue === undefined) return;
    let nextValue = Number(expressionValue.toFixed(decimals));
    if (minNum !== undefined && nextValue < minNum) nextValue = minNum;
    if (maxNum !== undefined && nextValue > maxNum) nextValue = maxNum;
    inputRef.current?.setCustomValidity('');
    setLocalValue(formatValue(nextValue, decimals));
    setPrevValue(nextValue);
    if (nextValue !== value) onValueChange(nextValue);
  };

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
      ref={inputRef}
      min={min}
      max={max}
      type={allowExpressions ? 'text' : 'number'}
      inputMode={allowExpressions ? 'text' : inputProps.inputMode}
      title={
        allowExpressions
          ? t(
              'numericInput.mathHint',
              'Supports +, -, *, / and parentheses, e.g. 30*5.'
            )
          : inputProps.title
      }
      aria-invalid={expressionError ? true : inputProps['aria-invalid']}
      value={localValue}
      onFocus={() => {
        setIsFocused(true);
      }}
      onChange={(e) => {
        setLocalValue(
          allowExpressions && !e.target.value.trim() ? '' : e.target.value
        );
        const val =
          e.target.value.trim() === ''
            ? undefined
            : allowExpressions
              ? evaluateArithmetic(e.target.value)
              : Number(e.target.value);
        if (
          allowExpressions &&
          e.target.value.trim() !== '' &&
          val === undefined
        )
          return;
        const nextValue =
          allowExpressions && val !== undefined
            ? Number(val.toFixed(decimals))
            : val;
        setPrevValue(nextValue);
        onValueChange(nextValue);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (
          allowExpressions &&
          event.key === 'Enter' &&
          !event.defaultPrevented &&
          !event.nativeEvent.isComposing &&
          event.keyCode !== 229
        )
          commitExpression();
      }}
      onBlur={(e) => {
        setIsFocused(false);
        if (allowExpressions) {
          commitExpression();
          return;
        }
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

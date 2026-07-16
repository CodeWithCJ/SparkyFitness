import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import {
  kgToLbs,
  lbsToKg,
  kgToStonesLbs,
  stonesLbsToKg,
  cmToInches,
  inchesToCm,
  cmToFeetInches,
  feetInchesToCm,
} from '@/utils/unitConversions';
import { getPrecision } from '@workspace/shared';

interface UnitInputProps {
  id?: string;
  value: number | string | null; // Metric base value (kg or cm)
  unit: string; // kg, lbs, st_lbs, cm, inches, ft_in
  type: 'weight' | 'height' | 'measurement';
  onChange: (metricValue: number | null) => void;
  placeholder?: string;
  placeholderValue?: number | null; // Metric base value shown as placeholder when the input is empty
  className?: string;
  inputClassName?: string;
  'aria-label'?: string;
}

type UnitInputType = UnitInputProps['type'];

const toSingleDisplayString = (
  metricValue: number,
  unit: string,
  type: UnitInputType
) => {
  const precision = getPrecision(type, unit);
  let displayVal = metricValue;
  if (unit === 'lbs') displayVal = kgToLbs(metricValue);
  if (unit === 'inches') displayVal = cmToInches(metricValue);
  return Number(displayVal.toFixed(precision)).toString();
};

const toSplitDisplayStrings = (
  metricValue: number,
  unit: 'st_lbs' | 'ft_in',
  type: UnitInputType
): [string, string] => {
  const precision = getPrecision(type, unit);
  if (unit === 'st_lbs') {
    const { stones, lbs } = kgToStonesLbs(metricValue);
    return [stones.toString(), Number(lbs.toFixed(precision)).toString()];
  }
  const { feet, inches } = cmToFeetInches(metricValue);
  return [feet.toString(), Number(inches.toFixed(precision)).toString()];
};

export const UnitInput: React.FC<UnitInputProps> = ({
  id,
  value,
  unit,
  onChange,
  type,
  placeholder,
  placeholderValue,
  className,
  inputClassName = '',
  'aria-label': ariaLabel,
}) => {
  const metricValue =
    value === null || value === undefined || value === ''
      ? null
      : typeof value === 'string'
        ? parseFloat(value)
        : value;

  // Local state for split inputs
  const [val1, setVal1] = useState<string>(''); // stones, feet, or single value
  const [val2, setVal2] = useState<string>(''); // lbs or inches

  // Store the last seen values to detect changes and sync state during render
  const [prevMetricValue, setPrevMetricValue] = useState<number | null>(null);
  const [prevUnit, setPrevUnit] = useState<string | null>(null);

  if (metricValue !== prevMetricValue || unit !== prevUnit) {
    setPrevMetricValue(metricValue);
    setPrevUnit(unit);

    if (metricValue === null || Number.isNaN(metricValue)) {
      setVal1('');
      setVal2('');
    } else if (unit === 'st_lbs' || unit === 'ft_in') {
      const [display1, display2] = toSplitDisplayStrings(
        metricValue,
        unit,
        type
      );
      setVal1(display1);
      setVal2(display2);
    } else {
      setVal1(toSingleDisplayString(metricValue, unit, type));
    }
  }

  const placeholderMetric =
    placeholderValue == null || Number.isNaN(placeholderValue)
      ? null
      : placeholderValue;

  const handleSingleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVal1(e.target.value);
  };
  const handleSingleBlur = () => {
    if (val1.trim() === '') {
      if (metricValue !== null) {
        onChange(null);
      }
      return;
    }
    const num = parseFloat(val1);
    if (Number.isNaN(num)) {
      if (metricValue !== null) {
        onChange(null);
      }
      return;
    }
    let converted = num;
    if (unit === 'lbs') converted = lbsToKg(num);
    if (unit === 'inches') converted = inchesToCm(num);
    if (converted !== metricValue) {
      onChange(converted);
    }
  };

  const handleSplitChange = (v1: string, v2: string) => {
    setVal1(v1.replace(/[^0-9]/g, ''));
    setVal2(v2);
  };

  const handleSplitBlur = () => {
    if (val1.trim() === '' && val2.trim() === '') {
      if (metricValue !== null) {
        onChange(null);
      }
      return;
    }
    const n1 = parseFloat(val1) || 0;
    const n2 = parseFloat(val2) || 0;
    let converted = 0;
    if (unit === 'st_lbs') converted = stonesLbsToKg(n1, n2);
    else if (unit === 'ft_in') converted = feetInchesToCm(n1, n2);
    if (converted !== metricValue) {
      onChange(converted);
    }
  };

  // Render two inputs for st_lbs or ft_in
  if (unit === 'st_lbs' || unit === 'ft_in') {
    const label1 = unit === 'st_lbs' ? 'st' : 'ft';
    const label2 = unit === 'st_lbs' ? 'lb' : 'in';
    const [placeholder1, placeholder2] =
      placeholderMetric !== null
        ? toSplitDisplayStrings(placeholderMetric, unit, type)
        : ['0', '0'];

    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="relative flex-1">
          <Input
            id={`${id}-1`}
            type="number"
            step="1"
            value={val1}
            onChange={(e) => handleSplitChange(e.target.value, val2)}
            onBlur={handleSplitBlur}
            className={`pr-8 ${inputClassName}`}
            placeholder={placeholder1}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {label1}
          </span>
        </div>
        <div className="relative flex-1">
          <Input
            id={`${id}-2`}
            type="number"
            step={
              getPrecision(type, unit) > 0
                ? (1 / Math.pow(10, getPrecision(type, unit))).toString()
                : '1'
            }
            value={val2}
            onChange={(e) => handleSplitChange(val1, e.target.value)}
            onBlur={handleSplitBlur}
            className={`pr-8 ${inputClassName}`}
            placeholder={placeholder2}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {label2}
          </span>
        </div>
      </div>
    );
  }

  // Render standard single input
  const precision = getPrecision(type, unit);
  const step = precision > 0 ? (1 / Math.pow(10, precision)).toString() : '1';
  const singlePlaceholder =
    placeholder ??
    (placeholderMetric !== null
      ? toSingleDisplayString(placeholderMetric, unit, type)
      : undefined);

  return (
    <div className={`relative ${className}`}>
      <Input
        id={id}
        type="number"
        step={step}
        value={val1}
        onChange={handleSingleChange}
        onBlur={handleSingleBlur}
        placeholder={singlePlaceholder}
        className={`pr-9 ${inputClassName}`}
        aria-label={ariaLabel}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {unit}
      </span>
    </div>
  );
};

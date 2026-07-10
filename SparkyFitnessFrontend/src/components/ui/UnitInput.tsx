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
import { useTranslation } from 'react-i18next';
import { getLocalizedUnitLabel } from '@/utils/unitLocalization';

interface UnitInputProps {
  id?: string;
  value: number | string | null; // Metric base value (kg or cm)
  unit: string; // kg, lbs, st_lbs, cm, inches, ft_in
  type: 'weight' | 'height' | 'measurement';
  onChange: (metricValue: number | null) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  'aria-label'?: string;
}

export const UnitInput: React.FC<UnitInputProps> = ({
  id,
  value,
  unit,
  onChange,
  type,
  placeholder,
  className,
  inputClassName = '',
  'aria-label': ariaLabel,
}) => {
  const { t } = useTranslation();
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
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
    } else {
      switch (unit) {
        case 'st_lbs': {
          const { stones, lbs } = kgToStonesLbs(metricValue);
          const precision = getPrecision(type, 'st_lbs');
          setVal1(stones.toString());
          setVal2(Number(lbs.toFixed(precision)).toString());
          break;
        }
        case 'ft_in': {
          const { feet, inches } = cmToFeetInches(metricValue);
          const precision = getPrecision(type, 'ft_in');
          setVal1(feet.toString());
          setVal2(Number(inches.toFixed(precision)).toString());
          break;
        }
        case 'lbs':
        case 'inches':
        case 'cm':
        case 'kg':
        default: {
          const precision = getPrecision(type, unit);
          let displayVal = metricValue;
          if (unit === 'lbs') displayVal = kgToLbs(metricValue);
          if (unit === 'inches') displayVal = cmToInches(metricValue);
          setVal1(Number(displayVal.toFixed(precision)).toString());
          break;
        }
      }
    }
  }

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
    const label1 = getLocalizedUnitLabel(unit === 'st_lbs' ? 'st' : 'ft', t);
    const label2 = getLocalizedUnitLabel(unit === 'st_lbs' ? 'lb' : 'in', t);
    const accessibleLabel = (unitLabel: string) =>
      ariaLabel
        ? t('unitInput.valueInUnit', '{{label}}: {{unit}}', {
            label: ariaLabel,
            unit: unitLabel,
          })
        : unitLabel;

    return (
      <div className={`flex items-center gap-2 ${className ?? ''}`}>
        <div className="relative flex-1">
          <Input
            id={`${inputId}-1`}
            type="number"
            inputMode="numeric"
            step="1"
            value={val1}
            onChange={(e) => handleSplitChange(e.target.value, val2)}
            onBlur={handleSplitBlur}
            className={`pe-16 ${inputClassName}`}
            placeholder="0"
            aria-label={accessibleLabel(label1)}
          />
          <span
            className="absolute end-6 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
            aria-hidden="true"
          >
            {label1}
          </span>
        </div>
        <div className="relative flex-1">
          <Input
            id={`${inputId}-2`}
            type="number"
            inputMode="decimal"
            step={
              getPrecision(type, unit) > 0
                ? (1 / Math.pow(10, getPrecision(type, unit))).toString()
                : '1'
            }
            value={val2}
            onChange={(e) => handleSplitChange(val1, e.target.value)}
            onBlur={handleSplitBlur}
            className={`pe-16 ${inputClassName}`}
            placeholder="0"
            aria-label={accessibleLabel(label2)}
          />
          <span
            className="absolute end-6 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
            aria-hidden="true"
          >
            {label2}
          </span>
        </div>
      </div>
    );
  }

  // Render standard single input
  const precision = getPrecision(type, unit);
  const step = precision > 0 ? (1 / Math.pow(10, precision)).toString() : '1';
  const localizedUnit = getLocalizedUnitLabel(unit, t);

  return (
    <div className={`relative ${className}`}>
      <Input
        id={inputId}
        type="number"
        inputMode="decimal"
        step={step}
        value={val1}
        onChange={handleSingleChange}
        onBlur={handleSingleBlur}
        placeholder={placeholder}
        className={`pe-16 ${inputClassName}`}
        aria-label={ariaLabel}
      />
      <span
        className="absolute end-6 top-1/2 -translate-y-1/2 text-sm text-muted-foreground"
        aria-hidden="true"
      >
        {localizedUnit}
      </span>
    </div>
  );
};

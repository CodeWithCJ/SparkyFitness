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
  value: number | string; // Metric base value (kg or cm)
  unit: string; // kg, lbs, st_lbs, cm, inches, ft_in
  type: 'weight' | 'height' | 'measurement';
  onChange: (metricValue: number) => void;
  placeholder?: string;
  className?: string;
}

export const UnitInput: React.FC<UnitInputProps> = ({
  id,
  value,
  unit,
  onChange,
  type,
  placeholder,
  className,
}) => {
  const metricValue =
    typeof value === 'string' ? parseFloat(value) || 0 : value;

  // Local state for split inputs
  const [val1, setVal1] = useState<string>(''); // stones, feet, or single value
  const [val2, setVal2] = useState<string>(''); // lbs or inches

  // Store the last seen values to detect changes and sync state during render
  const [prevMetricValue, setPrevMetricValue] = useState<number | null>(null);
  const [prevUnit, setPrevUnit] = useState<string | null>(null);

  if (metricValue !== prevMetricValue || unit !== prevUnit) {
    setPrevMetricValue(metricValue);
    setPrevUnit(unit);

    if (!metricValue) {
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
    const num = parseFloat(val1) || 0;
    let converted = num;
    if (unit === 'lbs') converted = lbsToKg(num);
    if (unit === 'inches') converted = inchesToCm(num);
    onChange(converted);
  };

  const handleSplitChange = (v1: string, v2: string) => {
    setVal1(v1.replace(/[^0-9]/g, ''));
    setVal2(v2);
  };

  const handleSplitBlur = () => {
    const n1 = parseFloat(val1) || 0;
    const n2 = parseFloat(val2) || 0;
    let converted = 0;
    if (unit === 'st_lbs') converted = stonesLbsToKg(n1, n2);
    else if (unit === 'ft_in') converted = feetInchesToCm(n1, n2);
    onChange(converted);
  };

  // Render two inputs for st_lbs or ft_in
  if (unit === 'st_lbs' || unit === 'ft_in') {
    const label1 = unit === 'st_lbs' ? 'st' : 'ft';
    const label2 = unit === 'st_lbs' ? 'lb' : 'in';

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
            className="pr-8"
            placeholder="0"
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
            className="pr-8"
            placeholder="0"
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

  return (
    <div className={`relative ${className}`}>
      <Input
        id={id}
        type="number"
        step={step}
        value={val1}
        onChange={handleSingleChange}
        onBlur={handleSingleBlur}
        placeholder={placeholder}
        className="pr-9"
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {unit}
      </span>
    </div>
  );
};

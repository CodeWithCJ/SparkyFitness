import type React from 'react';
import BodyFatIcon from './BodyFatIcon';
import HeightIcon from './HeightIcon';
import HipsIcon from './HipsIcon';
import NeckIcon from './NeckIcon';
import StepsIcon from './StepsIcon';
import WaistIcon from './WaistIcon';
import WeightIcon from './WeightIcon';

export {
  BodyFatIcon,
  HeightIcon,
  HipsIcon,
  NeckIcon,
  StepsIcon,
  WaistIcon,
  WeightIcon,
};

export type MeasurementKind =
  | 'weight'
  | 'body_fat_percentage'
  | 'height'
  | 'neck'
  | 'waist'
  | 'hips'
  | 'steps';

export const MeasurementIcons: Record<MeasurementKind, React.ComponentType<{
  size?: number;
  color?: string;
  accentColor?: string;
}>> = {
  weight: WeightIcon,
  body_fat_percentage: BodyFatIcon,
  height: HeightIcon,
  neck: NeckIcon,
  waist: WaistIcon,
  hips: HipsIcon,
  steps: StepsIcon,
};

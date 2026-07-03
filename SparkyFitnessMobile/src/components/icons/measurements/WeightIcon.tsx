import React from 'react';
import Svg, { Line, Rect, Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
  accentColor?: string;
}

const WeightIcon: React.FC<Props> = ({ size = 24, color = '#464b53', accentColor = '#518df1' }) => (
  <Svg width={size} height={size} viewBox="0 0 512 512">
    <Line
      x1="185.03" y1="134" x2="194.43" y2="150.28"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeMiterlimit={10} fill="none"
    />
    <Line
      x1="218.27" y1="119.33" x2="225.84" y2="136.3"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeMiterlimit={10} fill="none"
    />
    <Line
      x1="256.76" y1="114.98" x2="257.16" y2="130.89"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeMiterlimit={10} fill="none"
    />
    <Line
      x1="293.47" y1="119.33" x2="289.57" y2="135.97"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeMiterlimit={10} fill="none"
    />
    <Line
      x1="328.26" y1="135.13" x2="319.5" y2="150.28"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeMiterlimit={10} fill="none"
    />
    <Line
      x1="257.16" y1="207.82" x2="257.16" y2="150.28"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeMiterlimit={10} fill="none"
    />
    <Rect
      x="60.16" y="58.73" width="391.68" height="396.58" rx="63" ry="63"
      stroke={color} strokeWidth={14} strokeMiterlimit={10} fill="none"
    />
    <Path
      d="M153.17,130.89c41.05-41.8,171.13-43.32,209.3-.11,10.32,11.68-30.2,64.21-35.11,73.16-2.58,4.7-8.15,6.94-13.51,7.06-22.75.51-85.51,1.75-109.22.43-6.97-.39-13.42-3.76-17.72-9.25-14.3-18.25-44.81-60.03-33.74-71.29Z"
      stroke={color} strokeWidth={14} strokeMiterlimit={10} fill="none"
    />
  </Svg>
);

export default WeightIcon;

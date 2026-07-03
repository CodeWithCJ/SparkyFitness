import React from 'react';
import Svg, { Line, Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
  accentColor?: string;
}

const WaistIcon: React.FC<Props> = ({ size = 24, color = '#030004', accentColor = '#518df1' }) => (
  <Svg width={size} height={size} viewBox="0 0 512 512">
    <Path
      d="M167.71,304.56s42.65,16.59,88.18,16.21c45.28-.38,83.46-17.2,83.46-17.2"
      stroke={accentColor} strokeWidth={14} strokeLinecap="square" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="322.72" y1="313.89" x2="325.47" y2="333.15"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="189.07" y1="313.89" x2="186.32" y2="333.15"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="291.26" y1="318.36" x2="291.94" y2="341.23"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="220.53" y1="318.36" x2="219.85" y2="341.23"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="255.89" y1="320.77" x2="255.89" y2="343.81"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M385.88,450.81c.86-43.33-22.7-84.94-32.15-114.17-13.16-40.68-9.63-103.85,16.51-145.11"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M125.91,450.81c-.86-43.33,22.7-84.94,32.15-114.17,13.16-40.68,9.63-103.85-16.51-145.11"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M427.66,221.45c-.12-44.2-15.87-87.23-57.77-110.04-26.11-14.21-59.89-19.89-57.43-50.55"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M84.13,221.45c.12-44.2,15.87-87.23,57.77-110.04,26.11-14.21,59.89-19.89,57.43-50.55"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="255.89" y1="398.66" x2="256.08" y2="406.68"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
  </Svg>
);

export default WaistIcon;

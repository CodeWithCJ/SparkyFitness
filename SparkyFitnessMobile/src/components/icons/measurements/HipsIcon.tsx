import React from 'react';
import Svg, { Line, Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
  accentColor?: string;
}

const HipsIcon: React.FC<Props> = ({ size = 24, color = '#000', accentColor = '#518df1' }) => (
  <Svg width={size} height={size} viewBox="0 0 512 512">
    <Line
      x1="373.42" y1="315.46" x2="373.42" y2="345.04"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="138.48" y1="315.46" x2="138.48" y2="345.04"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="326.65" y1="324.4" x2="326.65" y2="353.29"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="185.25" y1="324.4" x2="185.25" y2="353.29"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="279.2" y1="328.53" x2="279.2" y2="354.67"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="232.7" y1="328.53" x2="232.7" y2="354.67"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M409.88,301.24c-39.74,21.77-111.5,26.53-153.93,26.53-42.43,0-114.19-4.76-153.93-26.53"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M356.25,61.14c-8.71,19.72-4.97,70.16,3.21,89.41,31.18,73.36,81.04,168.69,34.39,298.02"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M155.64,61.14c8.71,19.72,4.97,70.16-3.21,89.41-31.18,73.36-81.04,168.69-34.39,298.02"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="255.95" y1="392.17" x2="255.95" y2="450.26"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
  </Svg>
);

export default HipsIcon;

import React from 'react';
import Svg, { Line, Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
  accentColor?: string;
}

const HeightIcon: React.FC<Props> = ({ size = 24, color = '#000', accentColor = '#518df1' }) => (
  <Svg width={size} height={size} viewBox="0 0 512 512">
    <Line
      x1="197.74" y1="205.85" x2="310.93" y2="205.83"
      stroke={accentColor} strokeWidth={14} strokeLinejoin="round" fill="none"
    />
    <Path
      d="M214.33,61.45h80.05c6.38,0,11.56,5.18,11.56,11.56v377.36h-103.16V73.01c0-6.38,5.18-11.56,11.56-11.56Z"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="202.66" y1="283.13" x2="242.09" y2="283.13"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="204.03" y1="245.53" x2="232.46" y2="245.53"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="204.03" y1="166.67" x2="232.46" y2="166.67"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="202.66" y1="127.7" x2="242.09" y2="127.7"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="204.03" y1="320.73" x2="232.46" y2="320.73"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="204.03" y1="361.07" x2="232.46" y2="361.07"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="204.03" y1="401.42" x2="232.46" y2="401.42"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
  </Svg>
);

export default HeightIcon;

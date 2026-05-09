import React from 'react';
import Svg, { Circle, Line, Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
  accentColor?: string;
}

const BodyFatIcon: React.FC<Props> = ({ size = 24, color = '#030004', accentColor = '#518df1' }) => (
  <Svg width={size} height={size} viewBox="0 0 512 512">
    <Circle
      cx="227.11" cy="302.73" r="15.19"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeMiterlimit={10} fill="none"
    />
    <Circle
      cx="285.9" cy="360.9" r="15.19"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeMiterlimit={10} fill="none"
    />
    <Line
      x1="224.1" y1="375.53" x2="289.6" y2="287.67"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeMiterlimit={10} fill="none"
    />
    <Path
      d="M345.84,433.86c-17.74-88.15,18.16-173.13,21.55-212.45"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M420.94,240.22c2.06-60.3,2.49-83.55-63.27-104.32-52.27-16.51-63.67-25.61-61.21-56.27"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M167.17,433.86c17.74-88.15-18.16-173.13-21.55-212.45"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M92.06,240.22c-2.06-60.3-2.49-83.55,63.27-104.32,52.27-16.51,63.67-25.61,61.21-56.27"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
  </Svg>
);

export default BodyFatIcon;

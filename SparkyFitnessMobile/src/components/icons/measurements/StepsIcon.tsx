import React from 'react';
import Svg, { Line, Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

const StepsIcon: React.FC<Props> = ({ size = 24, color = '#000' }) => (
  <Svg width={size} height={size} viewBox="0 0 512 512">
    <Line
      x1="119.53" y1="263.25" x2="198.64" y2="250.93"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M175.43,346.55c40.82-10.55,33.87-63.22,23.59-95.45-2.52-7.91-2.21-20.79.55-28.62,10.78-30.61,13.24-68.23,3.94-100.01-12.47-42.57-59.97-59.02-93.38,4.55-17.44,33.19-8.53,78.07,7.45,128.11,1.62,5.07,2.28,10.4,2.6,15.7,3.08,49.6,25.74,83.33,55.24,75.7Z"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Line
      x1="375.54" y1="376.7" x2="300.2" y2="349.61"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M304.87,447.89c-38.08-18.09-21.27-68.49-5.07-98.19,3.97-7.29,6.11-19.99,4.89-28.2-4.78-32.1-.07-69.51,15.09-98.94,20.31-39.44,70.07-46.58,90.82,22.17,10.84,35.9-6.43,78.28-31.6,124.38-2.55,4.67-4.2,9.78-5.53,14.93-12.42,48.11-41.07,76.94-68.59,63.86Z"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
  </Svg>
);

export default StepsIcon;

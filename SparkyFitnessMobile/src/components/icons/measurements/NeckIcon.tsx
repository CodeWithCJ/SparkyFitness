import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
  accentColor?: string;
}

const NeckIcon: React.FC<Props> = ({ size = 24, color = '#000', accentColor = '#518df1' }) => (
  <Svg width={size} height={size} viewBox="0 0 512 512">
    <Path
      d="M254.93,61.48c54.25,0,114.46,34.39,108.27,129.3,29.21-4.01,10.57,64.28-13.07,72.21-8.88,45.16-55.35,93.48-95.21,93.48s-86.32-48.31-95.21-93.48c-23.64-7.93-42.28-76.23-13.07-72.21-6.19-94.91,54.03-129.3,108.27-129.3Z"
      stroke={color} strokeWidth={14} strokeLinejoin="round" fill="none"
    />
    <Path
      d="M315.23,325.57c-2.49,42.07,3.69,75.43,34.98,90.56,31.29,15.13,45.39,11.35,58.11,34.39"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M194.72,325.57c2.49,42.07-3.69,75.43-34.98,90.56-31.29,15.13-45.39,11.35-58.11,34.39"
      stroke={color} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M191,376.56s31.7,19.39,63.67,19.39,64.28-17.94,64.28-17.94"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M202.18,388.84l-5.28,22.93"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M226.7,394.34l-2.98,23.62"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M255.82,397.44l0.11,25.56"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M282.53,393.2l2.4,24.76"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
    <Path
      d="M306.48,388.27l5.62,24.76"
      stroke={accentColor} strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" fill="none"
    />
  </Svg>
);

export default NeckIcon;

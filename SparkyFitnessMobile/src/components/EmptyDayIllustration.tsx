import React from 'react';
import { View, Text } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

const buildSvg = (main: string, subtle: string, medium: string, accent: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 746.83 359.73" opacity=".9">
  <g opacity=".74">
    <circle fill="${main}" opacity=".77" cx="367.15" cy="168.1" r="168.1"/>
    <circle fill="none" stroke="${main}" stroke-miterlimit="10" stroke-width="14" cx="657.93" cy="174.83" r="81.9"/>
    <circle fill="${main}" cx="141.81" cy="313.53" r="13.79"/>
    <circle fill="${main}" cx="70.73" cy="152.49" r="57.76"/>
    <circle fill="${main}" cx="499.07" cy="21.56" r="19.83"/>
    <circle fill="${main}" cx="501.24" cy="324.63" r="21.55"/>
    <circle fill="${accent}" cx="293.87" cy="278.45" r="12.93"/>
    <circle fill="${medium}" cx="361.59" cy="283.6" r="23.98"/>
  </g>
  <g>
    <path fill="none" stroke="${main}" stroke-miterlimit="10" stroke-linecap="round" stroke-width="10" opacity=".5" d="M5,248.26c27.51-34.39,81.15-77.71,132.73-3.44"/>
    <rect fill="${main}" x="495.37" y="105.34" width="224.59" height="65.19" rx="14.44" ry="14.44" transform="translate(46.6 -133.16) rotate(13)"/>
  </g>
  <g>
    <path fill="${main}" d="M341.87,164.2l-21.83-100.16c-3.64-16.69-19.99-27.38-36.74-24.02l-106.7,21.42c-17.14,3.44-28.14,20.26-24.42,37.34l21.83,100.16c3.64,16.69,19.99,27.38,36.74,24.02l106.7-21.42c17.14-3.44,28.14-20.26,24.42-37.34Z"/>
    <rect fill="${main}" opacity=".69" x="597.85" y="286.15" width="65.52" height="65.52" rx="13.29" ry="13.29" transform="translate(407.82 -351.72) rotate(44.8)"/>
  </g>
</svg>`;

const EmptyDayIllustration: React.FC = () => {
  const [main, subtle, medium, accent] = useCSSVariable([
    '--color-progress-track',
    '--color-border-subtle',
    '--color-border-strong',
    '--color-border-subtle',
  ]) as [string, string, string, string];

  return (
    <View className="bg-surface rounded-xl p-4 mb-2 shadow-sm items-center">
      <SvgXml xml={buildSvg(main, subtle, medium, accent)} width="80%" height={100} />
      <Text className="text-sm text-text-secondary mt-2">No entries recorded for this day</Text>
    </View>
  );
};

export default EmptyDayIllustration;

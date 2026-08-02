import React from 'react';
import Svg, { Rect, Circle, Path, Ellipse } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';
import { useWellnessTokens } from './theme/wellnessTokens';

interface CycleIconProps {
  id: string;
  size?: number;
}

const CycleIcon: React.FC<CycleIconProps> = ({ id, size = 28 }) => {
  const tokens = useWellnessTokens();
  const [textPrimary] = useCSSVariable([
    '--color-text-primary',
  ]) as [string];

  // Glyphs only — the caller's chip/card supplies the background behind them.
  const renderIconContent = () => {
    switch (id) {
      case 'flow-none':
        return <Circle cx="14" cy="14" r="6" fill="none" stroke={tokens.phaseMenstrual} strokeWidth="1.8" />;
      case 'flow-spotting':
        return <Circle cx="14" cy="14" r="4" fill={tokens.phaseMenstrual} />;
      case 'flow-light':
        return (
          <Path
            d="M14 7 C14 7 9.5 13 9.5 16.8 a4.5 4.5 0 0 0 9 0 C18.5 13 14 7 14 7 Z"
            fill={tokens.phaseMenstrual}
            opacity={0.8}
          />
        );
      case 'flow-medium':
        return (
          <>
            <Path
              d="M10.5 8 C10.5 8 7 12.6 7 15.6 a3.5 3.5 0 0 0 7 0 C14 12.6 10.5 8 10.5 8 Z"
              fill={tokens.phaseMenstrual}
            />
            <Path
              d="M18.5 10 C18.5 10 15.5 14 15.5 16.7 a3 3 0 0 0 6 0 C21.5 14 18.5 10 18.5 10 Z"
              fill={tokens.phaseMenstrual}
              opacity={0.8}
            />
          </>
        );
      case 'flow-heavy':
        return (
          <>
            <Path d="M9 7.5 C9 7.5 6 11.6 6 14.2 a3 3 0 0 0 6 0 C12 11.6 9 7.5 9 7.5 Z" fill={tokens.phaseMenstrual} />
            <Path d="M19 7.5 C19 7.5 16 11.6 16 14.2 a3 3 0 0 0 6 0 C22 11.6 19 7.5 19 7.5 Z" fill={tokens.phaseMenstrual} />
            <Path d="M14 13 C14 13 10.5 17.6 10.5 20.4 a3.5 3.5 0 0 0 7 0 C17.5 17.6 14 13 14 13 Z" fill={tokens.phaseMenstrual} />
          </>
        );
      case 'ovulation':
        return (
          <>
            <Circle cx="14" cy="14" r="7.5" fill="none" stroke={tokens.phaseOvulation} strokeWidth="1.8" />
            <Circle cx="14" cy="14" r="3.2" fill={tokens.phaseOvulation} />
          </>
        );
      case 'symptom-cramps':
        return (
          <>
            <Ellipse cx="14" cy="17" rx="8.5" ry="6.5" fill={tokens.phaseMenstrual} opacity={0.4} />
            <Path d="M14.5 8 L10.5 14.5 h3 L11.5 20.5 L17.5 13 h-3 L16.5 8 Z" fill={tokens.phaseMenstrual} />
          </>
        );
      case 'symptom-headache':
        return (
          <>
            <Circle cx="14" cy="15" r="7.5" fill={tokens.phaseLuteal} opacity={0.5} />
            <Path d="M9 8 l1.6 2.6 M14 6.5 l0 3 M19 8 l-1.6 2.6" stroke={tokens.phaseLuteal} strokeWidth="1.8" strokeLinecap="round" />
          </>
        );
      case 'symptom-fatigue':
        return <Path d="M16.5 6.5 a7.5 7.5 0 1 0 5 12.8 a8.6 8.6 0 0 1 -5 -12.8 Z" fill={tokens.categoryAmber} />;
      case 'symptom-nausea':
        return <Path d="M10 8 C10 6.5 12 6.5 12 8 v2.2 C16.8 10.8 20 14 20 17.2 c0 3.4 -2.8 5.3 -6 5.3 c-3.2 0 -6 -1.9 -6 -5.3 c0 -2.6 0.8 -4.6 2 -6 Z" fill={tokens.phaseFollicular} />;
      case 'mood-happy':
        return (
          <>
            <Circle cx="14" cy="14" r="8" fill={tokens.categoryAmber} />
            <Circle cx="11" cy="12.2" r="1.2" fill={textPrimary || '#000000'} />
            <Circle cx="17" cy="12.2" r="1.2" fill={textPrimary || '#000000'} />
            <Path d="M10.5 16 q3.5 3.4 7 0" stroke={textPrimary || '#000000'} strokeWidth="1.7" fill="none" strokeLinecap="round" />
          </>
        );
      case 'mood-calm':
        return (
          <>
            <Circle cx="14" cy="14" r="8" fill={tokens.phaseFollicular} opacity={0.8} />
            <Path d="M9.6 12.6 q1.4 1.4 2.8 0 M15.6 12.6 q1.4 1.4 2.8 0" stroke={textPrimary || '#000000'} strokeWidth="1.5" fill="none" strokeLinecap="round" />
            <Path d="M11.5 16.6 q2.5 1.8 5 0" stroke={textPrimary || '#000000'} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </>
        );
      case 'mood-irritable':
        return (
          <>
            <Circle cx="14" cy="14" r="8" fill={tokens.phaseMenstrual} opacity={0.8} />
            <Path d="M9.5 11 l3 1.4 M18.5 11 l-3 1.4" stroke={textPrimary || '#000000'} strokeWidth="1.6" strokeLinecap="round" />
            <Circle cx="11.4" cy="13.6" r="1.1" fill={textPrimary || '#000000'} />
            <Circle cx="16.6" cy="13.6" r="1.1" fill={textPrimary || '#000000'} />
            <Path d="M11 17.6 q3 -1.6 6 0" stroke={textPrimary || '#000000'} strokeWidth="1.6" fill="none" strokeLinecap="round" />
          </>
        );
      case 'product-pad':
        return (
          <>
            <Rect x="8.5" y="7" width="11" height="14" rx="5.5" fill="none" stroke={tokens.phaseMenstrual} strokeWidth="1.5" />
            <Rect x="12" y="10" width="4" height="8" rx="2" fill={tokens.phaseMenstrual} />
          </>
        );
      case 'product-tampon':
        return (
          <>
            <Rect x="10.5" y="5.5" width="7" height="12.5" rx="3.5" fill="none" stroke={tokens.phaseMenstrual} strokeWidth="1.5" />
            <Path d="M12.5 8.5 h3 M12.5 11 h3 M12.5 13.5 h3" stroke={tokens.phaseMenstrual} strokeWidth="1.3" strokeLinecap="round" />
            <Path d="M14 18 q-1.5 3 0.8 5" stroke={tokens.phaseMenstrual} strokeWidth="1.5" fill="none" strokeLinecap="round" />
          </>
        );
      case 'product-cup':
        return (
          <>
            <Path d="M8.5 7.5 h11 C19.5 13 18 17.5 14 17.5 C10 17.5 8.5 13 8.5 7.5 Z" fill={tokens.phaseMenstrual} opacity={0.8} stroke={tokens.phaseMenstrual} strokeWidth="1.5" strokeLinejoin="round" />
            <Path d="M14 17.5 v3" stroke={tokens.phaseMenstrual} strokeWidth="1.6" strokeLinecap="round" />
            <Circle cx="14" cy="22" r="1.4" fill={tokens.phaseMenstrual} />
          </>
        );
      default:
        return <Circle cx="14" cy="14" r="4" fill={tokens.phaseMenstrual} />;
    }
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 28 28">
      {renderIconContent()}
    </Svg>
  );
};

export default CycleIcon;

import React from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import WatchSymbol from './WatchSymbol';
import {
  COMPLICATION_COLOR_HEX,
  complicationPreview,
  type WatchComplicationDefinition,
} from '../utils/watchComplications';

type PreviewDefinition = Pick<
  WatchComplicationDefinition,
  'source' | 'format' | 'gauge' | 'color' | 'icon'
>;

const CIRCLE_SIZE = 72;
const STROKE = 7;
const TRACK = 'rgba(255,255,255,0.25)';

/** The circular size: a ring with the symbol and value inside, or a plain disc. */
const CircularFace: React.FC<{
  definition: PreviewDefinition;
  text: string;
  progress: number | null;
}> = ({ definition, text, progress }) => {
  const color = COMPLICATION_COLOR_HEX[definition.color];
  const radius = (CIRCLE_SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = progress === null ? 0 : circumference * progress;
  return (
    <View
      testID="complication-preview-circular"
      style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE }}
    >
      {progress === null ? (
        <View
          style={{
            width: CIRCLE_SIZE,
            height: CIRCLE_SIZE,
            borderRadius: CIRCLE_SIZE / 2,
            backgroundColor: 'rgba(255,255,255,0.14)',
          }}
        />
      ) : (
        <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE}>
          <Circle
            cx={CIRCLE_SIZE / 2}
            cy={CIRCLE_SIZE / 2}
            r={radius}
            stroke={TRACK}
            strokeWidth={STROKE}
            fill="none"
          />
          <Circle
            cx={CIRCLE_SIZE / 2}
            cy={CIRCLE_SIZE / 2}
            r={radius}
            stroke={color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${Math.max(1, circumference - dash)}`}
            fill="none"
            transform={`rotate(-90 ${CIRCLE_SIZE / 2} ${CIRCLE_SIZE / 2})`}
          />
        </Svg>
      )}
      <View
        className="absolute inset-0 items-center justify-center"
        pointerEvents="none"
      >
        <WatchSymbol name={definition.icon} size={13} color={color} />
        <Text
          testID="complication-preview-circular-text"
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{
            color: '#FFFFFF',
            fontSize: 15,
            fontWeight: '600',
            maxWidth: CIRCLE_SIZE - 2 * STROKE - 6,
          }}
        >
          {text}
        </Text>
      </View>
    </View>
  );
};

/** The corner size: the symbol, with the value and a bar beside it. */
const CornerFace: React.FC<{
  definition: PreviewDefinition;
  text: string;
  progress: number | null;
}> = ({ definition, text, progress }) => {
  const color = COMPLICATION_COLOR_HEX[definition.color];
  return (
    <View
      testID="complication-preview-corner"
      className="flex-row items-center gap-2"
    >
      <WatchSymbol name={definition.icon} size={26} color={color} />
      <View style={{ width: 64 }}>
        <Text
          testID="complication-preview-corner-text"
          numberOfLines={1}
          style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}
        >
          {text}
        </Text>
        {progress !== null ? (
          <View
            style={{
              height: 4,
              borderRadius: 2,
              marginTop: 3,
              backgroundColor: TRACK,
            }}
          >
            <View
              style={{
                height: 4,
                borderRadius: 2,
                width: `${Math.round(progress * 100)}%`,
                backgroundColor: color,
              }}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
};

/**
 * What a complication would look like in the circular and corner sizes, on a
 * sample day. Approximate on purpose: the watch face decides the final shape
 * (the corner's label really follows the curve of the screen).
 */
const ComplicationPreview: React.FC<{ definition: PreviewDefinition }> = ({
  definition,
}) => {
  const { text, progress } = complicationPreview(definition);
  return (
    <View
      className="flex-row items-center justify-around rounded-2xl py-5"
      style={{ backgroundColor: '#000000' }}
    >
      <CircularFace definition={definition} text={text} progress={progress} />
      <CornerFace definition={definition} text={text} progress={progress} />
    </View>
  );
};

export default ComplicationPreview;

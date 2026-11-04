import React from 'react';
import { useTranslation } from 'react-i18next';
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

/** The rectangular size: the name and symbol, the value, and a bar or a detail line. */
const RectangularFace: React.FC<{
  definition: PreviewDefinition;
  name: string;
  text: string;
  detail: string | null;
  progress: number | null;
}> = ({ definition, name, text, detail, progress }) => {
  const color = COMPLICATION_COLOR_HEX[definition.color];
  return (
    <View
      testID="complication-preview-rectangular"
      style={{
        width: 168,
        borderRadius: 12,
        padding: 10,
        backgroundColor: 'rgba(255,255,255,0.14)',
      }}
    >
      <View className="flex-row items-center gap-1.5">
        <WatchSymbol name={definition.icon} size={14} color={color} />
        <Text
          numberOfLines={1}
          style={{ color, fontSize: 14, fontWeight: '600', flexShrink: 1 }}
        >
          {name}
        </Text>
      </View>
      <Text
        testID="complication-preview-rectangular-text"
        numberOfLines={1}
        style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '600' }}
      >
        {text}
      </Text>
      {progress !== null ? (
        <View
          style={{
            height: 5,
            borderRadius: 3,
            marginTop: 4,
            backgroundColor: TRACK,
          }}
        >
          <View
            style={{
              height: 5,
              borderRadius: 3,
              width: `${Math.round(progress * 100)}%`,
              backgroundColor: color,
            }}
          />
        </View>
      ) : detail ? (
        <Text
          testID="complication-preview-rectangular-detail"
          numberOfLines={1}
          style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 }}
        >
          {detail}
        </Text>
      ) : null}
    </View>
  );
};

/** The inline size: one line with the value first, so a long name is what gets cut. */
const InlineFace: React.FC<{
  definition: PreviewDefinition;
  name: string;
  text: string;
}> = ({ definition, name, text }) => (
  <View
    testID="complication-preview-inline"
    className="flex-row items-center gap-1.5"
  >
    <WatchSymbol
      name={definition.icon}
      size={14}
      color={COMPLICATION_COLOR_HEX[definition.color]}
    />
    <Text
      testID="complication-preview-inline-text"
      numberOfLines={1}
      style={{ color: '#FFFFFF', fontSize: 14 }}
    >
      {`${text} ${name}`}
    </Text>
  </View>
);

/**
 * What a complication would look like in the circular, corner, rectangular and
 * inline sizes, on a sample day. Approximate on purpose: the watch face decides the final shape
 * (the corner's label really follows the curve of the screen).
 */
const ComplicationPreview: React.FC<{
  definition: PreviewDefinition;
  /** The wearer's name for it, shown in the rectangular and inline sizes. */
  name: string;
}> = ({ definition, name }) => {
  const { t } = useTranslation();
  const { text, detail, progress } = complicationPreview(definition, t);
  return (
    <View
      className="rounded-2xl py-5 gap-5 items-center"
      style={{ backgroundColor: '#000000' }}
    >
      <View className="flex-row items-center justify-around self-stretch">
        <CircularFace definition={definition} text={text} progress={progress} />
        <CornerFace definition={definition} text={text} progress={progress} />
      </View>
      <RectangularFace
        definition={definition}
        name={name}
        text={text}
        detail={detail}
        progress={progress}
      />
      <InlineFace definition={definition} name={name} text={text} />
    </View>
  );
};

export default ComplicationPreview;

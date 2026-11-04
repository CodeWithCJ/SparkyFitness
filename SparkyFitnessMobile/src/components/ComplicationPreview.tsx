import React from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import WatchSymbol from './WatchSymbol';
import {
  COMPLICATION_COLOR_HEX,
  complicationItemPreviews,
  type ComplicationItemPreview,
  type WatchComplicationDefinition,
} from '../utils/watchComplications';

type PreviewDefinition = Pick<
  WatchComplicationDefinition,
  'source' | 'format' | 'gauge' | 'color' | 'icon' | 'extras'
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

/** Up to three rings, the first outermost, each filled to its own progress. */
const Rings: React.FC<{ items: ComplicationItemPreview[]; size: number }> = ({
  items,
  size,
}) => {
  const stroke = size * 0.1;
  const step = stroke + size * 0.03;
  return (
    <Svg width={size} height={size}>
      {items.slice(0, 3).map((item, index) => {
        const radius = (size - stroke) / 2 - step * index;
        const circumference = 2 * Math.PI * radius;
        const dash = circumference * (item.progress ?? 0);
        return (
          <React.Fragment key={index}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={TRACK}
              strokeWidth={stroke}
              fill="none"
            />
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={COMPLICATION_COLOR_HEX[item.color]}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${Math.max(1, circumference - dash)}`}
              fill="none"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </React.Fragment>
        );
      })}
    </Svg>
  );
};

/** Each value's text in its own colour, joined with dots, like the Daily Energy corner. */
const ColouredNumbers: React.FC<{
  items: ComplicationItemPreview[];
  testID: string;
}> = ({ items, testID }) => (
  <Text testID={testID} numberOfLines={1} style={{ fontSize: 13 }}>
    {items.map((item, index) => (
      <Text key={index}>
        {index > 0 ? (
          <Text style={{ color: 'rgba(255,255,255,0.5)' }}>{' • '}</Text>
        ) : null}
        <Text
          style={{
            color: COMPLICATION_COLOR_HEX[item.color],
            fontWeight: '600',
          }}
        >
          {item.text}
        </Text>
      </Text>
    ))}
  </Text>
);

/** The circular and corner sizes with several values: concentric rings. */
const MultiRingFaces: React.FC<{ items: ComplicationItemPreview[] }> = ({
  items,
}) => {
  const rings = items.filter((item) => item.progress !== null);
  return (
    <View className="flex-row items-center justify-around self-stretch">
      <View
        testID="complication-preview-circular"
        style={{ width: CIRCLE_SIZE, height: CIRCLE_SIZE }}
      >
        {rings.length > 0 ? (
          <Rings items={rings} size={CIRCLE_SIZE} />
        ) : (
          // No value has a goal, so there is nothing to ring: the numbers stack.
          <View
            className="items-center justify-center"
            style={{
              width: CIRCLE_SIZE,
              height: CIRCLE_SIZE,
              borderRadius: CIRCLE_SIZE / 2,
              backgroundColor: 'rgba(255,255,255,0.14)',
            }}
          >
            {items.slice(0, 3).map((item, index) => (
              <Text
                key={index}
                style={{
                  color: COMPLICATION_COLOR_HEX[item.color],
                  fontSize: 12,
                  fontWeight: '600',
                }}
              >
                {item.text}
              </Text>
            ))}
          </View>
        )}
      </View>
      <View
        testID="complication-preview-corner"
        className="flex-row items-center gap-2"
      >
        {rings.length > 0 ? (
          <Rings items={rings} size={34} />
        ) : (
          <WatchSymbol
            name={items[0].icon}
            size={26}
            color={COMPLICATION_COLOR_HEX[items[0].color]}
          />
        )}
        <View style={{ width: 96 }}>
          <ColouredNumbers
            items={items}
            testID="complication-preview-corner-numbers"
          />
        </View>
      </View>
    </View>
  );
};

/** The rectangular size with several values: a row each. */
const MultiRows: React.FC<{ items: ComplicationItemPreview[] }> = ({
  items,
}) => (
  <View
    testID="complication-preview-rectangular"
    style={{
      width: 168,
      borderRadius: 12,
      padding: 10,
      gap: 4,
      backgroundColor: 'rgba(255,255,255,0.14)',
    }}
  >
    {items.map((item, index) => {
      const color = COMPLICATION_COLOR_HEX[item.color];
      return (
        <View
          key={index}
          testID={`complication-preview-row-${index}`}
          className="flex-row items-center gap-1.5"
        >
          <WatchSymbol name={item.icon} size={12} color={color} />
          <Text
            numberOfLines={1}
            style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}
          >
            {item.text}
          </Text>
          {item.progress !== null ? (
            <View
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                backgroundColor: TRACK,
              }}
            >
              <View
                style={{
                  height: 4,
                  borderRadius: 2,
                  width: `${Math.round(item.progress * 100)}%`,
                  backgroundColor: color,
                }}
              />
            </View>
          ) : item.detail ? (
            <Text
              numberOfLines={1}
              style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11 }}
            >
              {item.detail}
            </Text>
          ) : null}
        </View>
      );
    })}
  </View>
);

/**
 * What a complication would look like in the circular, corner, rectangular and
 * inline sizes, on a sample day. Approximate on purpose: the watch face decides
 * the final shape (the corner's label really follows the curve of the screen).
 * One value draws as before; two or three are shown together, as rings and rows.
 */
const ComplicationPreview: React.FC<{
  definition: PreviewDefinition;
  /** The wearer's name for it, shown in the rectangular and inline sizes. */
  name: string;
}> = ({ definition, name }) => {
  const { t } = useTranslation();
  const items = complicationItemPreviews(definition, t);
  const [first] = items;

  if (items.length > 1) {
    return (
      <View
        className="rounded-2xl py-5 gap-5 items-center"
        style={{ backgroundColor: '#000000' }}
      >
        <MultiRingFaces items={items} />
        <MultiRows items={items} />
        <View
          testID="complication-preview-inline"
          className="flex-row items-center gap-1.5"
        >
          <WatchSymbol
            name={first.icon}
            size={14}
            color={COMPLICATION_COLOR_HEX[first.color]}
          />
          <Text
            testID="complication-preview-inline-text"
            numberOfLines={1}
            style={{ color: '#FFFFFF', fontSize: 14 }}
          >
            {items.map((item) => item.text).join(' · ')}
          </Text>
        </View>
      </View>
    );
  }

  const { text, detail, progress } = first;
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

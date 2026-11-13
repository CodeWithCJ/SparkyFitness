import React, { forwardRef, useMemo } from 'react';
import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Path } from 'react-native-svg';
import type { GpsTrackPoint } from '@workspace/shared';
import { projectRoute } from '../../utils/cardioSession';
import type { Stat } from '../../utils/cardioSessionStats';
import { isLightColor } from '../../utils/shareColor';

export type ActivityShareTemplate = 'classic' | 'route' | 'minimal';

/** Width over height of the card; every template renders at this ratio. */
export const SHARE_CARD_ASPECT = 4 / 5;

// Stats the card has room for, in the order the session screen lists them.
const MAX_STATS = 4;
const REFERENCE_WIDTH = 360;

interface ActivityShareCardProps {
  width: number;
  /** A photo to sit behind the overlay; null leaves the card transparent. */
  photoUri: string | null;
  template: ActivityShareTemplate;
  /** Hex color of the text and route. */
  color: string;
  title: string;
  dateText: string;
  stats: readonly Stat[];
  route: readonly GpsTrackPoint[];
}

interface RouteDrawingProps {
  route: readonly GpsTrackPoint[];
  width: number;
  height: number;
  ink: string;
  inkIsLight: boolean;
  scale: number;
}

/**
 * The track as a line with a soft under-stroke instead of a drop shadow, which
 * react-native-svg does not draw, so it stays readable over a busy photo.
 */
const RouteDrawing: React.FC<RouteDrawingProps> = ({
  route,
  width,
  height,
  ink,
  inkIsLight,
  scale,
}) => {
  const projected = useMemo(
    () => projectRoute(route, width, height, 8 * scale),
    [route, width, height, scale]
  );
  if (!projected) return null;
  const halo = inkIsLight ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.5)';
  return (
    <Svg width={width} height={height}>
      <Path
        d={projected.d}
        stroke={halo}
        strokeWidth={9 * scale}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d={projected.d}
        stroke={ink}
        strokeWidth={5 * scale}
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      <Circle
        cx={projected.end.x}
        cy={projected.end.y}
        r={7 * scale}
        fill="#FC4C02"
        stroke={ink}
        strokeWidth={2.5 * scale}
      />
      <Circle
        cx={projected.start.x}
        cy={projected.start.y}
        r={5 * scale}
        fill={ink}
      />
    </Svg>
  );
};

/**
 * The overlay a workout is shared as: a photo (or nothing, for a transparent
 * PNG) with the route and headline stats drawn over it. Everything is sized
 * from `width`, so the image captured from it is the same at any preview size.
 */
const ActivityShareCard = forwardRef<View, ActivityShareCardProps>(
  (
    { width, photoUri, template, color, title, dateText, stats, route },
    ref
  ) => {
    const scale = width / REFERENCE_WIDTH;
    const height = width / SHARE_CARD_ASPECT;
    const ink = color;
    const inkIsLight = isLightColor(color);
    const shadow = {
      textShadowColor: inkIsLight
        ? 'rgba(0,0,0,0.45)'
        : 'rgba(255,255,255,0.45)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 4 * scale,
    };
    const shown = stats.slice(0, MAX_STATS);
    const [hero, ...rest] = shown;
    const hasRoute = route.length > 1;
    const padding = 20 * scale;

    const statBlock = (stat: Stat, big: boolean) => (
      <View
        key={stat.key}
        style={{ marginRight: 18 * scale, marginBottom: 6 * scale }}
      >
        <Text
          style={[
            shadow,
            {
              color: ink,
              fontSize: (big ? 40 : 20) * scale,
              fontWeight: '800',
            },
          ]}
        >
          {stat.value}
        </Text>
        <Text
          style={[
            shadow,
            {
              color: ink,
              fontSize: 11 * scale,
              fontWeight: '600',
              opacity: 0.9,
            },
          ]}
        >
          {stat.label}
        </Text>
      </View>
    );

    return (
      <View
        ref={ref}
        collapsable={false}
        style={{ width, height, overflow: 'hidden' }}
      >
        {photoUri ? (
          <>
            <Image
              source={{ uri: photoUri }}
              style={{ position: 'absolute', width, height }}
              contentFit="cover"
            />
            {/* A light scrim keeps white stats legible on a bright photo. */}
            {inkIsLight ? (
              <View
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: height * 0.45,
                  backgroundColor: 'rgba(0,0,0,0.28)',
                }}
              />
            ) : null}
          </>
        ) : null}

        {template === 'route' && hasRoute ? (
          <View
            style={{
              position: 'absolute',
              top: padding,
              left: padding,
              right: padding,
              height: height * 0.62,
            }}
          >
            <RouteDrawing
              route={route}
              width={width - padding * 2}
              height={height * 0.62}
              ink={ink}
              inkIsLight={inkIsLight}
              scale={scale}
            />
          </View>
        ) : null}

        {template === 'classic' && hasRoute ? (
          <View style={{ position: 'absolute', top: padding, right: padding }}>
            <RouteDrawing
              route={route}
              width={width * 0.5}
              height={width * 0.5}
              ink={ink}
              inkIsLight={inkIsLight}
              scale={scale}
            />
          </View>
        ) : null}

        <View
          style={{
            position: 'absolute',
            left: padding,
            right: padding,
            bottom: padding,
          }}
        >
          <Text
            numberOfLines={1}
            style={[
              shadow,
              {
                color: ink,
                fontSize: 15 * scale,
                fontWeight: '700',
                marginBottom: 2 * scale,
              },
            ]}
          >
            {title}
          </Text>
          <Text
            numberOfLines={1}
            style={[
              shadow,
              {
                color: ink,
                fontSize: 11 * scale,
                opacity: 0.9,
                marginBottom: 10 * scale,
              },
            ]}
          >
            {dateText}
          </Text>
          {template === 'classic' ? (
            <>
              {hero ? statBlock(hero, true) : null}
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  marginTop: 8 * scale,
                }}
              >
                {rest.map((stat) => statBlock(stat, false))}
              </View>
            </>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {shown.map((stat) => statBlock(stat, false))}
            </View>
          )}
        </View>
      </View>
    );
  }
);
ActivityShareCard.displayName = 'ActivityShareCard';

export default ActivityShareCard;

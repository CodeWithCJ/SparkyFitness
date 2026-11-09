import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Image,
  PanResponder,
  PixelRatio,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import Icon from './Icon';
import {
  adjustLabelCrop,
  type LabelCrop,
  type LabelCropHandle,
} from '../utils/labelCrop';

const CONTROL_SIZE = 44;
// Corner targets extend half their size past the image. Keep the move target clear.
const MOVE_CONTROL_GAP = CONTROL_SIZE / 2 + 8;
const MOVE_CONTROL_SPACE = MOVE_CONTROL_GAP + CONTROL_SIZE;

interface Props {
  photo: { uri: string; width: number; height: number };
  crop: LabelCrop;
  onCropChange: (crop: LabelCrop) => void;
}

interface CropControlProps {
  handle: LabelCropHandle;
  label: string;
  crop: LabelCrop;
  imageWidth: number;
  imageHeight: number;
  onCropChange: Props['onCropChange'];
  style: StyleProp<ViewStyle>;
  children?: ReactNode;
}

function CropControl({
  handle,
  label,
  crop,
  imageWidth,
  imageHeight,
  onCropChange,
  style,
  children,
}: CropControlProps) {
  const { t } = useTranslation();
  const currentCrop = useRef(crop);
  const dragStart = useRef(crop);
  useEffect(() => {
    currentCrop.current = crop;
  }, [crop]);
  const responder = useMemo(
    () =>
      // PanResponder stores these callbacks; ref reads occur only on touch events.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStart.current = currentCrop.current;
        },
        onPanResponderMove: (_event, gesture) => {
          onCropChange(
            adjustLabelCrop(
              dragStart.current,
              handle,
              gesture.dx / imageWidth,
              gesture.dy / imageHeight
            )
          );
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [handle, imageWidth, imageHeight, onCropChange]
  );

  return (
    <View
      {...responder.panHandlers}
      style={style}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityActions={[
        { name: 'increment' },
        { name: 'decrement' },
        {
          name: 'left',
          label: t('foodScan.label.cropLeft', { defaultValue: 'Move left' }),
        },
        {
          name: 'right',
          label: t('foodScan.label.cropRight', { defaultValue: 'Move right' }),
        },
        {
          name: 'up',
          label: t('foodScan.label.cropUp', { defaultValue: 'Move up' }),
        },
        {
          name: 'down',
          label: t('foodScan.label.cropDown', { defaultValue: 'Move down' }),
        },
      ]}
      onAccessibilityAction={({ nativeEvent: { actionName } }) => {
        const dx =
          actionName === 'left' || actionName === 'decrement'
            ? -0.05
            : actionName === 'right' || actionName === 'increment'
              ? 0.05
              : 0;
        const dy =
          actionName === 'up' ? -0.05 : actionName === 'down' ? 0.05 : 0;
        onCropChange(adjustLabelCrop(crop, handle, dx, dy));
      }}
    >
      {handle !== 'move' ? (
        <View pointerEvents="none" style={styles.knob} />
      ) : null}
      {children}
    </View>
  );
}

export default function LabelPhotoCropper({
  photo,
  crop,
  onCropChange,
}: Props) {
  const { t } = useTranslation();
  const [layout, setLayout] = useState({ width: 0, height: 0 });
  // Keep the image size stable when a small crop needs the separate move target.
  const scale = Math.min(
    Math.max(0, layout.width - 48) / photo.width,
    Math.max(0, layout.height - 48 - MOVE_CONTROL_SPACE) / photo.height
  );
  const width = photo.width * scale;
  const height = photo.height * scale;
  const left = crop.x * width;
  const top = crop.y * height;
  const selectionWidth = crop.width * width;
  const selectionHeight = crop.height * height;
  const right = left + selectionWidth;
  const bottom = top + selectionHeight;
  // Rounded edges can erase a subpixel gap between the corner hit targets.
  const moveThreshold = CONTROL_SIZE + 1 / PixelRatio.get();
  const separateMove =
    selectionWidth <= moveThreshold && selectionHeight <= moveThreshold;
  const moveLabel = t('foodScan.label.cropMove', {
    defaultValue: 'Move label crop',
  });
  const handles: {
    handle: LabelCropHandle;
    label: string;
    x: number;
    y: number;
  }[] = [
    {
      handle: 'top-left',
      label: t('foodScan.label.cropTopLeft', {
        defaultValue: 'Top left crop handle',
      }),
      x: left,
      y: top,
    },
    {
      handle: 'top-right',
      label: t('foodScan.label.cropTopRight', {
        defaultValue: 'Top right crop handle',
      }),
      x: right,
      y: top,
    },
    {
      handle: 'bottom-left',
      label: t('foodScan.label.cropBottomLeft', {
        defaultValue: 'Bottom left crop handle',
      }),
      x: left,
      y: bottom,
    },
    {
      handle: 'bottom-right',
      label: t('foodScan.label.cropBottomRight', {
        defaultValue: 'Bottom right crop handle',
      }),
      x: right,
      y: bottom,
    },
  ];

  return (
    <View
      testID="label-photo-cropper"
      style={styles.container}
      onLayout={({ nativeEvent }) => setLayout(nativeEvent.layout)}
    >
      {scale > 0 ? (
        <>
          <View testID="label-crop-image-frame" style={{ width, height }}>
            <Image
              source={{ uri: photo.uri }}
              style={StyleSheet.absoluteFill}
              resizeMode="contain"
              accessibilityLabel={t('foodScan.label.cropPhoto', {
                defaultValue: 'Nutrition label photo',
              })}
            />
            <View
              pointerEvents="none"
              style={[styles.shade, { left: 0, top: 0, width, height: top }]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.shade,
                { left: 0, top, width: left, height: selectionHeight },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.shade,
                {
                  left: right,
                  top,
                  width: width - right,
                  height: selectionHeight,
                },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.shade,
                { left: 0, top: bottom, width, height: height - bottom },
              ]}
            />
            <View
              pointerEvents="none"
              style={[
                styles.selection,
                { left, top, width: selectionWidth, height: selectionHeight },
              ]}
            />
            {!separateMove ? (
              <CropControl
                handle="move"
                label={moveLabel}
                crop={crop}
                imageWidth={width}
                imageHeight={height}
                onCropChange={onCropChange}
                style={{
                  position: 'absolute',
                  left,
                  top,
                  width: selectionWidth,
                  height: selectionHeight,
                }}
              />
            ) : null}
            {handles.map(({ handle, label, x, y }) => (
              <CropControl
                key={handle}
                handle={handle}
                label={label}
                crop={crop}
                imageWidth={width}
                imageHeight={height}
                onCropChange={onCropChange}
                style={[
                  styles.handle,
                  { left: x - CONTROL_SIZE / 2, top: y - CONTROL_SIZE / 2 },
                ]}
              />
            ))}
          </View>
          <View testID="label-crop-move-area" style={styles.moveArea}>
            {separateMove ? (
              <CropControl
                handle="move"
                label={moveLabel}
                crop={crop}
                imageWidth={width}
                imageHeight={height}
                onCropChange={onCropChange}
                style={styles.moveHandle}
              >
                <Icon name="move" size={24} color="#fff" />
              </CropControl>
            ) : null}
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  shade: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.6)' },
  selection: { position: 'absolute', borderColor: '#fff', borderWidth: 2 },
  moveArea: { height: CONTROL_SIZE, marginTop: MOVE_CONTROL_GAP },
  moveHandle: {
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#fff',
    borderWidth: 1,
    borderRadius: CONTROL_SIZE / 2,
  },
  handle: {
    position: 'absolute',
    width: CONTROL_SIZE,
    height: CONTROL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  knob: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderColor: '#222',
    borderWidth: 2,
  },
});

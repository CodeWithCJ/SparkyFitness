import React, { useRef, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Toast from 'react-native-toast-message';
import SafeImage from './SafeImage';
import Icon from './Icon';
import { useFoodImageSourceContext } from './FoodImageSourceProvider';
import { pickImageFromCamera, pickImagesFromLibrary } from '../utils/pickImage';
import {
  MAX_IMAGES,
  toNewImage,
  setAsMain,
  removeImageAt,
  pickerImageKey,
  type PickerImage,
} from '../utils/pickerImages';
import { addLog } from '../services/LogService';

const TILE = 72;

interface FoodImagePickerProps {
  items: PickerImage[];
  onItemsChange: (items: PickerImage[]) => void;
  label?: string;
  /** Copy shown under the tiles; callers explain per-entry override semantics. */
  helpText?: string;
  maxImages?: number;
  disabled?: boolean;
}

/**
 * Multi-image picker for foods, meals, and diary entries.
 *
 * Ordering is expressed by "Set as main" rather than drag-to-reorder: index 0
 * is the thumbnail, and promoting an image is the only reordering that changes
 * anything a user can see. Dragging tiles inside a scrolling form is
 * substantially more machinery for the same outcome.
 */
const FoodImagePicker: React.FC<FoodImagePickerProps> = ({
  items,
  onItemsChange,
  label = 'Photos',
  helpText,
  maxImages = MAX_IMAGES,
  disabled = false,
}) => {
  const getImageSource = useFoodImageSourceContext();
  const [textMuted, borderSubtle] = useCSSVariable([
    '--color-text-muted',
    '--color-border-subtle',
  ]) as [string, string];

  // Guards against a double-tap opening two system pickers, which on Android
  // leaves the second one orphaned. Mirrors FoodPhotoImproveScreen.
  const pickerLock = useRef(false);
  const [busy, setBusy] = useState(false);

  const remaining = Math.max(0, maxImages - items.length);
  const canAdd = !disabled && remaining > 0;

  const runPick = async (pick: () => Promise<{ uri: string }[]>) => {
    if (pickerLock.current) return;
    pickerLock.current = true;
    setBusy(true);
    try {
      const picked = await pick();
      if (picked.length === 0) return;
      onItemsChange([
        ...items,
        ...picked.slice(0, remaining).map((image) => toNewImage(image.uri)),
      ]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[Food Image Picker] Picking failed: ${message}`, 'ERROR');
      Toast.show({ type: 'error', text1: 'Could not add photo' });
    } finally {
      pickerLock.current = false;
      setBusy(false);
    }
  };

  const addFromCamera = () =>
    runPick(async () => {
      const result = await pickImageFromCamera();
      if (result.status === 'denied') {
        // A denial is a dead end until the user changes Settings, so say so
        // rather than letting the tap look like it did nothing.
        Toast.show({
          type: 'error',
          text1: 'Camera permission needed',
          text2: 'Enable camera access to add a photo.',
        });
        return [];
      }
      return result.status === 'ok' ? [result.image] : [];
    });

  const addFromLibrary = () => runPick(() => pickImagesFromLibrary(remaining));

  const promptAdd = () => {
    Alert.alert('Add photo', undefined, [
      { text: 'Take Photo', onPress: () => void addFromCamera() },
      { text: 'Choose from Library', onPress: () => void addFromLibrary() },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const promptTileActions = (index: number) => {
    if (disabled) return;
    const buttons: {
      text: string;
      style?: 'cancel' | 'destructive';
      onPress?: () => void;
    }[] = [];
    if (index > 0) {
      buttons.push({
        text: 'Set as main',
        onPress: () => onItemsChange(setAsMain(items, index)),
      });
    }
    buttons.push({
      text: 'Remove',
      style: 'destructive',
      onPress: () => onItemsChange(removeImageAt(items, index)),
    });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Photo', undefined, buttons);
  };

  return (
    <View>
      <Text className="text-text-secondary text-sm font-medium mb-2">
        {label}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8 }}
        keyboardShouldPersistTaps="handled"
      >
        {items.map((item, index) => (
          <Pressable
            key={pickerImageKey(item)}
            onPress={() => promptTileActions(index)}
            disabled={disabled}
            testID={`food-image-tile-${index}`}
            accessibilityLabel={
              index === 0 ? 'Main photo, edit' : `Photo ${index + 1}, edit`
            }
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
          >
            <SafeImage
              source={
                item.kind === 'saved'
                  ? getImageSource(item.path)
                  : { uri: item.uri, headers: {} }
              }
              style={{ width: TILE, height: TILE, borderRadius: 8 }}
              contentFit="cover"
            />
            {index === 0 && items.length > 1 ? (
              <View className="absolute bottom-0 left-0 right-0 bg-black/60 rounded-b-lg py-0.5">
                <Text className="text-white text-[10px] text-center font-medium">
                  Main
                </Text>
              </View>
            ) : null}
          </Pressable>
        ))}

        {canAdd ? (
          <Pressable
            onPress={promptAdd}
            disabled={busy}
            testID="food-image-add"
            accessibilityLabel="Add photo"
            className="items-center justify-center bg-raised"
            style={{
              width: TILE,
              height: TILE,
              borderRadius: 8,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: borderSubtle,
              opacity: busy ? 0.5 : 1,
            }}
          >
            <Icon name="add" size={24} color={textMuted} />
          </Pressable>
        ) : null}
      </ScrollView>
      {helpText ? (
        <Text className="text-text-muted text-xs mt-2">{helpText}</Text>
      ) : null}
    </View>
  );
};

export default FoodImagePicker;

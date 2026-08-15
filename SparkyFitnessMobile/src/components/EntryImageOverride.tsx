import React, { useState } from 'react';
import { View, Text } from 'react-native';
import FoodImagePicker from './FoodImagePicker';
import FoodThumbnail from './FoodThumbnail';
import { useFoodImageSourceContext } from './FoodImageSourceProvider';
import {
  pickerImagesDiffer,
  toSavedImages,
  type PickerImage,
} from '../utils/pickerImages';
import { usableFoodImages } from '../utils/foodImages';

interface EntryImageOverrideProps {
  /** The entry's own override photos. */
  images: string[] | null | undefined;
  /** The parent food's or meal's photos, shown when there is no override. */
  inheritedImages: string[] | null | undefined;
  onSave: (items: PickerImage[]) => void;
  onClear: () => void;
  isPending?: boolean;
}

/**
 * Per-entry photo control for the diary.
 *
 * With no override, the parent food's photos are shown dimmed and read-only —
 * the entry really is displaying them, and presenting them as editable would
 * imply that changing one here edits the food itself. It does not: the server
 * never writes an entry override back to the parent.
 */
const EntryImageOverride: React.FC<EntryImageOverrideProps> = ({
  images,
  inheritedImages,
  onSave,
  onClear,
  isPending = false,
}) => {
  const getImageSource = useFoodImageSourceContext();
  const [items, setItems] = useState<PickerImage[]>(() => toSavedImages(images));

  // Re-seed when the saved override changes underneath (after a save settles,
  // or when the screen is reused for a different entry). Synced during render
  // rather than in an effect so the tiles never show a stale frame first.
  const savedKey = (images ?? []).join('|');
  const [seededKey, setSeededKey] = useState(savedKey);
  if (seededKey !== savedKey) {
    setSeededKey(savedKey);
    setItems(toSavedImages(images));
  }

  const hasOverride = usableFoodImages(images).length > 0;
  const inherited = usableFoodImages(inheritedImages);

  const handleChange = (next: PickerImage[]) => {
    setItems(next);
    if (!pickerImagesDiffer(next, images)) return;
    if (next.length === 0) {
      onClear();
      return;
    }
    onSave(next);
  };

  if (!hasOverride && inherited.length > 0) {
    return (
      <View>
        <Text className="text-text-secondary text-sm font-medium mb-2">
          Photo
        </Text>
        <View className="flex-row gap-2" style={{ opacity: 0.6 }}>
          {inherited.slice(0, 4).map((image) => (
            <FoodThumbnail
              key={image}
              image={image}
              getImageSource={getImageSource}
              size={56}
            />
          ))}
        </View>
        <View className="mt-3">
          <FoodImagePicker
            items={items}
            onItemsChange={handleChange}
            label=""
            helpText="Add a photo to set one for this entry."
            disabled={isPending}
          />
        </View>
      </View>
    );
  }

  return (
    <FoodImagePicker
      items={items}
      onItemsChange={handleChange}
      label="Photo"
      helpText={hasOverride ? 'This photo applies to this entry only.' : undefined}
      disabled={isPending}
    />
  );
};

export default EntryImageOverride;

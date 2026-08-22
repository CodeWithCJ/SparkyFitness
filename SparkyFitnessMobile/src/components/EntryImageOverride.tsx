import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  /**
   * False for a non-owner viewing a shared entry: the photos still render, but
   * every add/remove action is withheld. The server rejects the write with a
   * 403 anyway, so offering the control would only produce a failed save.
   */
  canEdit?: boolean;
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
  canEdit = true,
}) => {
  const { t } = useTranslation();
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

  // `items` is updated optimistically so the picked photo shows while the
  // upload runs. If the write fails, `images` never changes and the re-seed
  // above never fires, leaving `items` holding a change that was never
  // persisted — a later save would then send that list as the complete set and
  // delete images the server still has. So when a mutation settles and the
  // saved images did not move, treat it as a failure and drop the optimistic
  // state. Synced during render for the same reason as the re-seed above.
  const [wasPending, setWasPending] = useState(isPending);
  if (wasPending !== isPending) {
    setWasPending(isPending);
    if (
      !isPending &&
      seededKey === savedKey &&
      pickerImagesDiffer(items, images)
    ) {
      setItems(toSavedImages(images));
    }
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

  if (!canEdit) {
    const shown = hasOverride ? usableFoodImages(images) : inherited;
    if (shown.length === 0) return null;
    return (
      <View>
        <Text className="text-text-secondary text-sm font-medium mb-2">
          {t('entryImage.photo', { defaultValue: 'Photo' })}
        </Text>
        <View className="flex-row gap-2">
          {shown.slice(0, 4).map((image) => (
            <FoodThumbnail
              key={image}
              image={image}
              getImageSource={getImageSource}
              size={56}
            />
          ))}
        </View>
      </View>
    );
  }

  if (!hasOverride && inherited.length > 0) {
    return (
      <View>
        <Text className="text-text-secondary text-sm font-medium mb-2">
          {t('entryImage.photo', { defaultValue: 'Photo' })}
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
            helpText={t('entryImage.addHelp', { defaultValue: 'Add a photo to set one for this entry.' })}
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
      label={t('entryImage.photo', { defaultValue: 'Photo' })}
      helpText={hasOverride ? t('entryImage.entryOnly', { defaultValue: 'This photo applies to this entry only.' }) : undefined}
      disabled={isPending}
    />
  );
};

export default EntryImageOverride;

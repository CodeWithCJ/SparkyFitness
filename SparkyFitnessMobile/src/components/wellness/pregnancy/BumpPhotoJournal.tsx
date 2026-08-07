import React, { useRef, useState } from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import { usePregnancyPhotos, usePregnancyPhotoMutations } from '../../../hooks/usePregnancyPhotos';
import { useServerConfigs } from '../../../hooks/useServerConfigs';
import { normalizeUrl } from '../../../services/api/apiClient';
import { getApiErrorMessage } from '../../../services/api/errors';
import { formatDate } from '../../../utils/dateUtils';
import ActionSheet, { type ActionSheetRef } from '../../ActionSheet';
import Icon from '../../Icon';
import type { BumpPhoto } from '../../../types/womensHealth';

interface BumpPhotoJournalProps {
  pregnancyId: string;
  currentWeek: number;
}

const BumpPhotoJournal: React.FC<BumpPhotoJournalProps> = ({ pregnancyId, currentWeek }) => {
  const { photos, isLoading } = usePregnancyPhotos(pregnancyId);
  const { uploadAsync, isUploading, deleteAsync } = usePregnancyPhotoMutations();
  const { activeConfig } = useServerConfigs();
  const { t } = useTranslation();
  const [accentColor, dangerColor, textMuted] = useCSSVariable([
    '--color-accent-primary',
    '--color-icon-danger',
    '--color-text-muted',
  ]) as [string, string, string];

  const actionSheetRef = useRef<ActionSheetRef>(null);
  const pickerLock = useRef(false);
  const [selectedPhoto, setSelectedPhoto] = useState<BumpPhoto | null>(null);

  const baseUrl = activeConfig ? normalizeUrl(activeConfig.url) : null;
  const photoUri = (filePath: string) => (baseUrl ? `${baseUrl}/${filePath}` : undefined);

  const pickAndUpload = async (source: 'camera' | 'library') => {
    if (pickerLock.current) return;
    pickerLock.current = true;
    try {
      let result: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
           Toast.show({ type: 'error', text1: t('mobileComponents.wellness.photos.cameraPermission') });
          return;
        }
        result = await ImagePicker.launchCameraAsync({ mediaTypes: 'images', quality: 0.7 });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images',
          quality: 0.7,
          allowsMultipleSelection: false,
        });
      }
      if (result.canceled) return;
      const uri = result.assets?.[0]?.uri;
      if (!uri) {
         Toast.show({ type: 'error', text1: t('mobileComponents.wellness.photos.noPhoto') });
        return;
      }
      await uploadAsync({ pregnancyId, week: currentWeek, uri });
       Toast.show({ type: 'success', text1: t('mobileComponents.wellness.photos.added') });
     } catch (err) {
       Toast.show({ type: 'error', text1: t('mobileComponents.wellness.photos.uploadError') });
       Toast.show({ type: 'error', text1: t('mobileComponents.wellness.photos.uploadError'), text2: getApiErrorMessage(err) ?? undefined });
    } finally {
      pickerLock.current = false;
    }
  };

  const handleDelete = async (photo: BumpPhoto) => {
    try {
      await deleteAsync(photo.id);
      setSelectedPhoto(null);
    } catch {
       Toast.show({ type: 'error', text1: t('mobileComponents.wellness.photos.removeError') });
    }
  };

  return (
    <View className="bg-surface rounded-xl p-4 shadow-sm gap-3">
      <View className="flex-row items-center justify-between">
         <Text className="text-text-primary text-base font-bold">{t('mobileComponents.wellness.photos.title')}</Text>
        <TouchableOpacity
          disabled={isUploading}
          onPress={() => actionSheetRef.current?.present()}
          hitSlop={8}
          className="flex-row items-center"
        >
          {isUploading ? (
            <ActivityIndicator size="small" color={accentColor} />
          ) : (
            <>
              <Icon name="add" size={16} color={accentColor} />
              <Text className="text-xs font-semibold" style={{ color: accentColor }}>
                 {t('mobileComponents.wellness.photos.add')}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={accentColor} />
      ) : photos.length === 0 ? (
        <Text className="text-text-secondary text-xs italic py-2">
           {t('mobileComponents.wellness.photos.empty')}
        </Text>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-3">
            {photos.map((photo) => (
              <TouchableOpacity
                key={photo.id}
                onPress={() => setSelectedPhoto(selectedPhoto?.id === photo.id ? null : photo)}
                className="items-center"
              >
                <Image
                  source={{ uri: photoUri(photo.file_path) }}
                  className="w-24 h-24 rounded-xl bg-raised"
                  resizeMode="cover"
                />
                 <Text className="text-text-secondary text-xs mt-1">{t('mobileComponents.wellness.photos.week', { week: photo.week })}</Text>
                {selectedPhoto?.id === photo.id && (
                  <TouchableOpacity
                    onPress={() => handleDelete(photo)}
                    hitSlop={8}
                    className="mt-1 flex-row items-center gap-1"
                  >
                    <Icon name="trash" size={14} color={dangerColor} />
                    <Text className="text-xs" style={{ color: dangerColor }}>
                       {t('mobileComponents.wellness.photos.remove')}
                    </Text>
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {selectedPhoto?.entry_date && (
        <Text className="text-text-secondary text-xs" style={{ color: textMuted }}>
           {t('mobileComponents.wellness.photos.taken', { date: formatDate(selectedPhoto.entry_date) })}
        </Text>
      )}

      <ActionSheet
        ref={actionSheetRef}
         title={t('mobileComponents.wellness.photos.addTitle')}
        items={[
           { key: 'camera', label: t('mobileComponents.wellness.photos.take'), onPress: () => pickAndUpload('camera') },
           { key: 'library', label: t('mobileComponents.wellness.photos.library'), onPress: () => pickAndUpload('library') },
        ]}
      />
    </View>
  );
};

export default BumpPhotoJournal;

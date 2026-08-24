import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  ActivityIndicator,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Modal,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useQueryClient } from '@tanstack/react-query';
import { useCSSVariable } from 'uniwind';
import Button from '../components/ui/Button';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { FoodPhotoFlowScreenProps, RootStackParamList } from '../types/navigation';
import { useEstimateFoodPhoto } from '../hooks/useEstimateFoodPhoto';
import { useHeaderActionColors } from '../hooks/useHeaderActionColors';
import { activeAiServiceSettingQueryKey } from '../hooks/queryKeys';
import { addLog } from '../services/LogService';
import { parseDecimalInput, DECIMAL_INPUT_REGEX } from '../utils/numericInput';
import { mapEstimateError } from '../utils/foodPhotoEstimate';

type Props = FoodPhotoFlowScreenProps<'Improve'>;

const DESCRIPTION_MAX = 500;

// Client-side cap on images per estimate. Mirrors the server default
// (AI_PHOTO_ESTIMATE_MAX_IMAGES); the server is the source of truth and will
// reject anything above its own configured limit.
const MAX_IMAGES = 6;

type StagedImage = { uri: string; mimeType?: string };

const SUPPORTED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

// Prefer the mime type the picker reports; fall back to the URI extension, then
// JPEG. Avoids mislabelling PNG/WebP/HEIC library picks as JPEG.
function resolveMimeType(img: StagedImage): string {
  // Normalize the non-standard image/jpg up front so it is never emitted: the
  // server allow-list only has image/jpeg and would reject image/jpg at the
  // route before the service's normalization runs.
  const mime = img.mimeType === 'image/jpg' ? 'image/jpeg' : img.mimeType;
  if (mime && SUPPORTED_MIME_TYPES.has(mime)) {
    return mime;
  }
  const ext = img.uri.split('?')[0].split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'heic':
      return 'image/heic';
    case 'heif':
      return 'image/heif';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    default:
      // Unknown extension: prefer the picker's reported type so an unsupported
      // format (e.g. image/gif) reaches the server and gets a clean
      // UNSUPPORTED_MIME_TYPE rejection instead of being mislabelled as JPEG.
      return mime || 'image/jpeg';
  }
}

const FADE_IN_MS = 200;
const FADE_OUT_MS = 150;

function pendingMessageFor(
  elapsedSec: number,
  imageCount: number,
  messages: readonly [string, string, string, string, string, string],
): string {
  const [readingPhoto, readingPhotos, identifyingIngredients, estimatingPortions, calculatingNutrition, almostThere] = messages;
  let current = readingPhoto;
  if (elapsedSec >= 6) current = identifyingIngredients;
  if (elapsedSec >= 15) current = estimatingPortions;
  if (elapsedSec >= 28) current = calculatingNutrition;
  if (elapsedSec >= 45) current = almostThere;
  return imageCount > 1 && elapsedSec < 6 ? readingPhotos : current;
}

const FoodPhotoImproveScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [accentPrimary, textPrimary, dangerColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-primary',
    '--color-text-danger-subtle',
  ]) as [string, string, string];
  const { backColor } = useHeaderActionColors();

  const { date, photo } = route.params;
  const mealTypeId = route.params.mealTypeId;

  // The scan screen hands off a single photo; the user composes the rest of the
  // image set here. Seeded from the handoff photo.
  // `photo` is a required nav param, but guard against a restored/deep-linked
  // route that arrives without it so the thumbnail map can't hit undefined.
  const [images, setImages] = useState<StagedImage[]>(photo ? [photo] : []);
  const [sheetVisible, setSheetVisible] = useState(false);
  const pickerLock = useRef(false);

  const [totalWeight, setTotalWeight] = useState<string>(
    route.params.initialTotalWeight ?? '',
  );
  const [weightUnit, setWeightUnit] = useState<'g' | 'oz'>(
    route.params.initialWeightUnit ?? 'g',
  );
  const [description, setDescription] = useState<string>(
    route.params.initialDescription ?? '',
  );

  const mutation = useEstimateFoodPhoto();

  const weightUnits: Segment<'g' | 'oz'>[] = [
    { key: 'g', label: t('foodPhotoImprove.grams', { defaultValue: 'grams' }) },
    { key: 'oz', label: t('foodPhotoImprove.ounces', { defaultValue: 'ounces' }) },
  ];

  const cancelledRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    if (!mutation.isPending) return;
    setElapsedSec(0);
    const startedAt = Date.now();
    const id = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [mutation.isPending]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleWeightChange = (text: string) => {
    if (text === '' || DECIMAL_INPUT_REGEX.test(text)) {
      setTotalWeight(text);
    }
  };

  const atImageCap = images.length >= MAX_IMAGES;

  const appendImage = (uri: string, mimeType?: string) => {
    // HEIC/HEIF support depends on the *vision* provider, which the mobile app
    // does not fetch. Gating on the active *text* provider's type is wrong once
    // vision can differ, so the server-side guard owns format rejection (it
    // returns UNSUPPORTED_MIME_TYPE, surfaced as "Unexpected image format").
    setImages((prev) =>
      prev.length >= MAX_IMAGES ? prev : [...prev, { uri, mimeType }],
    );
  };

  const removeImage = (index: number) => {
    const next = images.filter((_, i) => i !== index);
    setImages(next);
    // Removing the last image is equivalent to abandoning the flow. Kept out of
    // the state updater so the updater stays pure (no navigation side-effects).
    if (next.length === 0) {
      navigation
        .getParent<NativeStackNavigationProp<RootStackParamList>>()
        ?.replace('FoodScan', { date, initialMode: 'photo', mealTypeId: mealTypeId ?? undefined });
    }
  };

  const addFromCamera = async () => {
    setSheetVisible(false);
    if (pickerLock.current) return;
    pickerLock.current = true;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Toast.show({
          type: 'error',
          text1: t('foodPhotoImprove.cameraPermissionNeeded', { defaultValue: 'Camera permission needed' }),
          text2: t('foodPhotoImprove.cameraPermissionMessage', { defaultValue: 'Enable camera access to add a photo.' }),
        });
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        quality: 0.7,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (asset?.uri) appendImage(asset.uri, asset.mimeType);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[Food Photo Improve] Camera capture failed: ${message}`, 'ERROR');
      Toast.show({ type: 'error', text1: t('foodPhotoImprove.takePhotoFailed', { defaultValue: 'Could not take photo' }) });
    } finally {
      pickerLock.current = false;
    }
  };

  const addFromLibrary = async () => {
    setSheetVisible(false);
    if (pickerLock.current) return;
    pickerLock.current = true;
    try {
      const remaining = MAX_IMAGES - images.length;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 0.7,
        allowsMultipleSelection: true,
        selectionLimit: Math.max(1, remaining),
      });
      if (result.canceled) return;
      for (const asset of result.assets ?? []) {
        if (asset?.uri) appendImage(asset.uri, asset.mimeType);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[Food Photo Improve] Library pick failed: ${message}`, 'ERROR');
      Toast.show({ type: 'error', text1: t('foodPhotoImprove.loadPhotoFailed', { defaultValue: 'Could not load photo' }) });
    } finally {
      pickerLock.current = false;
    }
  };

  const trimmedDescription = description.trim();
  const descriptionTooLong = description.length > DESCRIPTION_MAX;

  const parsedWeight = useMemo(() => {
    if (totalWeight.trim() === '') return null;
    const value = parseDecimalInput(totalWeight);
    if (!Number.isFinite(value) || value <= 0) return NaN;
    return value;
  }, [totalWeight]);

  const handleCancel = () => {
    cancelledRef.current = true;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    mutation.reset();
  };

  const submit = async () => {
    if (mutation.isPending) return;

    let payloadWeight: number | undefined;
    let payloadDescription: string | undefined;

    if (parsedWeight !== null) {
      if (Number.isNaN(parsedWeight)) {
        Toast.show({
          type: 'error',
          text1: t('foodPhotoImprove.invalidWeight', { defaultValue: 'Invalid weight' }),
          text2: t('foodPhotoImprove.invalidWeightMessage', { defaultValue: 'Total weight must be a positive number.' }),
        });
        return;
      }
      payloadWeight = parsedWeight;
    }
    if (trimmedDescription) {
      if (descriptionTooLong) {
        Toast.show({
          type: 'error',
          text1: t('foodPhotoImprove.descriptionTooLong', { defaultValue: 'Description too long' }),
          text2: t('foodPhotoImprove.descriptionTooLongMessage', { defaultValue: 'Keep it under {{max}} characters.', max: DESCRIPTION_MAX }),
        });
        return;
      }
      payloadDescription = trimmedDescription;
    }

    if (images.length === 0) {
      Toast.show({
        type: 'error',
        text1: t('foodPhotoImprove.noImages', { defaultValue: 'No images' }),
        text2: t('foodPhotoImprove.noImagesMessage', { defaultValue: 'Add at least one photo to generate an estimate.' }),
      });
      return;
    }

    // Format rejection is owned server-side (it returns UNSUPPORTED_MIME_TYPE,
    // surfaced on the review screen). The client can't reliably pre-screen HEIC
    // because support depends on the vision provider, which the app never fetches.
    const imagePayloads: { base64Image: string; mimeType: string }[] = [];
    try {
      // Sequential rather than Promise.all: converting several images to base64
      // concurrently spikes peak memory on the RN bridge and can OOM low-end
      // devices. Local-file reads are fast, so the cost of going one at a time
      // is negligible.
      for (const img of images) {
        imagePayloads.push({
          base64Image: await new File(img.uri).base64(),
          mimeType: resolveMimeType(img),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[Food Photo Improve] Failed to read photo: ${message}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: t('foodPhotoImprove.readPhotoFailed', { defaultValue: 'Could not read photo' }),
        text2: t('foodPhotoImprove.readPhotoFailedMessage', { defaultValue: 'Please retake the photo and try again.' }),
      });
      return;
    }

    cancelledRef.current = false;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    mutation.mutate(
      {
        images: imagePayloads,
        description: payloadDescription,
        totalWeight: payloadWeight,
        weightUnit: payloadWeight !== undefined ? weightUnit : undefined,
        signal: controller.signal,
      },
      {
        onSuccess: (estimate) => {
          abortControllerRef.current = null;
          navigation.navigate('EstimateReview', {
            date,
            estimate,
            request: {
              description: payloadDescription,
              totalWeight: payloadWeight,
              weightUnit: payloadWeight !== undefined ? weightUnit : undefined,
            },
            mealTypeId: mealTypeId ?? undefined,
          });
        },
        onError: (error) => {
          abortControllerRef.current = null;
          if (cancelledRef.current) return;
          const copy = mapEstimateError(error.code);
          let title = copy.titleDefaultValue;
          let message = copy.messageDefaultValue;
          switch (copy.titleKey) {
            case 'aiNotConfiguredTitle':
              title = t('foodPhotoImprove.aiNotConfiguredTitle', { defaultValue: 'AI not configured' });
              message = t('foodPhotoImprove.aiNotConfiguredMessage', { defaultValue: 'Configure an AI provider in the web app to use photo estimates.' });
              break;
            case 'photoTooLargeTitle':
              title = t('foodPhotoImprove.photoTooLargeTitle', { defaultValue: 'Photo too large' });
              message = t('foodPhotoImprove.photoTooLargeMessage', { defaultValue: 'Retake the photo at lower quality.' });
              break;
            case 'unexpectedImageFormatTitle':
              title = t('foodPhotoImprove.unexpectedImageFormatTitle', { defaultValue: 'Unexpected image format' });
              message = t('foodPhotoImprove.unexpectedImageFormatMessage', { defaultValue: 'Retake the photo.' });
              break;
            case 'couldNotProcessPhotoTitle':
              title = t('foodPhotoImprove.couldNotProcessPhotoTitle', { defaultValue: 'Could not process photo' });
              message = t('foodPhotoImprove.couldNotProcessPhotoMessage', { defaultValue: 'The provider blocked this image. Try another shot.' });
              break;
            case 'providerTimedOutTitle':
              title = t('foodPhotoImprove.providerTimedOutTitle', { defaultValue: 'AI provider timed out' });
              message = t('foodPhotoImprove.providerTimedOutMessage', { defaultValue: 'The estimate took too long. Try again, or log this food manually.' });
              break;
            case 'providerNotAllowedTitle':
              title = t('foodPhotoImprove.providerNotAllowedTitle', { defaultValue: 'AI provider not allowed' });
              message = t('foodPhotoImprove.providerNotAllowedMessage', { defaultValue: 'This AI provider points to a private network address. Ask an admin to configure it globally.' });
              break;
            case 'providerUnreachableTitle':
              title = t('foodPhotoImprove.providerUnreachableTitle', { defaultValue: "Couldn\'t reach AI provider" });
              message = t('foodPhotoImprove.providerUnreachableMessage', { defaultValue: 'Try again, or log this food manually.' });
              break;
          }
          Toast.show({ type: 'error', text1: title, text2: message });
          if (copy.invalidateAiSettings) {
            queryClient.invalidateQueries({
              queryKey: activeAiServiceSettingQueryKey,
            });
          }
          if (!copy.stayOnForm) {
            const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
            if (error.code === 'IMAGE_TOO_LARGE' || error.code === 'UNSUPPORTED_MIME_TYPE') {
              parent?.replace('FoodScan', { date, initialMode: 'photo', mealTypeId: mealTypeId ?? undefined });
            } else {
              parent?.popToTop();
            }
          }
        },
      },
    );
  };

  const isPending = mutation.isPending;
  const pendingMessage = pendingMessageFor(elapsedSec, images.length, [
    t('foodPhotoImprove.readingPhoto', { defaultValue: 'Reading your photo…' }),
    t('foodPhotoImprove.readingPhotos', { defaultValue: 'Reading your photos…' }),
    t('foodPhotoImprove.identifyingIngredients', { defaultValue: 'Identifying ingredients…' }),
    t('foodPhotoImprove.estimatingPortions', { defaultValue: 'Estimating portions…' }),
    t('foodPhotoImprove.calculatingNutrition', { defaultValue: 'Calculating nutrition…' }),
    t('foodPhotoImprove.almostThere', { defaultValue: 'Almost there…' }),
  ]);

  return (
    <View
      className="flex-1 bg-background"
      style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
    >
      <View className="flex-row items-center justify-between px-4 py-3 border-b border-border-subtle">
        <Button
          variant="ghost"
          onPress={() => navigation.getParent<NativeStackNavigationProp<RootStackParamList>>()?.popToTop()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10 p-0"
          accessibilityLabel={t('foodPhotoImprove.cancel', { defaultValue: 'Cancel' })}
          disabled={isPending}
        >
          <Icon name="close" size={22} color={backColor} />
        </Button>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          {t('foodPhotoImprove.title', { defaultValue: 'Improve estimate' })}
        </Text>
      </View>

      <KeyboardAwareScrollView
        contentContainerClassName="px-4 pt-4"
        contentContainerStyle={{
          flexGrow: 1,
          paddingBottom: Math.max(insets.bottom, 16) + 80,
        }}
        bottomOffset={80}
        keyboardShouldPersistTaps="handled"
      >
        <View className="mb-4">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
            keyboardShouldPersistTaps="handled"
          >
            {images.map((img, index) => (
              <View
                key={`${img.uri}-${index}`}
                className="rounded-xl overflow-hidden bg-raised"
                style={{ width: 96, height: 96 }}
              >
                <Image
                  source={{ uri: img.uri }}
                  style={{ width: 96, height: 96 }}
                  resizeMode="cover"
                />
                {!isPending ? (
                  <Pressable
                    onPress={() => removeImage(index)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={t('foodPhotoImprove.removeImage', { defaultValue: 'Remove image {{number}}', number: index + 1 })}
                    className="absolute top-1 right-1 rounded-full bg-background/80 p-0.5"
                  >
                    <Icon name="close" size={16} color={textPrimary} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {!isPending && !atImageCap ? (
              <Pressable
                onPress={() => setSheetVisible(true)}
                accessibilityLabel={t('foodPhotoImprove.addAnotherImage', { defaultValue: 'Add another image' })}
                className="rounded-xl items-center justify-center border border-dashed border-border-subtle"
                style={{ width: 96, height: 96 }}
              >
                <Icon name="add" size={28} color={accentPrimary} />
                <Text className="text-text-secondary text-xs mt-1">{t('common.add', { defaultValue: 'Add' })}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>

        {isPending ? (
          <Animated.View
            key="pending"
            entering={FadeIn.duration(FADE_IN_MS)}
            exiting={FadeOut.duration(FADE_OUT_MS)}
            className="flex-1 items-center justify-center"
            accessibilityLiveRegion="polite"
            accessibilityRole="progressbar"
            accessibilityLabel={pendingMessage}
          >
            <ActivityIndicator size="large" color={accentPrimary} />
            <Text className="text-text-primary text-base font-semibold mt-4 text-center">
              {pendingMessage}
            </Text>
          </Animated.View>
        ) : (
          <Animated.View
            key="form"
            entering={FadeIn.duration(FADE_IN_MS)}
            exiting={FadeOut.duration(FADE_OUT_MS)}
          >
            <Text className="text-text-secondary text-sm mb-4 leading-5">
              {t('foodPhotoImprove.descriptionHint', { defaultValue: 'Add anything the {{subject}} might not make obvious.', subject: t('foodPhotoImprove.subjectLabel', { defaultValue: 'photos', count: images.length }) })}
            </Text>

            <Text className="text-text-primary text-base font-semibold mb-2">
              {t('foodPhotoImprove.totalWeightOptional', { defaultValue: 'Total weight (optional)' })}
            </Text>
            <View className="flex-row items-center gap-2 mb-2">
              <FormInput
                className="flex-1"
                placeholder={t('foodPhotoImprove.weightPlaceholder', { defaultValue: 'e.g. 350' })}
                keyboardType="decimal-pad"
                value={totalWeight}
                onChangeText={handleWeightChange}
                returnKeyType="done"
              />
            </View>
            <View className="mb-4">
              <SegmentedControl
                segments={weightUnits}
                activeKey={weightUnit}
                onSelect={setWeightUnit}
              />
            </View>

            <Text className="text-text-primary text-base font-semibold mb-2">
              {t('foodPhotoImprove.descriptionOptional', { defaultValue: 'Description (optional)' })}
            </Text>
            <Text className="text-text-secondary text-sm mb-2 leading-5">
              {t('foodPhotoImprove.descriptionExamples', { defaultValue: 'Include oils, butter, cream, sauces, toppings, sides, or restaurant names.' })}
            </Text>
            <FormInput
              className="mb-1"
              placeholder={t('foodPhotoImprove.descriptionPlaceholder', { defaultValue: 'e.g. salmon with lemon dill cream sauce' })}
              value={description}
              onChangeText={setDescription}
              multiline
              numberOfLines={3}
              maxLength={DESCRIPTION_MAX + 50}
              style={{ minHeight: 72, textAlignVertical: 'top' }}
            />
            <Text
              className="text-xs mb-6"
              style={{
                color: descriptionTooLong ? dangerColor : textPrimary,
                opacity: descriptionTooLong ? 1 : 0.6,
              }}
            >
              {description.length}/{DESCRIPTION_MAX}
            </Text>
          </Animated.View>
        )}
      </KeyboardAwareScrollView>

      <KeyboardStickyView
        offset={{ closed: 0, opened: Math.max(insets.bottom, 16) }}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}
      >
        <View
          className="px-4 gap-3 border-t border-border-subtle pt-3 bg-background"
          style={{ paddingBottom: Math.max(insets.bottom, 16) }}
        >
          {isPending ? (
            <Animated.View
              key="cancel-btn"
              entering={FadeIn.duration(FADE_IN_MS)}
              exiting={FadeOut.duration(FADE_OUT_MS)}
            >
              <Button variant="outline" onPress={handleCancel}>
                {t('common.cancel', { defaultValue: 'Cancel' })}
              </Button>
            </Animated.View>
          ) : (
            <Animated.View
              key="submit-btn"
              entering={FadeIn.duration(FADE_IN_MS)}
              exiting={FadeOut.duration(FADE_OUT_MS)}
            >
              <Button
                variant="primary"
                onPress={() => {
                  void submit();
                }}
              >
                {t('foodPhotoImprove.generateEstimate', { defaultValue: 'Generate estimate' })}
              </Button>
            </Animated.View>
          )}
        </View>
      </KeyboardStickyView>

      <Modal
        visible={sheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSheetVisible(false)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/50"
          onPress={() => setSheetVisible(false)}
          accessibilityLabel={t('common.close', { defaultValue: 'Close' })}
        >
          <Pressable
            // Tap-absorbing wrapper only; hide it from screen readers so they
            // focus the real buttons inside instead of an empty container button.
            accessible={false}
            className="bg-surface rounded-t-2xl px-4 pt-3"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}
            // Absorb the tap so it doesn't fall through to the backdrop. RN
            // press events have no stopPropagation(); a nested Pressable with a
            // no-op onPress already prevents the backdrop's onPress from firing.
            onPress={() => {}}
          >
            <View className="items-center mb-3">
              <View className="h-1 w-10 rounded-full bg-border-subtle" />
            </View>
            <Text className="text-text-primary text-base font-semibold mb-2 px-1">
              {t('foodPhotoImprove.addAnotherImage', { defaultValue: 'Add another image' })}
            </Text>
            <Button
              variant="outline"
              className="flex-row items-center justify-start gap-3 mb-2"
              onPress={() => {
                void addFromCamera();
              }}
            >
              <Icon name="camera" size={22} color={accentPrimary} />
              <Text className="text-text-primary text-base">{t('foodPhotoImprove.takePhoto', { defaultValue: 'Take photo' })}</Text>
            </Button>
            <Button
              variant="outline"
              className="flex-row items-center justify-start gap-3"
              onPress={() => {
                void addFromLibrary();
              }}
            >
              <Icon name="photo-library" size={22} color={accentPrimary} />
              <Text className="text-text-primary text-base">
                {t('foodPhotoImprove.chooseFromLibrary', { defaultValue: 'Choose from library' })}
              </Text>
            </Button>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

export default FoodPhotoImproveScreen;

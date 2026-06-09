import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useActiveAiServiceSetting } from '../hooks/useActiveAiServiceSetting';
import { activeAiServiceSettingQueryKey } from '../hooks/queryKeys';
import { addLog } from '../services/LogService';
import { parseDecimalInput, DECIMAL_INPUT_REGEX } from '../utils/numericInput';
import { mapEstimateError } from '../utils/foodPhotoEstimate';

type Props = FoodPhotoFlowScreenProps<'Improve'>;

const WEIGHT_UNITS: Segment<'g' | 'oz'>[] = [
  { key: 'g', label: 'grams' },
  { key: 'oz', label: 'ounces' },
];

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

const PENDING_MESSAGES: { startsAt: number; text: string }[] = [
  { startsAt: 0, text: 'Reading your photo…' },
  { startsAt: 6, text: 'Identifying ingredients…' },
  { startsAt: 15, text: 'Estimating portions…' },
  { startsAt: 28, text: 'Calculating nutrition…' },
  { startsAt: 45, text: 'Almost there…' },
];

function pendingMessageFor(elapsedSec: number, imageCount: number): string {
  let current = PENDING_MESSAGES[0].text;
  for (const m of PENDING_MESSAGES) {
    if (elapsedSec >= m.startsAt) current = m.text;
  }
  // Pluralize the first ("Reading your photo…") message for multi-image sets.
  if (imageCount > 1 && current === PENDING_MESSAGES[0].text) {
    return 'Reading your photos…';
  }
  return current;
}

const FoodPhotoImproveScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [accentPrimary, textPrimary, dangerColor] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-primary',
    '--color-text-danger-subtle',
  ]) as [string, string, string];

  const { date, photo } = route.params;

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
  const { data: aiSetting } = useActiveAiServiceSetting();

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
    // Fail fast on the client when the active provider can't read HEIC/HEIF,
    // rather than reading base64 and round-tripping to a guaranteed server
    // rejection. The service-side guard remains the backstop. Only Gemini
    // accepts HEIC, so reject for every other provider — but the truthiness
    // check keeps us from gating while `service_type` is still loading
    // (undefined), where a bare `!== 'google'` would wrongly reject.
    const provider = aiSetting?.service_type;
    const resolved = resolveMimeType({ uri, mimeType });
    if (
      provider &&
      provider !== 'google' &&
      (resolved === 'image/heic' || resolved === 'image/heif')
    ) {
      Toast.show({
        type: 'error',
        text1: 'Unsupported format',
        text2: "This AI provider can't read HEIC/HEIF images. Please pick a JPEG or PNG.",
      });
      return;
    }
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
        ?.replace('FoodScan', { date, initialMode: 'photo' });
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
          text1: 'Camera permission needed',
          text2: 'Enable camera access to add a photo.',
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
      Toast.show({ type: 'error', text1: 'Could not take photo' });
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
      Toast.show({ type: 'error', text1: 'Could not load photo' });
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
          text1: 'Invalid weight',
          text2: 'Total weight must be a positive number.',
        });
        return;
      }
      payloadWeight = parsedWeight;
    }
    if (trimmedDescription) {
      if (descriptionTooLong) {
        Toast.show({
          type: 'error',
          text1: 'Description too long',
          text2: `Keep it under ${DESCRIPTION_MAX} characters.`,
        });
        return;
      }
      payloadDescription = trimmedDescription;
    }

    if (images.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'No images',
        text2: 'Add at least one photo to generate an estimate.',
      });
      return;
    }

    // Fail fast before the memory-intensive base64 reads if any staged image is
    // HEIC/HEIF and the active provider can't read it. Catches the seed image
    // from the scan screen, which never passes through appendImage. Only Gemini
    // accepts HEIC; the truthiness check avoids gating while `service_type` is
    // still loading (undefined).
    const provider = aiSetting?.service_type;
    if (provider && provider !== 'google') {
      const hasUnsupported = images.some((img) => {
        const resolved = resolveMimeType(img);
        return resolved === 'image/heic' || resolved === 'image/heif';
      });
      if (hasUnsupported) {
        Toast.show({
          type: 'error',
          text1: 'Unsupported format',
          text2: "This AI provider can't read HEIC/HEIF images. Please remove them or switch to JPEG/PNG.",
        });
        return;
      }
    }

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
        text1: 'Could not read photo',
        text2: 'Please retake the photo and try again.',
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
          });
        },
        onError: (error) => {
          abortControllerRef.current = null;
          if (cancelledRef.current) return;
          const copy = mapEstimateError(error.code);
          Toast.show({
            type: 'error',
            text1: copy.title,
            text2: copy.message,
          });
          if (copy.invalidateAiSettings) {
            queryClient.invalidateQueries({
              queryKey: activeAiServiceSettingQueryKey,
            });
          }
          if (!copy.stayOnForm) {
            const parent = navigation.getParent<NativeStackNavigationProp<RootStackParamList>>();
            if (error.code === 'IMAGE_TOO_LARGE' || error.code === 'UNSUPPORTED_MIME_TYPE') {
              parent?.replace('FoodScan', { date, initialMode: 'photo' });
            } else {
              parent?.popToTop();
            }
          }
        },
      },
    );
  };

  const isPending = mutation.isPending;
  const pendingMessage = pendingMessageFor(elapsedSec, images.length);

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
          accessibilityLabel="Cancel"
          disabled={isPending}
        >
          <Icon name="close" size={22} color={accentPrimary} />
        </Button>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          Improve estimate
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
                    accessibilityLabel={`Remove image ${index + 1}`}
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
                accessibilityLabel="Add another image"
                className="rounded-xl items-center justify-center border border-dashed border-border-subtle"
                style={{ width: 96, height: 96 }}
              >
                <Icon name="add" size={28} color={accentPrimary} />
                <Text className="text-text-secondary text-xs mt-1">Add</Text>
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
              Add anything the {images.length > 1 ? 'photos' : 'photo'} might not
              make obvious.
            </Text>

            <Text className="text-text-primary text-base font-semibold mb-2">
              Total weight (optional)
            </Text>
            <View className="flex-row items-center gap-2 mb-2">
              <FormInput
                className="flex-1"
                placeholder="e.g. 350"
                keyboardType="decimal-pad"
                value={totalWeight}
                onChangeText={handleWeightChange}
                returnKeyType="done"
              />
            </View>
            <View className="mb-4">
              <SegmentedControl
                segments={WEIGHT_UNITS}
                activeKey={weightUnit}
                onSelect={setWeightUnit}
              />
            </View>

            <Text className="text-text-primary text-base font-semibold mb-2">
              Description (optional)
            </Text>
            <Text className="text-text-secondary text-sm mb-2 leading-5">
              Include oils, butter, cream, sauces, toppings, sides, or restaurant
              names.
            </Text>
            <FormInput
              className="mb-1"
              placeholder='e.g. salmon with lemon dill cream sauce'
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
                Cancel
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
                Generate estimate
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
          accessibilityLabel="Dismiss"
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
              Add another image
            </Text>
            <Button
              variant="outline"
              className="flex-row items-center justify-start gap-3 mb-2"
              onPress={() => {
                void addFromCamera();
              }}
            >
              <Icon name="camera" size={22} color={accentPrimary} />
              <Text className="text-text-primary text-base">Take photo</Text>
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
                Choose from library
              </Text>
            </Button>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

export default FoodPhotoImproveScreen;

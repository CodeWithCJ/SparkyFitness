import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, Image, Platform } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { File } from 'expo-file-system';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
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
import {
  foodPhotoProviderLabel,
  mapEstimateError,
} from '../utils/foodPhotoEstimate';

type Props = FoodPhotoFlowScreenProps<'Improve'>;

const WEIGHT_UNITS: Segment<'g' | 'oz'>[] = [
  { key: 'g', label: 'grams' },
  { key: 'oz', label: 'ounces' },
];

const DESCRIPTION_MAX = 500;

const FADE_IN_MS = 200;
const FADE_OUT_MS = 150;

const PENDING_MESSAGES: { startsAt: number; text: string }[] = [
  { startsAt: 0, text: 'Reading your photo…' },
  { startsAt: 6, text: 'Identifying ingredients…' },
  { startsAt: 15, text: 'Estimating portions…' },
  { startsAt: 28, text: 'Calculating nutrition…' },
  { startsAt: 45, text: 'Almost there…' },
];

function pendingMessageFor(elapsedSec: number): string {
  let current = PENDING_MESSAGES[0].text;
  for (const m of PENDING_MESSAGES) {
    if (elapsedSec >= m.startsAt) current = m.text;
  }
  return current;
}

const FoodPhotoImproveScreen: React.FC<Props> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const accentPrimary = String(useCSSVariable('--color-accent-primary'));
  const textPrimary = String(useCSSVariable('--color-text-primary'));

  const { date, photo } = route.params;

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
  const providerLabel = foodPhotoProviderLabel(aiSetting?.service_type);

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

    let base64: string;
    try {
      base64 = await new File(photo.uri).base64();
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
        base64Image: base64,
        mimeType: 'image/jpeg',
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
  const pendingMessage = pendingMessageFor(elapsedSec);

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
        contentContainerClassName="px-4 py-4"
        contentContainerStyle={{ flexGrow: 1 }}
        bottomOffset={80}
        keyboardShouldPersistTaps="handled"
      >
        <View className="rounded-xl overflow-hidden bg-raised mb-4">
          <Image
            source={{ uri: photo.uri }}
            style={{ width: '100%', aspectRatio: 4 / (3 * 0.85) }}
            resizeMode="cover"
          />
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
            {providerLabel ? (
              <Text className="text-text-secondary text-xs text-center opacity-70 mt-4">
                Powered by {providerLabel}
              </Text>
            ) : null}
          </Animated.View>
        ) : (
          <Animated.View
            key="form"
            entering={FadeIn.duration(FADE_IN_MS)}
            exiting={FadeOut.duration(FADE_OUT_MS)}
          >
            <Text className="text-text-secondary text-sm mb-4 leading-5">
              Add anything the photo might not make obvious.
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
                color: descriptionTooLong ? '#dc2626' : textPrimary,
                opacity: descriptionTooLong ? 1 : 0.6,
              }}
            >
              {description.length}/{DESCRIPTION_MAX}
            </Text>

            {providerLabel ? (
              <Text className="text-text-secondary text-xs text-center opacity-70 mt-2">
                Powered by {providerLabel}
              </Text>
            ) : null}
          </Animated.View>
        )}
      </KeyboardAwareScrollView>

      <View
        className="px-4 gap-3 border-t border-border-subtle pt-3"
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
    </View>
  );
};

export default FoodPhotoImproveScreen;

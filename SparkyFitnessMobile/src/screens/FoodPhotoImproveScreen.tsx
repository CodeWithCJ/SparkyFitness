import React, { useMemo, useState } from 'react';
import { View, Text, ActivityIndicator, Image, Platform } from 'react-native';
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

    mutation.mutate(
      {
        base64Image: base64,
        mimeType: 'image/jpeg',
        description: payloadDescription,
        totalWeight: payloadWeight,
        weightUnit: payloadWeight !== undefined ? weightUnit : undefined,
      },
      {
        onSuccess: (estimate) => {
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
        >
          <Icon name="close" size={22} color={accentPrimary} />
        </Button>
        <Text className="absolute left-0 right-0 text-center text-text-primary text-lg font-semibold">
          Improve estimate
        </Text>
      </View>

      <KeyboardAwareScrollView
        contentContainerClassName="px-4 py-4"
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
      </KeyboardAwareScrollView>

      <View
        className="px-4 gap-3 border-t border-border-subtle pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 16) }}
      >
        <Button
          variant="primary"
          disabled={mutation.isPending}
          onPress={() => {
            void submit();
          }}
        >
          {mutation.isPending ? (
            <View className="flex-row items-center gap-2">
              <ActivityIndicator size="small" color="#fff" />
              <Text className="text-white font-semibold">Estimating…</Text>
            </View>
          ) : (
            'Generate estimate'
          )}
        </Button>
      </View>
    </View>
  );
};

export default FoodPhotoImproveScreen;

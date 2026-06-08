import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Platform,
  Button,
  StyleSheet,
  ActivityIndicator,
  Image,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { CommonActions } from '@react-navigation/native';
import UIButton from '../components/ui/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import FormInput from '../components/FormInput';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import type { RootStackScreenProps } from '../types/navigation';
import type { FoodInfoItem } from '../types/foodInfo';
import { useCSSVariable } from 'uniwind';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { lookupBarcodeV2, scanNutritionLabel } from '../services/api/externalFoodSearchApi';
import { getApiErrorMessage } from '../services/api/errors';
import { fireSuccessHaptic } from '../services/haptics';
import { useSoundsEnabled } from '../services/sounds';
import { toFormString } from '../types/foodInfo';
import { useActiveAiServiceSetting } from '../hooks/useActiveAiServiceSetting';
import { isFoodPhotoAvailable } from '../services/api/aiSettingsApi';
import {
  hasSeenFoodPhotoIntro,
  markFoodPhotoIntroSeen,
} from '../services/foodPhotoIntro';

type FoodScanScreenProps = RootStackScreenProps<'FoodScan'>;

type ScanMode = 'barcode' | 'label' | 'photo';

const SCAN_SEGMENTS: Segment<ScanMode>[] = [
  { key: 'barcode', label: 'Barcode' },
  { key: 'label', label: 'Label' },
  { key: 'photo', label: 'Photo' },
];

const GUIDE_WIDTH = 280;
const GUIDE_HEIGHT = 160;

const CORNER_SIZE = 24;
const CORNER_BORDER = 3;
const CORNER_STYLE = {
  position: 'absolute' as const,
  width: CORNER_SIZE,
  height: CORNER_SIZE,
  borderColor: '#fff',
};

const FoodScanScreen: React.FC<FoodScanScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const accentPrimary = String(useCSSVariable('--color-accent-primary'));
  const [permission, requestPermission] = useCameraPermissions();
  const soundsEnabled = useSoundsEnabled();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [flashlight, setFlashlight] = useState(false);
  const scanLock = useRef(false);
  const pickerLock = useRef(false);
  const params = route.params;
  const captureParams = params?.mode === 'capture-barcode' ? params : undefined;
  const lookupParams = params?.mode === 'capture-barcode' ? undefined : params;
  const isCaptureBarcodeMode = !!captureParams;
  const captureReturnKey = captureParams?.returnKey;
  const [scanMode, setScanMode] = useState<ScanMode>(() => {
    if (isCaptureBarcodeMode) {
      // Capture-only mode: lock to barcode regardless of any other params.
      return 'barcode';
    }
    const requested = lookupParams?.initialMode ?? 'barcode';
    // Meal-builder scans never use the photo flow (it always logs to the
    // diary). Coerce to barcode if a caller deep-links 'photo' here.
    if (requested === 'photo' && lookupParams?.pickerMode === 'meal-builder') {
      return 'barcode';
    }
    return requested;
  });
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<{ barcode: string; message: string } | null>(null);
  const [labelProcessing, setLabelProcessing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<{ base64: string; uri: string } | null>(null);
  const [manualEntryVisible, setManualEntryVisible] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [photoGateVisible, setPhotoGateVisible] = useState(false);
  const introCheckedRef = useRef(false);
  const cameraRef = useRef<CameraView>(null);
  const date = lookupParams?.date;
  const pickerMode = lookupParams?.pickerMode ?? 'log-entry';
  const returnDepth = lookupParams?.returnDepth;
  const providerId = lookupParams?.providerId;
  const isMealBuilderMode = pickerMode === 'meal-builder';

  // Photo estimation always logs to the diary; hide it for meal-builder
  // scans so we don't drop the user into a flow that ignores pickerMode.
  // capture-barcode mode is barcode-only.
  const scanSegments = useMemo(() => {
    if (isCaptureBarcodeMode) {
      return SCAN_SEGMENTS.filter((segment) => segment.key === 'barcode');
    }
    return isMealBuilderMode
      ? SCAN_SEGMENTS.filter((segment) => segment.key !== 'photo')
      : SCAN_SEGMENTS;
  }, [isCaptureBarcodeMode, isMealBuilderMode]);

  const aiSettingQuery = useActiveAiServiceSetting({
    // Skip the AI gating fetch in capture-barcode mode — Photo segment is
    // unreachable there.
    enabled: !isCaptureBarcodeMode && scanMode === 'photo',
    // Refresh on every photo-mode entry so a user who left to set up AI in
    // the web app sees the gate clear when they come back.
    staleTime: 0,
  });
  const aiSetting = aiSettingQuery.data ?? null;
  const photoModeAvailable = isFoodPhotoAvailable(aiSetting);
  const photoModeLoading = scanMode === 'photo' && aiSettingQuery.isLoading;

  const buildFoodFormParams = (
    extra: Partial<Extract<RootStackScreenProps<'FoodForm'>['route']['params'], { mode: 'create-food' }>>,
  ): Extract<RootStackScreenProps<'FoodForm'>['route']['params'], { mode: 'create-food' }> => ({
    mode: 'create-food',
    date,
    pickerMode: isMealBuilderMode ? 'meal-builder' : undefined,
    returnDepth,
    ...extra,
  });

  const performBarcodeLookup = async (
    barcode: string,
    { shouldFireSuccessHaptic = false }: { shouldFireSuccessHaptic?: boolean } = {},
  ) => {
    setNotFoundBarcode(null);
    setLookupError(null);
    try {
      const result = await lookupBarcodeV2(barcode, providerId);

      if (!result.food) {
        setNotFoundBarcode(barcode);
      } else if (result.source === 'local') {
        if (shouldFireSuccessHaptic) {
          fireSuccessHaptic();
        }
        const defaultVariant = result.food.default_variant;
        const item: FoodInfoItem = {
          id: result.food.id!,
          name: result.food.name,
          brand: result.food.brand,
          servingSize: defaultVariant.serving_size,
          servingUnit: defaultVariant.serving_unit,
          calories: defaultVariant.calories,
          protein: defaultVariant.protein,
          carbs: defaultVariant.carbs,
          fat: defaultVariant.fat,
          fiber: defaultVariant.dietary_fiber,
          saturatedFat: defaultVariant.saturated_fat,
          sodium: defaultVariant.sodium,
          sugars: defaultVariant.sugars,
          transFat: defaultVariant.trans_fat,
          potassium: defaultVariant.potassium,
          calcium: defaultVariant.calcium,
          iron: defaultVariant.iron,
          cholesterol: defaultVariant.cholesterol,
          vitaminA: defaultVariant.vitamin_a,
          vitaminC: defaultVariant.vitamin_c,
          variantId: defaultVariant.id,
          source: 'local',
          provider_verified: result.food.provider_verified,
          originalItem: result.food,
        };
        navigation.replace('FoodEntryAdd', {
          item,
          date,
          pickerMode: isMealBuilderMode ? 'meal-builder' : undefined,
          returnDepth,
        });
      } else {
        if (shouldFireSuccessHaptic) {
          fireSuccessHaptic();
        }
        const dv = result.food.default_variant;
        const isReferenceServing = (v: typeof dv) =>
          v.serving_size === 100 && (v.serving_unit === 'g' || v.serving_unit === 'ml');
        const hasPortionDescription = (v: typeof dv) =>
          v.serving_description &&
          v.serving_description.length > 0 &&
          !v.serving_description.match(/^\d+(\.\d+)?\s*(g|ml|kg|l)$/i);
        const preferredVariant = isReferenceServing(dv) && result.food.variants
          ? result.food.variants.find((v) => v !== dv && hasPortionDescription(v))
          : undefined;
        const displayVariant = preferredVariant ?? dv;
        const orderedVariants = result.food.variants
          ? preferredVariant
            ? [preferredVariant, dv, ...result.food.variants.filter((v) => v !== dv && v !== preferredVariant)]
            : [dv, ...result.food.variants.filter((v) => v !== dv)]
          : undefined;
        const item: FoodInfoItem = {
          id: result.food.provider_external_id ?? result.food.id ?? '',
          name: result.food.name,
          brand: result.food.brand,
          servingSize: displayVariant.serving_size,
          servingUnit: displayVariant.serving_unit,
          servingDescription: displayVariant.serving_description ?? `${displayVariant.serving_size} ${displayVariant.serving_unit}`,
          calories: displayVariant.calories,
          protein: displayVariant.protein,
          carbs: displayVariant.carbs,
          fat: displayVariant.fat,
          fiber: displayVariant.dietary_fiber,
          saturatedFat: displayVariant.saturated_fat,
          sodium: displayVariant.sodium,
          sugars: displayVariant.sugars,
          transFat: displayVariant.trans_fat,
          potassium: displayVariant.potassium,
          calcium: displayVariant.calcium,
          iron: displayVariant.iron,
          cholesterol: displayVariant.cholesterol,
          vitaminA: displayVariant.vitamin_a,
          vitaminC: displayVariant.vitamin_c,
          variantId: displayVariant.id,
          source: 'external',
          provider_verified: result.food.provider_verified,
          externalVariants: orderedVariants?.map((v) => ({
            serving_size: v.serving_size,
            serving_unit: v.serving_unit,
            serving_description: v.serving_description ?? `${v.serving_size} ${v.serving_unit}`,
            calories: v.calories,
            protein: v.protein,
            carbs: v.carbs,
            fat: v.fat,
            saturated_fat: v.saturated_fat,
            sodium: v.sodium,
            fiber: v.dietary_fiber,
            sugars: v.sugars,
            trans_fat: v.trans_fat,
            cholesterol: v.cholesterol,
            potassium: v.potassium,
            calcium: v.calcium,
            iron: v.iron,
            vitamin_a: v.vitamin_a,
            vitamin_c: v.vitamin_c,
          })),
          originalItem: result.food,
        };
        navigation.replace('FoodEntryAdd', {
          item,
          date,
          pickerMode: isMealBuilderMode ? 'meal-builder' : undefined,
          returnDepth,
        });
      }
    } catch (error) {
      const message =
        getApiErrorMessage(error) ?? "Couldn't look up this barcode. Please try again.";
      setLookupError({ barcode, message });
    } finally {
      setLoading(false);
    }
  };

  const dispatchCapturedBarcode = (barcode: string) => {
    if (!captureReturnKey) return;
    navigation.dispatch({
      ...CommonActions.setParams({
        pendingScannedBarcode: barcode,
        scannedBarcodeNonce: Date.now(),
      }),
      source: captureReturnKey,
    });
    navigation.goBack();
  };

  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (scanLock.current) return;
    scanLock.current = true;
    setScanned(true);
    if (isCaptureBarcodeMode) {
      fireSuccessHaptic();
      dispatchCapturedBarcode(data);
      return;
    }
    setLoading(true);
    await performBarcodeLookup(data, { shouldFireSuccessHaptic: true });
  };

  const handleManualSubmit = async () => {
    const barcode = manualBarcode.trim();
    if (!barcode) return;
    setManualEntryVisible(false);
    setManualBarcode('');
    scanLock.current = true;
    setScanned(true);
    if (isCaptureBarcodeMode) {
      dispatchCapturedBarcode(barcode);
      return;
    }
    setLoading(true);
    await performBarcodeLookup(barcode);
  };

  const handleLabelCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7, shutterSound: soundsEnabled });
      if (!photo?.base64) {
        Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to capture photo.' });
        return;
      }
      setCapturedPhoto({ base64: photo.base64, uri: photo.uri });
    } catch {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to capture photo.' });
    }
  };

  const handleUsePhoto = async () => {
    if (!capturedPhoto) return;
    setLabelProcessing(true);
    try {
      const result = await scanNutritionLabel(capturedPhoto.base64, 'image/jpeg');
      navigation.replace(
        'FoodForm',
        buildFoodFormParams({
          initialFood: {
            name: result.name || '',
            brand: result.brand || '',
            servingSize: String(result.serving_size ?? ''),
            servingUnit: result.serving_unit || 'g',
            calories: String(result.calories ?? ''),
            protein: String(result.protein ?? ''),
            carbs: String(result.carbs ?? ''),
            fat: String(result.fat ?? ''),
            fiber: toFormString(result.fiber),
            saturatedFat: toFormString(result.saturated_fat),
            transFat: toFormString(result.trans_fat),
            sodium: toFormString(result.sodium),
            sugars: toFormString(result.sugars),
            cholesterol: toFormString(result.cholesterol),
            potassium: toFormString(result.potassium),
            calcium: toFormString(result.calcium),
            iron: toFormString(result.iron),
            vitaminA: toFormString(result.vitamin_a),
            vitaminC: toFormString(result.vitamin_c),
          },
          barcode: lookupError?.barcode ?? notFoundBarcode ?? undefined,
          providerType: 'label_scan',
        }),
      );
    } catch {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Failed to analyze nutrition label. Please try again.',
      });
    } finally {
      setLabelProcessing(false);
    }
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
  };

  const handleSegmentChange = (key: ScanMode) => {
    // Re-tapping Photo while already on Photo is the user's "I configured
    // AI in the web app, try again" gesture — force a refetch so the gate
    // can clear without leaving the segment.
    if (key === 'photo' && scanMode === 'photo') {
      void aiSettingQuery.refetch();
      return;
    }
    setScanMode(key);
    setNotFoundBarcode(null);
    setLookupError(null);
    setCapturedPhoto(null);
    setScanned(false);
    scanLock.current = false;
    setManualEntryVisible(false);
    setManualBarcode('');
    if (key !== 'photo') {
      setPhotoGateVisible(false);
      introCheckedRef.current = false;
    }
  };

  // Photo-mode gate: drives the gate overlay and the one-time intro push.
  // Triggered via effect (not just segment change) so deep-link entries
  // with `initialMode: 'photo'` still hit the gate.
  useEffect(() => {
    if (isCaptureBarcodeMode) return;
    if (scanMode !== 'photo') return;
    if (aiSettingQuery.isLoading) return;

    if (!photoModeAvailable) {
      setPhotoGateVisible(true);
      return;
    }

    setPhotoGateVisible(false);
    if (introCheckedRef.current) return;
    introCheckedRef.current = true;
    void (async () => {
      const seen = await hasSeenFoodPhotoIntro();
      if (!seen) {
        navigation.navigate('FoodPhotoIntro', { date });
      }
    })();
  }, [isCaptureBarcodeMode, scanMode, aiSettingQuery.isLoading, photoModeAvailable, navigation, date]);

  const handlePhotoCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: false, quality: 0.7, shutterSound: soundsEnabled });
      if (!photo?.uri) {
        Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to capture photo.' });
        return;
      }
      // Mark seen even if user retakes — the intro shouldn't reappear later.
      await markFoodPhotoIntroSeen();
      navigation.replace('FoodPhotoFlow', {
        screen: 'Improve',
        params: { date, photo: { uri: photo.uri } },
      });
    } catch {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to capture photo.' });
    }
  };

  const handlePhotoPickFromLibrary = async () => {
    // Guard against rapid double-taps re-entering the system picker.
    if (pickerLock.current) return;
    pickerLock.current = true;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 0.7,
        allowsMultipleSelection: false,
      });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset?.uri) {
        Toast.show({ type: 'error', text1: 'Error', text2: 'No photo returned by picker.' });
        return;
      }
      await markFoodPhotoIntroSeen();
      navigation.replace('FoodPhotoFlow', {
        screen: 'Improve',
        params: { date, photo: { uri: asset.uri } },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load photo.';
      Toast.show({ type: 'error', text1: 'Error', text2: msg });
    } finally {
      pickerLock.current = false;
    }
  };

  const handleDismissPhotoGate = () => {
    setPhotoGateVisible(false);
    setScanMode('barcode');
  };

  const handlePhotoGateLogManually = () => {
    setPhotoGateVisible(false);
    navigation.replace('FoodSearch', { date });
  };

  const handleShowManualEntry = () => {
    scanLock.current = true;
    setManualEntryVisible(true);
    setScanned(true);
  };

  const handleDismissManualEntry = () => {
    setManualEntryVisible(false);
    setManualBarcode('');
    setScanned(false);
    scanLock.current = false;
  };

  const handleScanLabel = () => {
    setScanMode('label');
    setScanned(false);
    scanLock.current = false;
  };

  if (!permission) {
    return <View />;
  }

  if (!permission.granted) {
    return (
      <View
        className="flex-1 justify-center items-center px-6"
        style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}
      >
        <Text className="text-text-primary text-base text-center mb-4">
          We need your permission to show the camera
        </Text>
        <Button onPress={requestPermission} title="Grant Permission" />
      </View>
    );
  }

  return (
    <View className="flex-1 flex-col justify-center">
      <CameraView
        ref={cameraRef}
        onBarcodeScanned={scanMode === 'barcode' && !scanned ? handleBarcodeScanned : undefined}
        barcodeScannerSettings={scanMode === 'barcode' ? {
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
        } : undefined}
        style={StyleSheet.absoluteFillObject}
        enableTorch={flashlight}
      />

      {scanMode === 'barcode' && !notFoundBarcode && !lookupError && !loading && !manualEntryVisible ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject} className="justify-center items-center">
          <View style={{ width: GUIDE_WIDTH, height: GUIDE_HEIGHT, marginBottom: 120 }}>
            <View style={{ ...CORNER_STYLE, top: 0, left: 0, borderTopWidth: CORNER_BORDER, borderLeftWidth: CORNER_BORDER, borderTopLeftRadius: 4 }} />
            <View style={{ ...CORNER_STYLE, top: 0, right: 0, borderTopWidth: CORNER_BORDER, borderRightWidth: CORNER_BORDER, borderTopRightRadius: 4 }} />
            <View style={{ ...CORNER_STYLE, bottom: 0, left: 0, borderBottomWidth: CORNER_BORDER, borderLeftWidth: CORNER_BORDER, borderBottomLeftRadius: 4 }} />
            <View style={{ ...CORNER_STYLE, bottom: 0, right: 0, borderBottomWidth: CORNER_BORDER, borderRightWidth: CORNER_BORDER, borderBottomRightRadius: 4 }} />
          </View>
        </View>
      ) : null}

      <View
        className="absolute left-4 right-4 flex-row justify-between items-center"
        style={{ top: Platform.OS === 'android' ? insets.top + 8 : 16 }}
      >
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="bg-black/50 rounded-full p-2"
        >
          <Icon name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setFlashlight(!flashlight)}
          className="bg-black/50 rounded-full p-2"
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Icon
            name={flashlight ? 'flashlight-on' : 'flashlight-off'}
            size={22}
            color={flashlight ? accentPrimary : '#fff'}
          />
        </TouchableOpacity>
      </View>

      {loading || labelProcessing ? (
        <View className="absolute inset-0 justify-center items-center bg-black/40">
          <ActivityIndicator size="large" color="#fff" />
          {labelProcessing ? (
            <Text className="text-white text-base mt-3">Analyzing label...</Text>
          ) : null}
        </View>
      ) : null}

      {capturedPhoto && !labelProcessing ? (
        <View className="absolute inset-0">
          <Image source={{ uri: capturedPhoto.uri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
          <View className="absolute bottom-12 left-4 right-4 flex-row gap-3" style={{ paddingBottom: insets.bottom }}>
            <TouchableOpacity
              onPress={handleRetake}
              className="flex-1 bg-white/20 py-4 rounded-lg items-center"
            >
              <Text className="text-white font-semibold text-base">Retake</Text>
            </TouchableOpacity>
            <UIButton
              variant="primary"
              onPress={() => {
                void handleUsePhoto();
              }}
              className="flex-1 py-4 rounded-lg"
            >
              Use Photo
            </UIButton>
          </View>
        </View>
      ) : null}

      {!isCaptureBarcodeMode && !capturedPhoto && !labelProcessing && !loading && !manualEntryVisible && scanMode === 'barcode' && (notFoundBarcode || lookupError) ? (
        <View
          className="absolute left-0 right-0 items-center px-8"
          style={{ bottom: Math.max(insets.bottom + 8, 24) + 76 }}
        >
          <View className="self-stretch bg-surface rounded-xl p-5 items-center gap-3">
            <Text className="text-text-primary text-base font-semibold">
              {lookupError ? 'Lookup failed' : 'No match for barcode'}
            </Text>
            <Text className="text-text-secondary text-sm text-center">
              {lookupError
                ? lookupError.message
                : 'You can scan the nutrition label or enter it manually.'}
            </Text>
            <View className="gap-3 mt-2 self-stretch">
              <UIButton
                variant="primary"
                onPress={handleScanLabel}
                className="rounded-lg"
                textClassName="text-sm"
              >
                Scan Nutrition Label
              </UIButton>
              <UIButton
                variant="outline"
                onPress={() => navigation.replace(
                  'FoodForm',
                  buildFoodFormParams({
                    barcode: lookupError?.barcode ?? notFoundBarcode ?? undefined,
                  }),
                )}
                className="rounded-lg"
              >
                <Text style={{ fontSize: 14, fontWeight: '600', color: accentPrimary }}>
                  Add Food Manually
                </Text>
              </UIButton>
            </View>
          </View>
        </View>
      ) : null}

      {scanMode === 'photo' && !capturedPhoto && !loading && !manualEntryVisible && !photoGateVisible && photoModeAvailable ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject} className="justify-center items-center">
          <View
            style={{
              width: GUIDE_WIDTH,
              height: GUIDE_WIDTH,
              marginBottom: 120,
              borderWidth: 2,
              borderColor: 'rgba(255,255,255,0.85)',
              borderRadius: 12,
            }}
          />
          <Text
            className="text-white text-sm mt-3"
            style={{ position: 'absolute', bottom: 220 }}
          >
            Frame the whole meal
          </Text>
        </View>
      ) : null}

      {photoGateVisible ? (
        <View
          className="absolute left-0 right-0 items-center px-6"
          style={{ bottom: Math.max(insets.bottom + 8, 24) + 76 }}
        >
          <View className="self-stretch bg-surface rounded-xl p-5 gap-3">
            <Text className="text-text-primary text-base font-semibold">
              AI photo estimates aren&apos;t set up
            </Text>
            <Text className="text-text-secondary text-sm">
              Open SparkyFitness in a browser and visit Settings → AI to add a
              supported AI provider, then return here.
            </Text>
            <View className="gap-2 mt-2">
              <UIButton
                variant="primary"
                onPress={handlePhotoGateLogManually}
                className="rounded-lg"
                textClassName="text-sm"
              >
                Log manually
              </UIButton>
              <UIButton
                variant="ghost"
                onPress={handleDismissPhotoGate}
                className="rounded-lg"
                textClassName="text-sm"
              >
                Not now
              </UIButton>
            </View>
          </View>
        </View>
      ) : null}

      {!capturedPhoto && !labelProcessing && !loading && !manualEntryVisible ? (
        <View
          className="absolute bottom-0 left-0 right-0 items-center gap-4"
          style={{ paddingBottom: Math.max(insets.bottom + 8, 24) }}
        >
          <View className="bg-black/50 rounded-lg mx-8 self-stretch">
            <SegmentedControl
              segments={scanSegments}
              activeKey={scanMode}
              onSelect={handleSegmentChange}
            />
          </View>

          {!(scanMode === 'barcode' && (notFoundBarcode || lookupError)) &&
          !(scanMode === 'photo' && photoGateVisible) ? (
            <View className="h-20 items-center justify-center self-stretch">
              {scanMode === 'barcode' ? (
                <TouchableOpacity
                  onPress={handleShowManualEntry}
                  className="bg-raised px-6 py-3 rounded-xl"
                >
                  <Text className="text-text-primary text-sm font-semibold">Type Barcode Instead</Text>
                </TouchableOpacity>
              ) : null}

              {scanMode === 'label' ? (
                <TouchableOpacity
                  onPress={() => {
                    void handleLabelCapture();
                  }}
                  className="w-20 h-20 rounded-full border-4 border-white items-center justify-center"
                  activeOpacity={0.7}
                >
                  <View className="w-16 h-16 rounded-full bg-white" />
                </TouchableOpacity>
              ) : null}

              {scanMode === 'photo' ? (
                <>
                  {photoModeLoading ? (
                    <ActivityIndicator size="large" color="#fff" />
                  ) : (
                    <TouchableOpacity
                      onPress={() => {
                        void handlePhotoCapture();
                      }}
                      disabled={!photoModeAvailable}
                      className={`w-20 h-20 rounded-full border-4 border-white items-center justify-center ${photoModeAvailable ? '' : 'opacity-40'}`}
                      activeOpacity={0.7}
                    >
                      <View className="w-16 h-16 rounded-full bg-white" />
                    </TouchableOpacity>
                  )}
                  {/* Centered between the capture button and the segmented control's left edge. */}
                  {photoModeAvailable && !photoModeLoading ? (
                    <TouchableOpacity
                      onPress={() => {
                        void handlePhotoPickFromLibrary();
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityLabel="Choose photo from library"
                      accessibilityRole="button"
                      className="bg-black/50 rounded-full items-center justify-center"
                      style={{
                        position: 'absolute',
                        left: '25%',
                        top: 18,
                        width: 44,
                        height: 44,
                        transform: [{ translateX: -26 }],
                      }}
                    >
                      <Icon name="photo-library" size={26} color="#fff" />
                    </TouchableOpacity>
                  ) : null}
                  {/* Centered between the capture button and the segmented control's right edge. */}
                  <TouchableOpacity
                    onPress={() => navigation.navigate('FoodPhotoIntro', { date })}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel="How photo estimation works"
                    accessibilityRole="button"
                    className="bg-black/50 rounded-full items-center justify-center"
                    style={{
                      position: 'absolute',
                      right: '25%',
                      top: 18,
                      width: 44,
                      height: 44,
                      transform: [{ translateX: 26 }],
                    }}
                  >
                    <Icon name="help-circle" size={28} color="#fff" />
                  </TouchableOpacity>
                </>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      <Modal
        visible={manualEntryVisible}
        transparent
        animationType="fade"
        onRequestClose={handleDismissManualEntry}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <ScrollView
            contentContainerClassName="justify-center items-center p-6"
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
            bounces={false}
          >
            <View className="w-full max-w-90 rounded-2xl p-6 bg-surface shadow-sm gap-4">
              <Text className="text-text-primary text-base font-semibold text-center">Enter Barcode</Text>
              <FormInput
                placeholder="Barcode number"
                keyboardType="number-pad"
                autoFocus
                value={manualBarcode}
                onChangeText={setManualBarcode}
                onSubmitEditing={() => {
                  void handleManualSubmit();
                }}
                style={{ textAlign: 'center' }}
              />
              <View className="flex-row gap-3">
                <UIButton
                  variant="ghost"
                  onPress={handleDismissManualEntry}
                  className="flex-1 py-3 rounded-lg"
                  textClassName="text-sm"
                >
                  Cancel
                </UIButton>
                <UIButton
                  variant="primary"
                  disabled={!manualBarcode.trim()}
                  onPress={() => {
                    void handleManualSubmit();
                  }}
                  className="flex-1 py-3 rounded-lg"
                  textClassName="text-sm"
                >
                  {isCaptureBarcodeMode ? 'Use Barcode' : 'Look Up'}
                </UIButton>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

export default FoodScanScreen;

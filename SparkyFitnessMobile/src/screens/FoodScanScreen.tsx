import React, { useEffect, useRef, useState } from 'react';
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
import UIButton from '../components/ui/Button';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import FormInput from '../components/FormInput';
import SegmentedControl, { type Segment } from '../components/SegmentedControl';
import type { RootStackScreenProps } from '../types/navigation';
import type { FoodInfoItem } from '../types/foodInfo';
import { useCSSVariable } from 'uniwind';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { lookupBarcodeV2, scanNutritionLabel } from '../services/api/externalFoodSearchApi';
import { fireSuccessHaptic } from '../services/haptics';
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
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [flashlight, setFlashlight] = useState(false);
  const scanLock = useRef(false);
  const [scanMode, setScanMode] = useState<ScanMode>(
    route.params?.initialMode ?? 'barcode',
  );
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [labelProcessing, setLabelProcessing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<{ base64: string; uri: string } | null>(null);
  const [manualEntryVisible, setManualEntryVisible] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [photoGateVisible, setPhotoGateVisible] = useState(false);
  const introCheckedRef = useRef(false);
  const cameraRef = useRef<CameraView>(null);
  const date = route.params?.date;
  const pickerMode = route.params?.pickerMode ?? 'log-entry';
  const returnDepth = route.params?.returnDepth;
  const isMealBuilderMode = pickerMode === 'meal-builder';

  const aiSettingQuery = useActiveAiServiceSetting({
    enabled: scanMode === 'photo',
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
    try {
      const result = await lookupBarcodeV2(barcode);

      if (!result.food) {
        setNotFoundBarcode(barcode);
      } else if (result.food.id) {
        if (shouldFireSuccessHaptic) {
          fireSuccessHaptic();
        }
        const defaultVariant = result.food.default_variant;
        const item: FoodInfoItem = {
          id: result.food.id,
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
        const defaultVariant = result.food.default_variant;
        navigation.replace(
          'FoodForm',
          buildFoodFormParams({
            barcode,
            providerType: result.source,
            initialFood: {
              name: result.food.name,
              brand: result.food.brand ?? '',
              servingSize: String(defaultVariant.serving_size),
              servingUnit: defaultVariant.serving_unit,
              calories: String(defaultVariant.calories),
              protein: String(defaultVariant.protein),
              carbs: String(defaultVariant.carbs),
              fat: String(defaultVariant.fat),
              fiber: toFormString(defaultVariant.dietary_fiber),
              saturatedFat: toFormString(defaultVariant.saturated_fat),
              sodium: toFormString(defaultVariant.sodium),
              sugars: toFormString(defaultVariant.sugars),
              transFat: toFormString(defaultVariant.trans_fat),
              potassium: toFormString(defaultVariant.potassium),
              cholesterol: toFormString(defaultVariant.cholesterol),
              calcium: toFormString(defaultVariant.calcium),
              iron: toFormString(defaultVariant.iron),
              vitaminA: toFormString(defaultVariant.vitamin_a),
              vitaminC: toFormString(defaultVariant.vitamin_c),
            },
          }),
        );
      }
    } catch {
      setNotFoundBarcode(barcode);
    } finally {
      setLoading(false);
    }
  };

  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (scanLock.current) return;
    scanLock.current = true;
    setScanned(true);
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
    setLoading(true);
    await performBarcodeLookup(barcode);
  };

  const handleLabelCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 });
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
          barcode: notFoundBarcode ?? undefined,
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
    setScanMode(key);
    setNotFoundBarcode(null);
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
  }, [scanMode, aiSettingQuery.isLoading, photoModeAvailable, navigation, date]);

  const handlePhotoCapture = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: false, quality: 0.7 });
      if (!photo?.uri) {
        Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to capture photo.' });
        return;
      }
      // Mark seen even if user retakes — the intro shouldn't reappear later.
      await markFoodPhotoIntroSeen();
      navigation.replace('FoodPhotoImprove', { date, photo: { uri: photo.uri } });
    } catch {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to capture photo.' });
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

      {scanMode === 'barcode' && !notFoundBarcode && !loading && !manualEntryVisible ? (
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

      {!capturedPhoto && !labelProcessing && !loading && !manualEntryVisible && scanMode === 'barcode' && notFoundBarcode ? (
        <View
          className="absolute left-0 right-0 items-center px-8"
          style={{ bottom: Math.max(insets.bottom + 8, 24) + 76 }}
        >
          <View className="self-stretch bg-surface rounded-xl p-5 items-center gap-3">
            <Text className="text-text-primary text-base font-semibold">No match for barcode</Text>
            <Text className="text-text-secondary text-sm text-center">
              You can scan the nutrition label or enter it manually.
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
                    barcode: notFoundBarcode,
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
              provider (Google Gemini), then return here.
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
              segments={SCAN_SEGMENTS}
              activeKey={scanMode}
              onSelect={handleSegmentChange}
            />
          </View>

          {!(scanMode === 'barcode' && notFoundBarcode) &&
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
                  {/* Centered between capture-button right edge and segmented-control right edge.
                      right: 25% lands the button's right edge at W/4 from screen-right;
                      translateX(26) shifts it so its center sits at W/4 - 4 from the right. */}
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
                  Look Up
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

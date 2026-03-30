import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, Button, StyleSheet, ActivityIndicator, Image, Modal, KeyboardAvoidingView, ScrollView } from 'react-native';
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
import { lookupBarcode, scanNutritionLabel } from '../services/api/externalFoodSearchApi';

type FoodScanScreenProps = RootStackScreenProps<'FoodScan'>;

const SCAN_SEGMENTS: Segment<'barcode' | 'label'>[] = [
  { key: 'barcode', label: 'Barcode' },
  { key: 'label', label: 'Nutrition Label' },
];

const GUIDE_WIDTH = 280;
const GUIDE_HEIGHT = 160;

const CORNER_SIZE = 24;
const CORNER_BORDER = 3;
const CORNER_STYLE = { position: 'absolute' as const, width: CORNER_SIZE, height: CORNER_SIZE, borderColor: '#fff' };

const FoodScanScreen: React.FC<FoodScanScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const accentPrimary = String(useCSSVariable('--color-accent-primary'));
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [flashlight, setFlashlight] = useState(false);
  const scanLock = useRef(false);
  const [scanMode, setScanMode] = useState<'barcode' | 'label'>('barcode');
  const [notFoundBarcode, setNotFoundBarcode] = useState<string | null>(null);
  const [labelProcessing, setLabelProcessing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<{ base64: string; uri: string } | null>(null);
  const [manualEntryVisible, setManualEntryVisible] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const cameraRef = useRef<CameraView>(null);

  const performBarcodeLookup = async (barcode: string) => {
    try {
      const result = await lookupBarcode(barcode);

      if (!result.food) {
        setNotFoundBarcode(barcode);
      } else if (result.food.id) {
        const dv = result.food.default_variant;
        const item: FoodInfoItem = {
          id: result.food.id,
          name: result.food.name,
          brand: result.food.brand,
          servingSize: dv.serving_size,
          servingUnit: dv.serving_unit,
          calories: dv.calories,
          protein: dv.protein,
          carbs: dv.carbs,
          fat: dv.fat,
          fiber: dv.dietary_fiber,
          saturatedFat: dv.saturated_fat,
          sodium: dv.sodium,
          sugars: dv.sugars,
          variantId: dv.id,
          source: 'local',
          originalItem: result.food,
        };
        navigation.replace('FoodEntryAdd', { item, date: route.params?.date });
      } else {
        const dv = result.food.default_variant;
        navigation.replace('FoodForm', { mode: 'create-food',
          date: route.params?.date,
          barcode,
          providerType: result.source,
          initialFood: {
            name: result.food.name,
            brand: result.food.brand ?? '',
            servingSize: String(dv.serving_size),
            servingUnit: dv.serving_unit,
            calories: String(dv.calories),
            protein: String(dv.protein),
            carbs: String(dv.carbs),
            fat: String(dv.fat),
            fiber: dv.dietary_fiber != null ? String(dv.dietary_fiber) : '',
            saturatedFat: dv.saturated_fat != null ? String(dv.saturated_fat) : '',
            sodium: dv.sodium != null ? String(dv.sodium) : '',
            sugars: dv.sugars != null ? String(dv.sugars) : '',
          },
        });
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
    await performBarcodeLookup(data);
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
      navigation.replace('FoodForm', { mode: 'create-food',
        date: route.params?.date,
        initialFood: {
          name: result.name || '',
          brand: result.brand || '',
          servingSize: String(result.serving_size ?? ''),
          servingUnit: result.serving_unit || 'g',
          calories: String(result.calories ?? ''),
          protein: String(result.protein ?? ''),
          carbs: String(result.carbs ?? ''),
          fat: String(result.fat ?? ''),
          fiber: result.fiber != null ? String(result.fiber) : '',
          saturatedFat: result.saturated_fat != null ? String(result.saturated_fat) : '',
          sodium: result.sodium != null ? String(result.sodium) : '',
          sugars: result.sugars != null ? String(result.sugars) : '',
        },
        barcode: notFoundBarcode ?? undefined,
        providerType: 'label_scan',
      });
    } catch {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to analyze nutrition label. Please try again.' });
    } finally {
      setLabelProcessing(false);
    }
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
  };

  const handleSegmentChange = (key: 'barcode' | 'label') => {
    setScanMode(key);
    setNotFoundBarcode(null);
    setCapturedPhoto(null);
    setScanned(false);
    scanLock.current = false;
    setManualEntryVisible(false);
    setManualBarcode('');
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
      <View className="flex-1 justify-center items-center px-6" style={Platform.OS === 'android' ? { paddingTop: insets.top } : undefined}>
        <Text className="text-text-primary text-base text-center mb-4">We need your permission to show the camera</Text>
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

      {/* Barcode guide corner brackets */}
      {scanMode === 'barcode' && !notFoundBarcode && !loading && !manualEntryVisible && (
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject} className="justify-center items-center">
          <View style={{ width: GUIDE_WIDTH, height: GUIDE_HEIGHT, marginBottom: 120 }}>
            <View style={{ ...CORNER_STYLE, top: 0, left: 0, borderTopWidth: CORNER_BORDER, borderLeftWidth: CORNER_BORDER, borderTopLeftRadius: 4 }} />
            <View style={{ ...CORNER_STYLE, top: 0, right: 0, borderTopWidth: CORNER_BORDER, borderRightWidth: CORNER_BORDER, borderTopRightRadius: 4 }} />
            <View style={{ ...CORNER_STYLE, bottom: 0, left: 0, borderBottomWidth: CORNER_BORDER, borderLeftWidth: CORNER_BORDER, borderBottomLeftRadius: 4 }} />
            <View style={{ ...CORNER_STYLE, bottom: 0, right: 0, borderBottomWidth: CORNER_BORDER, borderRightWidth: CORNER_BORDER, borderBottomRightRadius: 4 }} />
          </View>
        </View>
      )}

      {/* Top bar: back button + flashlight */}
      <View className="absolute left-4 right-4 flex-row justify-between items-center" style={{ top: Platform.OS === 'android' ? insets.top + 8 : 16 }}>
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
          <Icon name={flashlight ? 'flashlight-on' : 'flashlight-off'} size={22} color={flashlight ? accentPrimary : '#fff'} />
        </TouchableOpacity>
      </View>

      {(loading || labelProcessing) && (
        <View className="absolute inset-0 justify-center items-center bg-black/40">
          <ActivityIndicator size="large" color="#fff" />
          {labelProcessing && (
            <Text className="text-white text-base mt-3">Analyzing label...</Text>
          )}
        </View>
      )}

      {/* Photo preview with Retake / Use Photo */}
      {capturedPhoto && !labelProcessing && (
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
              onPress={handleUsePhoto}
              className="flex-1 py-4 rounded-lg"
            >
              Use Photo
            </UIButton>
          </View>
        </View>
      )}

      {/* No match for barcode — floating card */}
      {!capturedPhoto && !labelProcessing && !loading && !manualEntryVisible && scanMode === 'barcode' && notFoundBarcode && (
        <View
          className="absolute left-0 right-0 items-center px-8"
          style={{ bottom: Math.max(insets.bottom + 8, 24) + 76 }}
        >
          <View className="self-stretch bg-surface rounded-xl p-5 items-center gap-3">
            <Text className="text-text-primary text-base font-semibold">No match for barcode</Text>
            <Text className="text-text-secondary text-sm text-center">You can scan the nutrition label or enter it manually.</Text>
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
                onPress={() => navigation.replace('FoodForm', { mode: 'create-food',
                  date: route.params?.date,
                  barcode: notFoundBarcode,
                })}
                className="rounded-lg"
                textClassName="text-sm"
              >
                Add Food Manually
              </UIButton>
            </View>
          </View>
        </View>
      )}

      {/* Bottom controls: segmented control, shutter */}
      {!capturedPhoto && !labelProcessing && !loading && !manualEntryVisible && (
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

          {!(scanMode === 'barcode' && notFoundBarcode) && (
            <View className="h-20 items-center justify-center">
              {scanMode === 'barcode' && (
                <TouchableOpacity
                  onPress={handleShowManualEntry}
                  className="bg-raised px-6 py-3 rounded-xl"
                >
                  <Text className="text-text-primary text-sm font-semibold">Type Barcode Instead</Text>
                </TouchableOpacity>
              )}

              {scanMode === 'label' && (
                <TouchableOpacity
                  onPress={handleLabelCapture}
                  className="w-20 h-20 rounded-full border-4 border-white items-center justify-center"
                  activeOpacity={0.7}
                >
                  <View className="w-16 h-16 rounded-full bg-white" />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* Manual barcode entry modal */}
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
                onSubmitEditing={handleManualSubmit}
                style={{ textAlign: 'center' }}
              />
              <View className="flex-row gap-3">
                <UIButton
                  variant="outline"
                  onPress={handleDismissManualEntry}
                  className="flex-1 py-3 rounded-lg"
                  textClassName="text-sm"
                >
                  Cancel
                </UIButton>
                <UIButton
                  variant="primary"
                  disabled={!manualBarcode.trim()}
                  onPress={handleManualSubmit}
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

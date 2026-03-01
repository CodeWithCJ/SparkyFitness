import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, Button, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from '../components/Icon';
import type { RootStackScreenProps } from '../types/navigation';
import type { FoodInfoItem } from '../types/foodInfo';
import { useCSSVariable } from 'uniwind';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { lookupBarcode } from '../services/api/externalFoodSearchApi';

type FoodScanScreenProps = RootStackScreenProps<'FoodScan'>;

const FoodScanScreen: React.FC<FoodScanScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const accentPrimary = String(useCSSVariable('--color-accent-primary'));
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [flashlight, setFlashlight] = useState(false);
  const scanLock = useRef(false);

  const handleBarcodeScanned = async ({ data }: BarcodeScanningResult) => {
    if (scanLock.current) return;
    scanLock.current = true;
    setScanned(true);
    setLoading(true);

    try {
      const result = await lookupBarcode(data);

      if (result.source === 'local') {
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
      } else if (result.source === 'openfoodfacts') {
        const dv = result.food.default_variant;
        navigation.replace('ManualFoodEntry', {
          date: route.params?.date,
          barcode: data,
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
      } else {
        Alert.alert('Not Found', 'Product not found for this barcode.');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong looking up this barcode.');
    } finally {
      setLoading(false);
    }
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
        onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        barcodeScannerSettings={{
          barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
        }}
        style={StyleSheet.absoluteFillObject}
        enableTorch={flashlight}
      />

      <View className="absolute left-4 right-4 flex-row items-center justify-between" style={{ top: Platform.OS === 'android' ? insets.top + 8 : 16 }}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          className="z-10"
        >
          <Icon name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>

        <View style={{ width: 22 }} />
      </View>

      {loading && (
        <View className="absolute inset-0 justify-center items-center bg-black/40">
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}

      {scanned && !loading && (
        <View className="absolute bottom-12 left-4 right-4 items-center">
          <Button title="Tap to Scan Again" onPress={() => { scanLock.current = false; setScanned(false); }} />
        </View>
      )}

      <TouchableOpacity
        onPress={() => setFlashlight(!flashlight)}
        className="absolute bottom-12 right-4 bg-black/50 rounded-full p-3"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Icon name={flashlight ? 'flashlight-on' : 'flashlight-off'} size={24} color={flashlight ? accentPrimary : '#fff'} />
      </TouchableOpacity>
    </View>
  );
};

export default FoodScanScreen;

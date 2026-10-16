import { NativeModule, requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/** Raw extraction returned by the Swift module; every value is as printed. */
export interface OnDeviceLabelExtraction {
  name: string;
  brand: string;
  serving_size: number | null;
  serving_unit: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  fiber: number | null;
  saturated_fat: number | null;
  trans_fat: number | null;
  sodium: number | null;
  sugars: number | null;
  cholesterol: number | null;
  potassium: number | null;
  calcium: number | null;
  iron: number | null;
  values_are_per_100: boolean;
  /** Text recognised on the label, to check the extraction against. */
  ocr_text?: string;
}

/** Raw Supplement Facts reading returned by the Swift module. */
export interface OnDeviceSupplementExtraction {
  name: string;
  brand: string;
  form: string | null;
  serving: string | null;
  ingredients: {
    name: string;
    amount: number | null;
    unit: string | null;
  }[];
  /** Text recognised on the label, to check the extraction against. */
  ocr_text?: string;
}

declare class OnDeviceNutritionModuleType extends NativeModule {
  /** True on iOS 27+ with Apple Intelligence enabled and the model ready. */
  isAvailable(): boolean;
  scanLabel(base64Image: string): Promise<OnDeviceLabelExtraction>;
  scanSupplementLabel(
    base64Image: string
  ): Promise<OnDeviceSupplementExtraction>;
}

// iOS only; resolves to null elsewhere and in builds made before the module
// existed, so callers must tolerate null.
const OnDeviceNutritionModule: OnDeviceNutritionModuleType | null =
  Platform.OS === 'ios'
    ? requireOptionalNativeModule<OnDeviceNutritionModuleType>(
        'OnDeviceNutrition'
      )
    : null;

export default OnDeviceNutritionModule;

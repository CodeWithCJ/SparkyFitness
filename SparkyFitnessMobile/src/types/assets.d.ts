// Ambient declarations for non-code assets imported for their side effects.
// `import './global.css'` (the Uniwind/Tailwind entry) is processed by Metro, not
// tsc, so TypeScript needs a module declaration for it. Expo provides the same
// declaration via `expo/types`, but that is only wired up through the git-ignored
// `expo-env.d.ts`, which is not generated in the CI typecheck job — so declare it
// here in a tracked file. Keep this in sync with Expo's asset module declarations.
declare module '*.css';
declare module '*.wav' {
  const asset: number;
  export default asset;
}

// Deep import of the internal WheelPicker used by react-native-ui-datepicker's
// time columns. Metro resolves via the package's "react-native" \u2192 src/index
// field, so the sub-path works at runtime; this declaration satisfies tsc.
declare module 'react-native-ui-datepicker/src/components/time-picker/wheel-picker' {
  import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
  export interface WheelPickerOption {
    value: number | string;
    text: string;
  }
  interface WheelPickerProps {
    value: number | string;
    options: WheelPickerOption[];
    onChange: (value: number | string) => void;
    selectedIndicatorStyle?: StyleProp<ViewStyle>;
    itemTextStyle?: TextStyle;
    itemHeight?: number;
    decelerationRate?: 'normal' | 'fast' | number;
    containerStyle?: StyleProp<ViewStyle>;
  }
  const WheelPicker: React.FC<WheelPickerProps>;
  export default WheelPicker;
}

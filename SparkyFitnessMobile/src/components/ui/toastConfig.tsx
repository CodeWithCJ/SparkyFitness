import { View, Text, TouchableOpacity } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ToastConfig } from 'react-native-toast-message';

type ToastVariant = 'success' | 'error' | 'info';

// Tap actions ride in via Toast.show({ props: { onPress } }); the library's
// own onPress option defaults to a noop, so an action passed there can't be
// told apart from no action.
interface ToastTapProps {
  onPress?: () => void;
}

const variantTokens: Record<ToastVariant, { bg: string; text: string; border: string }> = {
  success: {
    bg: '--color-bg-success',
    // i18n-audit-ignore-next-line hardcoded-ui-text -- CSS variable identifier, not user-visible text.
    text: '--color-text-success',
    border: '--color-bg-success',
  },
  error: {
    bg: '--color-bg-danger',
    // i18n-audit-ignore-next-line hardcoded-ui-text -- CSS variable identifier, not user-visible text.
    text: '--color-text-danger',
    border: '--color-bg-danger',
  },
  info: {
    bg: '--color-surface',
    // i18n-audit-ignore-next-line hardcoded-ui-text -- CSS variable identifier, not user-visible text.
    text: '--color-text-primary',
    border: '--color-accent-primary',
  },
};

function ToastContent({
  variant,
  text1,
  text2,
  onPress,
}: {
  variant: ToastVariant;
  text1?: string;
  text2?: string;
  onPress?: () => void;
}) {
  const tokens = variantTokens[variant];
  const [bgColor, textColor] = useCSSVariable([tokens.bg, tokens.text]) as [
    string,
    string,
  ];

  const body = (
    <View
      style={{
        backgroundColor: bgColor,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginHorizontal: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 4,
        borderRadius: 8,
      }}
    >
      {text1 ? (
        <Text style={{ color: textColor, fontWeight: '600', fontSize: 14 }}>
          {text1}
        </Text>
      ) : null}
      {text2 ? (
        <Text style={{ color: textColor, fontSize: 13, marginTop: 2, opacity: 0.85 }}>
          {text2}
        </Text>
      ) : null}
    </View>
  );

  if (!onPress) return body;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} accessibilityRole="button">
      {body}
    </TouchableOpacity>
  );
}

export const toastConfig: ToastConfig = {
  success: ({ text1, text2, props }) => (
    <ToastContent variant="success" text1={text1} text2={text2} onPress={(props as ToastTapProps | undefined)?.onPress} />
  ),
  error: ({ text1, text2, props }) => (
    <ToastContent variant="error" text1={text1} text2={text2} onPress={(props as ToastTapProps | undefined)?.onPress} />
  ),
  info: ({ text1, text2, props }) => (
    <ToastContent variant="info" text1={text1} text2={text2} onPress={(props as ToastTapProps | undefined)?.onPress} />
  ),
};

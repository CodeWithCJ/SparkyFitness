import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ToastConfig } from 'react-native-toast-message';
import Icon from '../Icon';

type ToastVariant = 'success' | 'error' | 'info' | 'pr';

const variantTokens: Record<ToastVariant, { bg: string; text: string; border: string }> = {
  success: {
    bg: '--color-bg-success',
    text: '--color-text-success',
    border: '--color-bg-success',
  },
  error: {
    bg: '--color-bg-danger',
    text: '--color-text-danger',
    border: '--color-bg-danger',
  },
  info: {
    bg: '--color-surface',
    text: '--color-text-primary',
    border: '--color-accent-primary',
  },
  pr: {
    bg: '--color-bg-pr',
    text: '--color-text-pr',
    border: '--color-pr',
  },
};

function ToastContent({
  variant,
  text1,
  text2,
}: {
  variant: ToastVariant;
  text1?: string;
  text2?: string;
}) {
  const tokens = variantTokens[variant];
  const [bgColor, textColor, prColor] = useCSSVariable([
    tokens.bg,
    tokens.text,
    '--color-pr',
  ]) as [string, string, string];

  const showTrophy = variant === 'pr';

  const textBlock = (
    <View style={{ flex: showTrophy ? 1 : undefined }}>
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

  return (
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
        flexDirection: showTrophy ? 'row' : 'column',
        alignItems: showTrophy ? 'center' : 'stretch',
        gap: showTrophy ? 10 : 0,
      }}
    >
      {showTrophy ? <Icon name="trophy" size={22} color={prColor} /> : null}
      {textBlock}
    </View>
  );
}

export const toastConfig: ToastConfig = {
  success: ({ text1, text2 }) => (
    <ToastContent variant="success" text1={text1} text2={text2} />
  ),
  error: ({ text1, text2 }) => (
    <ToastContent variant="error" text1={text1} text2={text2} />
  ),
  info: ({ text1, text2 }) => (
    <ToastContent variant="info" text1={text1} text2={text2} />
  ),
  pr: ({ text1, text2 }) => (
    <ToastContent variant="pr" text1={text1} text2={text2} />
  ),
};

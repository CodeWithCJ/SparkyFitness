import React from 'react';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import type { ToastConfig } from 'react-native-toast-message';

type ToastVariant = 'success' | 'error' | 'info';

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
  const [bgColor, textColor, borderColor] = useCSSVariable([
    tokens.bg,
    tokens.text,
    tokens.border,
  ]) as [string, string, string];

  return (
    <View
      style={{
        backgroundColor: bgColor,
        borderLeftColor: borderColor,
        borderLeftWidth: 4,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginHorizontal: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 4,
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
};

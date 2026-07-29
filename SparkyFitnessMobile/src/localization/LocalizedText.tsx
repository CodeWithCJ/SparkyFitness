import React, { forwardRef, type ReactNode } from 'react';
import {
  Text as NativeText,
  type TextProps,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { localizeTemplate, localizeText } from './i18n';

function localizeChildren(children: ReactNode): ReactNode {
  if (typeof children === 'string') {
    return localizeText(children);
  }
  if (!Array.isArray(children)) {
    return children;
  }

  const allPrimitive = children.every(
    (child) =>
      typeof child === 'string' ||
      typeof child === 'number' ||
      typeof child === 'bigint',
  );
  if (allPrimitive) {
    const values: unknown[] = [];
    const template = children
      .map((child) => {
        if (typeof child === 'string') return child;
        values.push(child);
        return `{{value${values.length}}}`;
      })
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    return localizeTemplate(template, values);
  }

  return children.map((child) =>
    typeof child === 'string' ? localizeText(child) : child,
  );
}

export const LocalizedText = forwardRef<
  React.ElementRef<typeof NativeText>,
  TextProps
>(({ children, ...props }, ref) => {
  const { i18n } = useTranslation();
  const localizedChildren =
    i18n.resolvedLanguage === 'pl' ? localizeChildren(children) : children;

  return (
    <NativeText ref={ref} {...props}>
      {localizedChildren}
    </NativeText>
  );
});

LocalizedText.displayName = 'LocalizedText';

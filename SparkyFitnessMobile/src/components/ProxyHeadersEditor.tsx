import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text } from 'react-native';
import { useCSSVariable } from 'uniwind';
import Button from './ui/Button';
import Icon from './Icon';
import FormInput from './FormInput';
import type { ProxyHeader } from '../services/storage';

interface ProxyHeadersEditorProps {
  headers: ProxyHeader[];
  onHeadersChange: (headers: ProxyHeader[]) => void;
}

const ProxyHeadersEditor: React.FC<ProxyHeadersEditorProps> = ({
  headers,
  onHeadersChange,
}) => {
  const { t } = useTranslation();
  const [textSecondary, accentPrimary, dangerColor] = useCSSVariable([
    '--color-text-secondary',
    '--color-accent-primary',
    '--color-icon-danger',
  ]) as [string, string, string];
  const [showHeaders, setShowHeaders] = useState<Record<number, boolean>>({});

  const toggleShowHeader = (index: number) => {
    setShowHeaders((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const handleAddHeader = () => {
    onHeadersChange([...headers, { name: '', value: '' }]);
  };

  const handleRemoveHeader = (index: number) => {
    // Visibility is keyed by row index, which shifts on removal; reset it
    // rather than risk another row's hidden value becoming visible.
    setShowHeaders({});
    onHeadersChange(headers.filter((_, i) => i !== index));
  };

  const handleChangeHeader = (
    index: number,
    field: 'name' | 'value',
    text: string
  ) => {
    onHeadersChange(
      headers.map((h, i) => (i === index ? { ...h, [field]: text } : h))
    );
  };

  return (
    <View className="mt-3">
      <View className="flex-row justify-start items-center mb-2">
        <Text className="text-sm font-medium text-text-secondary mr-1">
          {t('auth.proxyHeaders', { defaultValue: 'Proxy Headers' })}
        </Text>
        <Button
          variant="ghost"
          onPress={handleAddHeader}
          accessibilityLabel={t('auth.addHeader', {
            defaultValue: 'Add header',
          })}
          className="py-0 px-0"
        >
          <Icon name="add-circle" size={22} color={accentPrimary} />
        </Button>
      </View>

      {headers.length === 0 && (
        <Text className="text-xs text-text-muted mb-2">
          {t('auth.proxyHeadersHelp', {
            defaultValue: 'Used when running behind certain reverse proxies',
          })}
        </Text>
      )}

      {headers.map((header, index) => (
        <View key={index} className="mb-3">
          <View className="flex-row items-center mb-1.5">
            <FormInput
              className="flex-1 rounded-lg"
              placeholder={t('auth.headerNamePlaceholder', {
                defaultValue: 'Name (e.g. X-Access-Token)',
              })}
              value={header.name}
              onChangeText={(text) => handleChangeHeader(index, 'name', text)}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ fontSize: 14, paddingRight: 36 }}
            />
            <Button
              variant="ghost"
              onPress={() => handleRemoveHeader(index)}
              accessibilityLabel={t('auth.removeHeader', {
                defaultValue: 'Remove header {{number}}',
                number: index + 1,
              })}
              className="absolute right-1 py-0 px-1.5"
            >
              <Icon name="remove-circle" size={18} color={dangerColor} />
            </Button>
          </View>
          <View className="flex-row items-center">
            <FormInput
              className="flex-1 rounded-lg"
              placeholder={t('auth.headerValuePlaceholder', {
                defaultValue: 'Value',
              })}
              value={header.value}
              onChangeText={(text) => handleChangeHeader(index, 'value', text)}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={!showHeaders[index]}
              style={{ fontSize: 14, paddingRight: 40 }}
            />
            <Button
              variant="ghost"
              onPress={() => toggleShowHeader(index)}
              accessibilityLabel={
                showHeaders[index]
                  ? t('auth.hideHeaderValue', {
                      defaultValue: 'Hide header value',
                    })
                  : t('auth.showHeaderValue', {
                      defaultValue: 'Show header value',
                    })
              }
              className="absolute right-1 p-2 py-2 px-2 rounded-lg"
            >
              <Icon
                name={showHeaders[index] ? 'eye-off' : 'eye'}
                size={18}
                color={textSecondary}
              />
            </Button>
          </View>
        </View>
      ))}
    </View>
  );
};

export default ProxyHeadersEditor;

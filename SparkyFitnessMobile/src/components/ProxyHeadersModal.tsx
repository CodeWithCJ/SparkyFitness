import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Alert,
} from 'react-native';
import Button from './ui/Button';
import { useCSSVariable } from 'uniwind';
import Icon from './Icon';
import type { ProxyHeader } from '../services/storage';

interface ProxyHeadersModalProps {
  visible: boolean;
  onClose: () => void;
  headers: ProxyHeader[];
  onSave: (headers: ProxyHeader[]) => void;
}

const ProxyHeadersModal: React.FC<ProxyHeadersModalProps> = ({
  visible,
  onClose,
  headers,
  onSave,
}) => {
  const [textMuted, accentPrimary] = useCSSVariable([
    '--color-text-muted',
    '--color-accent-primary',
  ]) as [string, string];

  const [draft, setDraft] = useState<ProxyHeader[]>([]);

  useEffect(() => {
    if (visible) {
      setDraft(headers.length > 0 ? [...headers] : [{ name: '', value: '' }]);
    }
  }, [visible, headers]);

  const handleAdd = () => {
    setDraft([...draft, { name: '', value: '' }]);
  };

  const handleRemove = (index: number) => {
    setDraft(draft.filter((_, i) => i !== index));
  };

  const handleChange = (index: number, field: 'name' | 'value', text: string) => {
    setDraft(draft.map((h, i) => (i === index ? { ...h, [field]: text } : h)));
  };

  const handleSave = () => {
    const cleaned = draft.filter(h => h.name.trim() && h.value.trim());

    const conflicting = cleaned.find(
      h => h.name.toLowerCase() === 'authorization' || h.name.toLowerCase() === 'content-type'
    );
    if (conflicting) {
      Alert.alert(
        'Reserved Header',
        `"${conflicting.name}" may conflict with headers set by the app. Continue anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save Anyway', onPress: () => { onSave(cleaned); onClose(); } },
        ]
      );
      return;
    }

    onSave(cleaned);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerClassName="justify-center items-center p-6"
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
          bounces={false}
        >
          <View className="w-full max-w-90 rounded-2xl p-6 bg-surface shadow-sm">
            <View className="flex-row justify-between items-center mb-5">
              <Text className="text-[22px] font-bold text-text-primary">Proxy Headers</Text>
              <Button
                variant="ghost"
                onPress={handleAdd}
                accessibilityLabel="Add header"
                className="py-0 px-0"
              >
                <Icon name="add-circle" size={28} color={accentPrimary} />
              </Button>
            </View>

            {draft.length === 0 && (
              <Text className="text-sm text-text-muted text-center mb-4">
                No proxy headers configured. Tap + to add one.
              </Text>
            )}

            {draft.map((header, index) => (
              <View key={index} className="mb-3 border border-border-subtle rounded-lg p-3 bg-raised">
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-xs text-text-secondary font-medium">Header {index + 1}</Text>
                  <Button
                    variant="ghost"
                    onPress={() => handleRemove(index)}
                    accessibilityLabel={`Remove header ${index + 1}`}
                    className="py-0 px-0"
                  >
                    <Icon name="remove-circle" size={18} color="#ef4444" />
                  </Button>
                </View>
                <TextInput
                  className="border border-border-subtle rounded-md p-2 mb-2 text-base text-text-primary bg-surface"
                  placeholder="Header name (e.g. X-Access-Token)"
                  placeholderTextColor={textMuted}
                  value={header.name}
                  onChangeText={(text) => handleChange(index, 'name', text)}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  className="border border-border-subtle rounded-md p-2 text-base text-text-primary bg-surface"
                  placeholder="Header value"
                  placeholderTextColor={textMuted}
                  value={header.value}
                  onChangeText={(text) => handleChange(index, 'value', text)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                />
              </View>
            ))}

            <View className="flex-row gap-3 mt-2">
              <Button
                variant="ghost"
                onPress={onClose}
                className="flex-1 py-2.5"
                textClassName="text-text-secondary"
              >
                Cancel
              </Button>

              <Button
                variant="primary"
                onPress={handleSave}
                className="flex-1"
                textClassName="text-[17px]"
              >
                Save
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default ProxyHeadersModal;

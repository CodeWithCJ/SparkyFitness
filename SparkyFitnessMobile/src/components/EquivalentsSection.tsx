import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import BottomSheetPicker from './BottomSheetPicker';
import Button from './ui/Button';
import FormInput from './FormInput';
import Icon from './Icon';
import type { EquivalentUnit } from '../types/foodUnitVariants';
import { SERVING_UNIT_SECTIONS } from '../utils/foodFormState';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';

let equivalentKeyCounter = 0;
function makeEquivalentKey(): string {
  equivalentKeyCounter += 1;
  return `eq-${equivalentKeyCounter}`;
}

export interface EquivalentsSectionProps {
  items: EquivalentUnit[];
  onChange: (next: EquivalentUnit[]) => void;
  disabled?: boolean;
  textMuted: string;
  accentColor: string;
}

const EquivalentsSection: React.FC<EquivalentsSectionProps> = ({
  items,
  onChange,
  disabled = false,
  textMuted,
  accentColor,
}) => {
  const updateRow = (index: number, patch: Partial<EquivalentUnit>) => {
    const next = items.slice();
    next[index] = { ...next[index], ...patch };
    onChange(next);
  };

  const removeRow = (index: number) => {
    const next = items.slice();
    next.splice(index, 1);
    onChange(next);
  };

  const addRow = () => {
    onChange([
      ...items,
      { serving_size: 0, serving_unit: '', _clientKey: makeEquivalentKey() },
    ]);
  };

  return (
    <View className="gap-2 mt-1.5" pointerEvents={disabled ? 'none' : 'auto'} style={disabled ? { opacity: 0.5 } : undefined}>
      <Text className="text-text-secondary text-sm font-medium">
        Equivalent sizes
      </Text>
      {items.map((item, index) => {
        const sizeText =
          item._sizeText ?? (item.serving_size > 0 ? String(item.serving_size) : '');
        return (
          <View
            key={item.id ?? item._clientKey ?? `idx-${index}`}
            className="flex-row gap-2 items-center"
          >
            <View className="flex-1">
              <FormInput
                placeholder="0"
                value={sizeText}
                onChangeText={(text) => {
                  if (!DECIMAL_INPUT_REGEX.test(text)) return;
                  updateRow(index, {
                    _sizeText: text,
                    serving_size: parseDecimalInput(text) || 0,
                  });
                }}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>
            <View className="flex-1">
              <BottomSheetPicker
                value={item.serving_unit}
                sections={SERVING_UNIT_SECTIONS}
                onSelect={(value) => updateRow(index, { serving_unit: value })}
                title="Select Unit"
                placeholder="unit"
                renderTrigger={({ onPress, selectedOption }) => (
                  <TouchableOpacity
                    onPress={onPress}
                    activeOpacity={0.7}
                    className="bg-raised rounded-lg border border-border-subtle px-3 py-2.5 flex-row items-center justify-between"
                    style={{ height: 44 }}
                  >
                    <Text
                      className={selectedOption ? 'text-text-primary' : 'text-text-muted'}
                      style={{ fontSize: 16 }}
                    >
                      {selectedOption?.label ?? 'unit'}
                    </Text>
                    <Icon
                      name="chevron-down"
                      size={12}
                      color={textMuted}
                      weight="medium"
                    />
                  </TouchableOpacity>
                )}
              />
            </View>
            <TouchableOpacity
              onPress={() => removeRow(index)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Remove equivalent"
            >
              <Icon name="remove-circle" size={22} color={textMuted} />
            </TouchableOpacity>
          </View>
        );
      })}
      <Button
        variant="ghost"
        onPress={addRow}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        className="self-start py-0 px-0"
      >
        <Text style={{ color: accentColor }} className="text-sm font-medium">
          + Add equivalent
        </Text>
      </Button>
    </View>
  );
};

export default EquivalentsSection;

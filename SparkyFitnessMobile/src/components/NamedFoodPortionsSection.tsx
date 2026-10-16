import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getFoodPortionUnit } from '@workspace/shared';
import type { EditableFoodPortion } from '../utils/namedFoodPortions';
import { formatLocalizedNumber } from '../localization';
import { DECIMAL_INPUT_REGEX, parseDecimalInput } from '../utils/numericInput';
import Button from './ui/Button';
import FormInput from './FormInput';

interface Props {
  items: readonly EditableFoodPortion[];
  onChange: (items: EditableFoodPortion[]) => void;
  servingUnit: string;
  disabled?: boolean;
}

export default function NamedFoodPortionsSection({
  items,
  onChange,
  servingUnit,
  disabled = false,
}: Props) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const unit = getFoodPortionUnit(servingUnit);
  const parsedAmount = parseDecimalInput(amount);
  const normalizedName = name.trim().replace(/\s+/g, ' ');
  const valid =
    !!unit &&
    !!normalizedName &&
    normalizedName.length <= 80 &&
    !/[()\r\n]/.test(name) &&
    Number.isFinite(parsedAmount) &&
    parsedAmount > 0 &&
    !items.some(
      (item) =>
        item.name.trim().replace(/\s+/g, ' ').toLowerCase() ===
        normalizedName.toLowerCase()
    );
  const add = () => {
    if (!valid || !unit) return;
    onChange([...items, { name: normalizedName, amount: parsedAmount, unit }]);
    setName('');
    setAmount('');
    setAdding(false);
  };
  return (
    <View className="gap-2 mt-3">
      <Text className="text-text-primary font-semibold">
        {t('foodForm.portions.title', { defaultValue: 'Named portions' })}
      </Text>
      <Text className="text-text-secondary text-sm">
        {t('foodForm.portions.help', {
          defaultValue:
            'Keep this food in grams or milliliters and add portions such as a packet or bottle.',
        })}
      </Text>
      {items.map((item, index) => (
        <View
          key={item.id ?? `${item.name}-${index}`}
          className="flex-row items-center justify-between gap-2"
        >
          <Text className="text-text-primary flex-1">{`1 ${item.name} = ${formatLocalizedNumber(item.amount)} ${item.unit}`}</Text>
          <TouchableOpacity
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={t('foodForm.portions.remove', {
              defaultValue: 'Remove portion {{name}}',
              name: item.name,
            })}
            onPress={() =>
              onChange(items.filter((_, itemIndex) => itemIndex !== index))
            }
            className="p-2"
          >
            <Text className="text-text-secondary">
              {t('common.remove', { defaultValue: 'Remove' })}
            </Text>
          </TouchableOpacity>
        </View>
      ))}
      {!unit ? (
        <Text className="text-text-secondary text-sm">
          {t('foodForm.portions.metricReference', {
            defaultValue:
              'Select a gram or milliliter serving to define portion sizes.',
          })}
        </Text>
      ) : adding ? (
        <View className="gap-2">
          <FormInput
            accessibilityLabel={t('foodForm.portions.name', {
              defaultValue: 'Portion name',
            })}
            placeholder={t('foodForm.portions.namePlaceholder', {
              defaultValue: 'e.g. packet',
            })}
            value={name}
            onChangeText={setName}
            editable={!disabled}
          />
          <View className="flex-row items-center gap-2">
            <Text className="text-text-primary">
              {t('foodForm.portions.equals', { defaultValue: '1 portion =' })}
            </Text>
            <FormInput
              className="flex-1"
              accessibilityLabel={t('foodForm.portions.amount', {
                defaultValue: 'Portion amount',
              })}
              placeholder="0"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={(value) => {
                if (DECIMAL_INPUT_REGEX.test(value)) setAmount(value);
              }}
              editable={!disabled}
            />
            <Text className="text-text-primary">{unit}</Text>
          </View>
          <View className="flex-row gap-2">
            <Button onPress={add} disabled={disabled || !valid}>
              {t('foodForm.portions.confirm', { defaultValue: 'Add portion' })}
            </Button>
            <Button variant="ghost" onPress={() => setAdding(false)}>
              {t('common.cancel', { defaultValue: 'Cancel' })}
            </Button>
          </View>
        </View>
      ) : (
        <Button
          variant="ghost"
          className="self-start"
          disabled={disabled}
          onPress={() => setAdding(true)}
        >
          {t('foodForm.portions.add', { defaultValue: '+ Add portion' })}
        </Button>
      )}
    </View>
  );
}

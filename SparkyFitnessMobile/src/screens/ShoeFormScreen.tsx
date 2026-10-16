import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useCSSVariable } from 'uniwind';
import {
  DEFAULT_SHOE_RETIREMENT_DISTANCE_KM,
  type CreateShoeBody,
  type ShoeResponse,
} from '@workspace/shared';

import CalendarSheet, {
  type CalendarSheetRef,
} from '../components/CalendarSheet';
import FormInput from '../components/FormInput';
import Icon from '../components/Icon';
import StatusView from '../components/StatusView';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { usePreferences } from '../hooks/usePreferences';
import { useShoeMutations, useShoes } from '../hooks/useShoes';
import { getAppLocale } from '../localization';
import { addLog } from '../services/LogService';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { formatDate, toLocalDateString } from '../utils/dateUtils';
import { kmToMiles, milesToKm } from '../utils/unitConversions';
import type { RootStackScreenProps } from '../types/navigation';

type Props = RootStackScreenProps<'ShoeForm'>;

const parseNumber = (text: string): number | null => {
  const n = Number(text.replace(',', '.').trim());
  return text.trim() !== '' && Number.isFinite(n) ? n : null;
};

const FieldLabel: React.FC<{ title: string }> = ({ title }) => (
  <Text className="text-base font-semibold text-text-primary mb-2">
    {title}
  </Text>
);

const toDisplay = (km: number, unit: 'km' | 'miles') =>
  String(Math.round((unit === 'miles' ? kmToMiles(km) : km) * 10) / 10);

const ShoeForm: React.FC<{
  shoe: ShoeResponse | null;
  distanceUnit: 'km' | 'miles';
  onDone: () => void;
}> = ({ shoe, distanceUnit, onDone }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const { createMutation, updateMutation, deleteMutation } = useShoeMutations();
  const unitLabel = distanceUnit === 'miles' ? 'mi' : 'km';
  const calendarSheetRef = useRef<CalendarSheetRef>(null);
  const [accentPrimary, borderSubtle, raisedBg] = useCSSVariable([
    '--color-accent-primary',
    '--color-border-subtle',
    '--color-raised',
  ]) as [string, string, string];

  const [name, setName] = useState(shoe?.name ?? '');
  const [brand, setBrand] = useState(shoe?.brand ?? '');
  const [model, setModel] = useState(shoe?.model ?? '');
  const [nickname, setNickname] = useState(shoe?.nickname ?? '');
  const [purchaseDate, setPurchaseDate] = useState(shoe?.purchase_date ?? '');
  const [purchasePrice, setPurchasePrice] = useState(
    shoe?.purchase_price != null ? String(shoe.purchase_price) : ''
  );
  const [startingDistance, setStartingDistance] = useState(
    shoe ? toDisplay(shoe.starting_distance_km, distanceUnit) : '0'
  );
  const [retirementDistance, setRetirementDistance] = useState(
    toDisplay(
      shoe?.retirement_distance_km ?? DEFAULT_SHOE_RETIREMENT_DISTANCE_KM,
      distanceUnit
    )
  );
  const [isDefault, setIsDefault] = useState(shoe?.is_default ?? false);

  const starting = parseNumber(startingDistance || '0');
  const retirement = parseNumber(retirementDistance);
  const price = purchasePrice.trim() === '' ? null : parseNumber(purchasePrice);
  const errors = {
    name: name.trim() === '',
    starting: starting == null || starting < 0,
    retirement: retirement == null || retirement <= 0,
    price: purchasePrice.trim() !== '' && (price == null || price < 0),
  };
  const hasErrors = Object.values(errors).some(Boolean);
  const isSaving = createMutation.isPending || updateMutation.isPending;
  // Any of the three at once would navigate back twice or race each other.
  const isBusy = isSaving || deleteMutation.isPending;

  const toKm = (value: number) =>
    distanceUnit === 'miles' ? milesToKm(value) : value;
  const optionalText = (value: string) => value.trim() || null;

  const handleError = (error: unknown) => {
    addLog('Failed to save shoe', 'ERROR', [String(error)]);
    Toast.show({
      type: 'error',
      text1: t('shoes.saveFailed', { defaultValue: 'Failed to save shoe' }),
      text2: t('common.tryAgain', { defaultValue: 'Please try again.' }),
    });
  };

  const handleSave = () => {
    if (hasErrors || starting == null || retirement == null) return;
    const data: CreateShoeBody = {
      name: name.trim(),
      brand: optionalText(brand),
      model: optionalText(model),
      nickname: optionalText(nickname),
      purchase_date: purchaseDate || null,
      purchase_price: price,
      // An untouched field keeps the stored km value: converting the rounded
      // display string back would drift it.
      starting_distance_km:
        shoe &&
        startingDistance === toDisplay(shoe.starting_distance_km, distanceUnit)
          ? shoe.starting_distance_km
          : toKm(starting),
      retirement_distance_km:
        shoe &&
        retirementDistance ===
          toDisplay(shoe.retirement_distance_km, distanceUnit)
          ? shoe.retirement_distance_km
          : toKm(retirement),
      is_default: isDefault,
    };
    if (shoe) {
      // The update mutation reports its own failures.
      updateMutation.mutate({ id: shoe.id, data }, { onSuccess: onDone });
    } else {
      createMutation.mutate(data, { onSuccess: onDone, onError: handleError });
    }
  };

  const handleToggleRetired = () => {
    if (!shoe || isBusy) return;
    updateMutation.mutate(
      {
        id: shoe.id,
        data: { status: shoe.status === 'retired' ? 'active' : 'retired' },
      },
      { onSuccess: onDone }
    );
  };

  const handleDelete = () => {
    if (!shoe || isBusy) return;
    Alert.alert(
      t('shoes.deleteTitle', { defaultValue: 'Delete this shoe?' }),
      t('shoes.deleteDescription', {
        defaultValue:
          'Runs logged with this pair stay in your diary, but they will no longer be linked to a shoe.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () =>
            deleteMutation.mutate(shoe.id, {
              onSuccess: onDone,
              onError: handleError,
            }),
        },
      ]
    );
  };

  const errorText = (message: string) => (
    <Text className="text-sm text-red-500 mt-1">{message}</Text>
  );

  return (
    <>
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <FieldLabel title={t('shoes.name', { defaultValue: 'Name' })} />
          <FormInput
            value={name}
            onChangeText={setName}
            maxLength={120}
            returnKeyType="next"
            accessibilityLabel={t('shoes.name', { defaultValue: 'Name' })}
          />
          {errors.name &&
            errorText(
              t('shoes.nameRequired', { defaultValue: 'Enter a name.' })
            )}
          <View className="mt-4">
            <FieldLabel title={t('shoes.brand', { defaultValue: 'Brand' })} />
            <FormInput
              value={brand}
              onChangeText={setBrand}
              maxLength={120}
              accessibilityLabel={t('shoes.brand', { defaultValue: 'Brand' })}
            />
          </View>
          <View className="mt-4">
            <FieldLabel title={t('shoes.model', { defaultValue: 'Model' })} />
            <FormInput
              value={model}
              onChangeText={setModel}
              maxLength={120}
              accessibilityLabel={t('shoes.model', { defaultValue: 'Model' })}
            />
          </View>
          <View className="mt-4">
            <FieldLabel
              title={t('shoes.nickname', { defaultValue: 'Nickname' })}
            />
            <FormInput
              value={nickname}
              onChangeText={setNickname}
              maxLength={120}
              accessibilityLabel={t('shoes.nickname', {
                defaultValue: 'Nickname',
              })}
            />
          </View>
        </View>

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <FieldLabel
            title={t('shoes.startingDistance', {
              defaultValue: 'Starting mileage ({{unit}})',
              unit: unitLabel,
            })}
          />
          <FormInput
            value={startingDistance}
            onChangeText={setStartingDistance}
            keyboardType="decimal-pad"
            maxLength={8}
            returnKeyType="done"
            accessibilityLabel={t('shoes.startingDistance', {
              defaultValue: 'Starting mileage ({{unit}})',
              unit: unitLabel,
            })}
          />
          {errors.starting &&
            errorText(
              t('shoes.startingInvalid', {
                defaultValue: 'Enter 0 or more.',
              })
            )}
          <View className="mt-4">
            <FieldLabel
              title={t('shoes.retireAt', {
                defaultValue: 'Retire at ({{unit}})',
                unit: unitLabel,
              })}
            />
            <FormInput
              value={retirementDistance}
              onChangeText={setRetirementDistance}
              keyboardType="decimal-pad"
              maxLength={8}
              returnKeyType="done"
              accessibilityLabel={t('shoes.retireAt', {
                defaultValue: 'Retire at ({{unit}})',
                unit: unitLabel,
              })}
            />
            {errors.retirement &&
              errorText(
                t('shoes.retireInvalid', {
                  defaultValue: 'Enter a distance above 0.',
                })
              )}
          </View>
        </View>

        <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
          <FieldLabel
            title={t('shoes.purchaseDate', { defaultValue: 'Purchase date' })}
          />
          <View className="flex-row items-center">
            <Pressable
              onPress={() => calendarSheetRef.current?.present()}
              accessibilityRole="button"
              accessibilityLabel={t('shoes.purchaseDate', {
                defaultValue: 'Purchase date',
              })}
              className="flex-1 flex-row items-center justify-between rounded-lg"
              style={{
                backgroundColor: raisedBg,
                borderWidth: 1,
                borderColor: borderSubtle,
                paddingVertical: 10,
                paddingHorizontal: 12,
              }}
            >
              <Text
                className={
                  purchaseDate
                    ? 'text-base text-text-primary'
                    : 'text-base text-text-muted'
                }
              >
                {purchaseDate
                  ? formatDate(purchaseDate, getAppLocale())
                  : t('shoes.selectDate', { defaultValue: 'Select date' })}
              </Text>
              <Icon name="chevron-down" size={16} color={accentPrimary} />
            </Pressable>
            {purchaseDate ? (
              <Button
                variant="ghost"
                onPress={() => setPurchaseDate('')}
                accessibilityLabel={t('shoes.clearDate', {
                  defaultValue: 'Clear date',
                })}
              >
                {t('shoes.clearDate', { defaultValue: 'Clear date' })}
              </Button>
            ) : null}
          </View>
          <View className="mt-4">
            <FieldLabel
              title={t('shoes.purchasePrice', { defaultValue: 'Price' })}
            />
            <FormInput
              value={purchasePrice}
              onChangeText={setPurchasePrice}
              keyboardType="decimal-pad"
              maxLength={10}
              returnKeyType="done"
              accessibilityLabel={t('shoes.purchasePrice', {
                defaultValue: 'Price',
              })}
            />
            {errors.price &&
              errorText(
                t('shoes.priceInvalid', { defaultValue: 'Enter 0 or more.' })
              )}
          </View>
        </View>

        <SettingsRowGroup>
          <SettingsRow
            title={t('shoes.useAsDefault', {
              defaultValue: 'Use as my default pair',
            })}
            subtitle={t('shoes.useAsDefaultHint', {
              defaultValue:
                'New recorded runs, outdoor or indoor, are logged with your default pair.',
            })}
            subtitleNumberOfLines={0}
            rightAccessory={
              <Switch
                value={isDefault}
                onValueChange={setIsDefault}
                disabled={shoe?.status === 'retired'}
                accessibilityLabel={t('shoes.useAsDefault', {
                  defaultValue: 'Use as my default pair',
                })}
              />
            }
          />
        </SettingsRowGroup>

        <Button
          variant="primary"
          onPress={handleSave}
          loading={isSaving}
          disabled={hasErrors || isBusy}
        >
          {t('common.save', { defaultValue: 'Save' })}
        </Button>

        {shoe && (
          <View className="mt-3">
            <Button
              variant="outline"
              onPress={handleToggleRetired}
              disabled={isBusy}
            >
              {shoe.status === 'retired'
                ? t('shoes.reactivate', { defaultValue: 'Reactivate' })
                : t('shoes.retire', { defaultValue: 'Retire' })}
            </Button>
            <View className="mt-3">
              <Button
                variant="destructive"
                onPress={handleDelete}
                disabled={isBusy}
              >
                {t('common.delete', { defaultValue: 'Delete' })}
              </Button>
            </View>
          </View>
        )}
      </ScrollView>
      <CalendarSheet
        ref={calendarSheetRef}
        selectedDate={purchaseDate || toLocalDateString(new Date())}
        onSelectDate={setPurchaseDate}
      />
    </>
  );
};

const ShoeFormScreen: React.FC<Props> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { preferences } = usePreferences();
  const distanceUnit =
    (preferences?.default_distance_unit as 'km' | 'miles') ?? 'km';
  const shoeId = route.params?.shoeId;
  const { shoes, isLoading, isError, refetch } = useShoes();
  const shoe = shoeId ? (shoes.find((s) => s.id === shoeId) ?? null) : null;

  const header = useScreenHeader({
    title: shoeId
      ? t('shoes.editShoe', { defaultValue: 'Edit shoe' })
      : t('shoes.addShoe', { defaultValue: 'Add shoe' }),
    left: { kind: 'back' },
  });

  // Wait for the list before mounting the form so its fields start from the
  // saved values instead of a blank pair.
  const ready = !shoeId || (!isLoading && !isError && shoe !== null);

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {ready ? (
        <ShoeForm
          key={shoe?.id ?? 'new-shoe'}
          shoe={shoe}
          distanceUnit={distanceUnit}
          onDone={() => navigation.goBack()}
        />
      ) : isLoading ? (
        <StatusView loading />
      ) : (
        <StatusView
          icon="alert-circle"
          iconTone="danger"
          title={
            isError
              ? t('shoes.loadFailed', {
                  defaultValue: 'Could not load your shoes.',
                })
              : t('shoes.notFound', { defaultValue: 'Shoe not found.' })
          }
          action={{
            label: t('common.retry', { defaultValue: 'Retry' }),
            onPress: () => void refetch(),
          }}
        />
      )}
    </View>
  );
};

export default ShoeFormScreen;

import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  Pressable,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  BARCODE_FALLBACK_PROVIDER_ID,
  barcodeNutritionPreview,
  type BarcodeAlternativesResponse,
  type BarcodeCandidate,
} from '@workspace/shared';
import { formatLocalizedNumber } from '../localization';
import { fetchBarcodeAlternatives } from '../services/api/barcodeLookupApi';
import { getActiveServerConfig } from '../services/storage';
import {
  barcodeResultToFoodInfo,
  type BarcodeLookupContext,
} from '../utils/barcodeFoods';
import type { FoodInfoItem } from '../types/foodInfo';

interface Props {
  context: BarcodeLookupContext;
  disabled?: boolean;
  onSelect: (item: FoodInfoItem, context: BarcodeLookupContext) => void;
}

export default function BarcodeSources({ context, disabled, onSelect }: Props) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [data, setData] = useState<BarcodeAlternativesResponse | null>(null);
  const mounted = useRef(true);
  const request = useRef(0);
  const actionLock = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const isCurrent = async (id: number, accountId: string | undefined) => {
    const currentAccountId = (await getActiveServerConfig())?.id;
    return (
      mounted.current &&
      id === request.current &&
      accountId === currentAccountId
    );
  };

  const run = async (
    action: (accountId: string | undefined, id: number) => Promise<void>
  ) => {
    if (actionLock.current || disabled) return;
    actionLock.current = true;
    const id = ++request.current;
    setBusy(true);
    setError(false);
    try {
      const accountId = (await getActiveServerConfig())?.id;
      if (!mounted.current || id !== request.current) return;
      if (context.accountId && accountId !== context.accountId) {
        setVisible(false);
        setData(null);
        throw new Error('Account changed');
      }
      await action(accountId, id);
    } catch {
      if (mounted.current && id === request.current) setError(true);
    } finally {
      actionLock.current = false;
      if (mounted.current && id === request.current) setBusy(false);
    }
  };

  const load = () => {
    void run(async (accountId, id) => {
      setVisible(true);
      if (data) return;
      const result = await fetchBarcodeAlternatives(context.barcode);
      if (!(await isCurrent(id, accountId))) return;
      setData(result);
    });
  };

  const choose = (candidate: BarcodeCandidate) =>
    void run(async (accountId, id) => {
      if (
        !candidate.food ||
        candidate.status !== 'found' ||
        !(await isCurrent(id, accountId))
      )
        return;
      setVisible(false);
      onSelect(
        barcodeResultToFoodInfo(
          { source: candidate.source, food: candidate.food },
          context.barcode
        ),
        {
          ...context,
          accountId,
          providerId: candidate.providerId,
          providerName: candidate.providerName,
        }
      );
    });

  const number = (value: number | null) =>
    value == null
      ? t('barcodeSources.unknown', { defaultValue: '—' })
      : formatLocalizedNumber(value, { maximumFractionDigits: 1 });
  const alternatives =
    data?.results.filter(
      (candidate) => candidate.providerId !== context.providerId
    ) ?? [];

  return (
    <View className="gap-2 rounded-xl bg-surface p-3">
      <Text className="text-sm text-text-secondary">
        {t('barcodeSources.currentSource', {
          defaultValue: 'Source: {{name}}',
          name:
            context.providerName ??
            (context.providerId === 'local'
              ? t('barcodeSources.local', { defaultValue: 'Your foods' })
              : t('barcodeSources.external', {
                  defaultValue: 'Online provider',
                })),
        })}
      </Text>
      {context.providerId === BARCODE_FALLBACK_PROVIDER_ID && (
        <Text className="text-sm text-text-secondary">
          {t('barcodeSources.fallback', {
            defaultValue: 'Open Food Facts fallback',
          })}
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={busy || disabled}
        onPress={load}
        className="min-h-11 justify-center"
      >
        <Text className="text-accent-primary">
          {t('barcodeSources.otherSources', { defaultValue: 'Other sources' })}
        </Text>
      </Pressable>
      {error && !visible && (
        <Text accessibilityRole="alert" className="text-sm text-text-secondary">
          {t('barcodeSources.error', {
            defaultValue: 'Could not load barcode sources. Please try again.',
          })}
        </Text>
      )}
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <View className="flex-1 justify-end bg-black/40">
          <View className="max-h-[85%] rounded-t-2xl bg-background p-5 pb-8">
            <Text className="text-lg font-semibold text-text-primary">
              {t('barcodeSources.otherSources', {
                defaultValue: 'Other sources',
              })}
            </Text>
            <Text className="text-sm text-text-secondary my-2">
              {t('barcodeSources.comparison', {
                defaultValue:
                  'Compare the labeled amount for each result. Grams and milliliters are different bases.',
              })}
            </Text>
            {busy && <ActivityIndicator />}
            {error && (
              <Pressable
                accessibilityRole="button"
                onPress={load}
                className="min-h-11 justify-center"
              >
                <Text className="text-accent-primary">
                  {t('barcodeSources.retry', {
                    defaultValue: 'Could not load sources. Tap to retry.',
                  })}
                </Text>
              </Pressable>
            )}
            {data && !busy && !error && alternatives.length === 0 && (
              <Text className="my-4 text-sm text-text-secondary">
                {t('barcodeSources.empty', {
                  defaultValue: 'No other sources available',
                })}
              </Text>
            )}
            <ScrollView>
              {alternatives.map((candidate) => {
                const preview = candidate.food
                  ? barcodeNutritionPreview(candidate.food)
                  : null;
                return (
                  <Pressable
                    key={candidate.providerId}
                    accessibilityRole="button"
                    disabled={
                      busy ||
                      disabled ||
                      candidate.status !== 'found' ||
                      !candidate.food
                    }
                    onPress={() => choose(candidate)}
                    className="my-2 gap-1 rounded-xl bg-surface p-4"
                  >
                    <Text className="font-semibold text-text-primary">
                      {candidate.providerName}
                    </Text>
                    {candidate.providerId === BARCODE_FALLBACK_PROVIDER_ID && (
                      <Text className="text-sm text-text-secondary">
                        {t('barcodeSources.fallback', {
                          defaultValue: 'Open Food Facts fallback',
                        })}
                      </Text>
                    )}
                    <Text className="text-text-primary">
                      {candidate.food?.name ??
                        (candidate.status === 'error'
                          ? t('barcodeSources.providerError', {
                              defaultValue: 'Source unavailable',
                            })
                          : t('barcodeSources.noMatch', {
                              defaultValue: 'No match',
                            }))}
                    </Text>
                    {candidate.food?.brand && (
                      <Text className="text-sm text-text-secondary">
                        {candidate.food.brand}
                      </Text>
                    )}
                    {preview && (
                      <>
                        <Text className="text-sm text-text-secondary">
                          {t('barcodeSources.basis', {
                            defaultValue: 'Per {{size}} {{unit}}',
                            size: number(preview.servingSize),
                            unit: preview.servingUnit,
                          })}
                        </Text>
                        <Text className="text-sm text-text-primary">
                          {t('barcodeSources.macros', {
                            defaultValue:
                              '{{calories}} kcal · Protein {{protein}} g · Carbs {{carbs}} g · Fat {{fat}} g',
                            calories: number(preview.calories),
                            protein: number(preview.protein),
                            carbs: number(preview.carbs),
                            fat: number(preview.fat),
                          })}
                        </Text>
                      </>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable
              accessibilityRole="button"
              onPress={() => setVisible(false)}
              className="min-h-11 justify-center"
            >
              <Text className="text-accent-primary">
                {t('common.close', { defaultValue: 'Close' })}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

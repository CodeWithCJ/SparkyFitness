import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import BottomSheetPicker from '../components/BottomSheetPicker';
import ComplicationColorPicker from '../components/ComplicationColorPicker';
import ComplicationPreview from '../components/ComplicationPreview';
import FormInput from '../components/FormInput';
import { FooterSaveBar } from '../components/FormScreenChrome';
import SegmentedControl from '../components/SegmentedControl';
import SettingsRow from '../components/SettingsRow';
import Button from '../components/ui/Button';
import Switch from '../components/ui/Switch';
import WatchSymbol from '../components/WatchSymbol';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useWatchComplicationList } from '../hooks/useWatchComplicationList';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackScreenProps } from '../types/navigation';
import { newUuid } from '../utils/ids';
import {
  COMPLICATION_COLOR_HEX,
  COMPLICATION_FORMAT_LABELS,
  COMPLICATION_ICON_LABELS,
  COMPLICATION_ICONS,
  COMPLICATION_SOURCES,
  MAX_COMPLICATION_ITEMS,
  MAX_COMPLICATION_NAME_LENGTH,
  NUTRIENT_SOURCE_PREFIX,
  allowedFormats,
  complicationSourceLabel,
  defaultLookFor,
  isComplicationSource,
  sourceHasProgress,
  upsertComplication,
  type ComplicationColor,
  type ComplicationFormat,
  type ComplicationIcon,
  type ComplicationItem,
  type ComplicationSource,
  type WatchComplicationDefinition,
} from '../utils/watchComplications';

type WatchComplicationEditScreenProps =
  RootStackScreenProps<'WatchComplicationEdit'>;

interface FormState {
  name: string;
  source: ComplicationSource;
  format: ComplicationFormat;
  gauge: boolean;
  color: ComplicationColor;
  icon: ComplicationIcon;
  /** The second and third values, shown with the first. */
  extras: ComplicationItem[];
}

// Shown as nutrient sources only through the Goals-page list, so the macros
// and calories (which have sources of their own) are not offered twice.
const FIXED_NUTRIENT_KEYS = ['calories', 'protein', 'carbs', 'fat'];

function formFrom(definition: WatchComplicationDefinition): FormState {
  return {
    name: definition.name,
    source: definition.source,
    format: definition.format,
    gauge: definition.gauge,
    color: definition.color,
    icon: definition.icon,
    extras: definition.extras ?? [],
  };
}

/** A new extra value: what it shows and the look that source starts with. */
function newItem(source: ComplicationSource): ComplicationItem {
  const { format, color, icon } = defaultLookFor(source);
  return { source, format, color, icon };
}

/** `value` unless the source can be written the way the wearer chose. */
function usableFormat(
  source: ComplicationSource,
  format: ComplicationFormat
): ComplicationFormat {
  return allowedFormats(source).includes(format) ? format : 'value';
}

/**
 * Makes or edits one complication: what it shows, how, and its look, with a
 * preview on a sample day. Saving writes the whole list, so editing a starter
 * is what makes the list the wearer's own.
 */
const WatchComplicationEditScreen: React.FC<
  WatchComplicationEditScreenProps
> = ({ navigation, route }) => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const complicationId = route.params?.complicationId;
  const { list, commit } = useWatchComplicationList();
  const shownWatchNutrients = useAppPreferencesStore(
    (s) => s.shownWatchNutrients
  );

  const existing = useMemo(
    () => list.find((d) => d.id === complicationId),
    [list, complicationId]
  );
  const isEditing = complicationId !== undefined;

  const [form, setForm] = useState<FormState>(() => {
    if (existing) return formFrom(existing);
    const source: ComplicationSource = 'calories';
    return {
      name: complicationSourceLabel(source, t),
      source,
      ...defaultLookFor(source),
      extras: [],
    };
  });

  const hasProgress = sourceHasProgress(form.source);
  const several = form.extras.length > 0;
  const itemCount = 1 + form.extras.length;

  // Every source this complication can show: the fixed ones and the nutrients
  // shown on the watch's Goals page. A source already in use is left out of the
  // other values' pickers, so the same one is never shown twice.
  const allSources = useMemo(() => {
    const nutrients = shownWatchNutrients
      .filter((key) => !FIXED_NUTRIENT_KEYS.includes(key))
      .map((key) => `${NUTRIENT_SOURCE_PREFIX}${key}`);
    const inUse = [form.source, ...form.extras.map((e) => e.source)];
    // A saved nutrient source stays selectable after it leaves the Goals page.
    for (const source of inUse) {
      if (
        source.startsWith(NUTRIENT_SOURCE_PREFIX) &&
        !nutrients.includes(source)
      ) {
        nutrients.push(source);
      }
    }
    return [...COMPLICATION_SOURCES, ...nutrients] as ComplicationSource[];
  }, [shownWatchNutrients, form.source, form.extras]);

  const optionsFor = (own: ComplicationSource) => {
    const taken = [form.source, ...form.extras.map((e) => e.source)].filter(
      (source) => source !== own
    );
    return allSources
      .filter((source) => !taken.includes(source))
      .map((source) => ({
        value: source,
        label: complicationSourceLabel(source, t),
      }));
  };

  const addExtra = () => {
    const taken = [form.source, ...form.extras.map((e) => e.source)];
    // Start from a value that can be drawn as a ring.
    const next =
      allSources.find(
        (source) => !taken.includes(source) && sourceHasProgress(source)
      ) ?? allSources.find((source) => !taken.includes(source));
    if (!next) return;
    setForm((current) => ({
      ...current,
      extras: [...current.extras, newItem(next)],
    }));
  };

  const removeExtra = (index: number) =>
    setForm((current) => ({
      ...current,
      extras: current.extras.filter((_, i) => i !== index),
    }));

  const updateExtra = (index: number, patch: Partial<ComplicationItem>) =>
    setForm((current) => ({
      ...current,
      extras: current.extras.map((item, i) =>
        i === index ? { ...item, ...patch } : item
      ),
    }));

  const changeExtraSource = (index: number, value: string) => {
    if (!isComplicationSource(value)) return;
    updateExtra(index, newItem(value));
  };

  const changeSource = (value: string) => {
    if (!isComplicationSource(value)) return;
    setForm((current) => {
      // A name the wearer has not changed follows the source.
      const followsSource =
        current.name.trim() === '' ||
        current.name === complicationSourceLabel(current.source, t);
      // A new complication takes the new source's look; an existing one keeps
      // the look it was given, except for what the new source cannot do.
      const look = isEditing
        ? {
            format: usableFormat(value, current.format),
            gauge: sourceHasProgress(value) ? current.gauge : false,
          }
        : defaultLookFor(value);
      return {
        ...current,
        ...look,
        source: value,
        name: followsSource ? complicationSourceLabel(value, t) : current.name,
      };
    });
  };

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = () => {
    const name = form.name.trim().slice(0, MAX_COMPLICATION_NAME_LENGTH);
    if (!name) {
      Toast.show({
        type: 'error',
        text1: t('watchComplications.nameRequired', {
          defaultValue: 'Give it a name',
        }),
        text2: t('watchComplications.nameRequiredSubtitle', {
          defaultValue: 'The name is what you pick on the watch face.',
        }),
      });
      return;
    }
    commit(
      upsertComplication(list, {
        id: existing?.id ?? newUuid(),
        name,
        source: form.source,
        format: usableFormat(form.source, form.format),
        gauge: hasProgress && form.gauge,
        color: form.color,
        icon: form.icon,
        ...(form.extras.length > 0
          ? {
              extras: form.extras.map((item) => ({
                ...item,
                format: usableFormat(item.source, item.format),
              })),
            }
          : {}),
      })
    );
    Toast.show({
      type: 'success',
      text1: t('watchComplications.saved', {
        defaultValue: 'Complication saved',
      }),
    });
    navigation.goBack();
  };

  const header = useScreenHeader({
    title: isEditing
      ? t('watchComplications.editTitle', {
          defaultValue: 'Edit complication',
        })
      : t('watchComplications.createTitle', {
          defaultValue: 'Add complication',
        }),
    left: { kind: 'back' },
    right: {
      kind: 'primary',
      placement: 'native-only',
      onPress: save,
    },
  });

  const formats = allowedFormats(form.source);

  return (
    <View
      className="flex-1 bg-background"
      style={!usesNativeHeader ? { paddingTop: insets.top } : undefined}
    >
      {header}
      <KeyboardAwareScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 96,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <ComplicationPreview
          definition={form}
          name={form.name.trim() || complicationSourceLabel(form.source, t)}
        />
        <Text className="text-xs text-text-muted mt-2 mb-4">
          {t('watchComplications.previewNote', {
            defaultValue:
              'A sample day, in each size. The watch face decides the final look.',
          })}
        </Text>

        <Text className="text-sm font-semibold text-text-secondary mb-1.5">
          {t('watchComplications.name', { defaultValue: 'Name' })}
        </Text>
        <FormInput
          value={form.name}
          maxLength={MAX_COMPLICATION_NAME_LENGTH}
          placeholder={t('watchComplications.namePlaceholder', {
            defaultValue: 'e.g. Protein left',
          })}
          onChangeText={(value) => update('name', value)}
        />

        <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-4">
          {t('watchComplications.source', { defaultValue: 'Shows' })}
        </Text>
        <BottomSheetPicker
          value={form.source}
          options={optionsFor(form.source)}
          onSelect={changeSource}
          title={t('watchComplications.source', { defaultValue: 'Shows' })}
        />
        <Text className="text-xs text-text-muted mt-1">
          {t('watchComplications.sourceHelp', {
            defaultValue:
              'Nutrients you show on the watch’s Goals page are listed too.',
          })}
        </Text>

        <Text className="text-sm font-semibold text-text-secondary mb-1.5 mt-4">
          {t('watchComplications.format', { defaultValue: 'Show as' })}
        </Text>
        <SegmentedControl<ComplicationFormat>
          segments={formats.map((format) => ({
            key: format,
            label: COMPLICATION_FORMAT_LABELS[format](t),
          }))}
          activeKey={usableFormat(form.source, form.format)}
          onSelect={(format) => update('format', format)}
        />
        {formats.length === 1 ? (
          <Text className="text-xs text-text-muted mt-1">
            {t('watchComplications.noGoalNote', {
              defaultValue: 'This has no goal, so it can only show its value.',
            })}
          </Text>
        ) : null}

        <View className="mt-4">
          {several ? (
            <Text
              testID="watch-complication-rings-note"
              className="text-xs text-text-muted"
            >
              {t('watchComplications.ringsNote', {
                defaultValue:
                  'With more than one value, each value that has a goal gets its own ring or bar.',
              })}
            </Text>
          ) : (
            <SettingsRow
              title={t('watchComplications.gauge', { defaultValue: 'Gauge' })}
              subtitle={t('watchComplications.gaugeSubtitle', {
                defaultValue:
                  'Draw a ring or bar for how much of the goal is done.',
              })}
              subtitleNumberOfLines={0}
              disabled={!hasProgress}
              rightAccessory={
                <Switch
                  testID="watch-complication-gauge-switch"
                  value={hasProgress && form.gauge}
                  disabled={!hasProgress}
                  onValueChange={(value) => update('gauge', value)}
                />
              }
            />
          )}
        </View>

        <Text className="text-sm font-semibold text-text-secondary mb-2 mt-4">
          {t('watchComplications.color', { defaultValue: 'Color' })}
        </Text>
        <ComplicationColorPicker
          value={form.color}
          onSelect={(color) => update('color', color)}
          testIDPrefix="watch-complication-color"
        />

        <Text className="text-sm font-semibold text-text-secondary mb-2 mt-4">
          {t('watchComplications.icon', { defaultValue: 'Icon' })}
        </Text>
        <View className="flex-row flex-wrap gap-3">
          {COMPLICATION_ICONS.map((icon) => {
            const selected = form.icon === icon;
            return (
              <Pressable
                key={icon}
                testID={`watch-complication-icon-${icon}`}
                accessibilityRole="button"
                accessibilityLabel={COMPLICATION_ICON_LABELS[icon](t)}
                accessibilityState={{ selected }}
                onPress={() => update('icon', icon)}
                className="items-center justify-center rounded-xl"
                style={{
                  width: 44,
                  height: 44,
                  backgroundColor: '#000000',
                  borderWidth: selected ? 3 : 1,
                  borderColor: selected ? '#3b82f6' : 'rgba(128,128,128,0.4)',
                }}
              >
                <WatchSymbol
                  name={icon}
                  size={22}
                  color={COMPLICATION_COLOR_HEX[form.color]}
                />
              </Pressable>
            );
          })}
        </View>

        <Text className="text-sm font-semibold text-text-secondary mb-1 mt-6">
          {t('watchComplications.moreValues', {
            defaultValue: 'More values',
          })}
        </Text>
        <Text className="text-xs text-text-muted mb-3">
          {t('watchComplications.moreValuesHelp', {
            defaultValue:
              'Show up to three values together: rings in the circular and corner sizes, a row each in the rectangular size.',
          })}
        </Text>
        {form.extras.map((item, index) => (
          <View
            key={index}
            testID={`watch-complication-extra-${index}`}
            className="bg-surface rounded-xl p-3 mb-3"
          >
            <View className="flex-row items-center justify-between mb-2">
              <Text className="text-sm font-semibold text-text-primary">
                {t('watchComplications.valueNumber', {
                  defaultValue: 'Value {{number}}',
                  number: index + 2,
                })}
              </Text>
              <Pressable
                testID={`watch-complication-extra-${index}-remove`}
                accessibilityRole="button"
                accessibilityLabel={t('watchComplications.removeValue', {
                  defaultValue: 'Remove value {{number}}',
                  number: index + 2,
                })}
                hitSlop={8}
                onPress={() => removeExtra(index)}
              >
                <Text className="text-sm text-red-600">
                  {t('watchComplications.remove', { defaultValue: 'Remove' })}
                </Text>
              </Pressable>
            </View>
            <BottomSheetPicker
              value={item.source}
              options={optionsFor(item.source)}
              onSelect={(value) => changeExtraSource(index, value)}
              title={t('watchComplications.source', { defaultValue: 'Shows' })}
            />
            <View className="mt-3">
              <SegmentedControl<ComplicationFormat>
                segments={allowedFormats(item.source).map((format) => ({
                  key: format,
                  label: COMPLICATION_FORMAT_LABELS[format](t),
                }))}
                activeKey={usableFormat(item.source, item.format)}
                onSelect={(format) => updateExtra(index, { format })}
              />
            </View>
            <View className="mt-3">
              <ComplicationColorPicker
                value={item.color}
                onSelect={(color) => updateExtra(index, { color })}
                testIDPrefix={`watch-complication-extra-${index}-color`}
                size={34}
              />
            </View>
          </View>
        ))}
        {itemCount < MAX_COMPLICATION_ITEMS ? (
          <Button
            testID="watch-complication-add-value"
            variant="secondary"
            onPress={addExtra}
          >
            {t('watchComplications.addValue', {
              defaultValue: 'Add another value',
            })}
          </Button>
        ) : null}
      </KeyboardAwareScrollView>
      {!usesNativeHeader ? <FooterSaveBar onPress={save} /> : null}
    </View>
  );
};

export default WatchComplicationEditScreen;

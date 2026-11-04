import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import BottomSheetPicker from '../components/BottomSheetPicker';
import ComplicationPreview from '../components/ComplicationPreview';
import FormInput from '../components/FormInput';
import { FooterSaveBar } from '../components/FormScreenChrome';
import SegmentedControl from '../components/SegmentedControl';
import SettingsRow from '../components/SettingsRow';
import Switch from '../components/ui/Switch';
import WatchSymbol from '../components/WatchSymbol';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useWatchComplicationList } from '../hooks/useWatchComplicationList';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackScreenProps } from '../types/navigation';
import { newUuid } from '../utils/ids';
import {
  COMPLICATION_COLORS,
  COMPLICATION_COLOR_HEX,
  COMPLICATION_COLOR_LABELS,
  COMPLICATION_FORMAT_LABELS,
  COMPLICATION_FORMATS,
  COMPLICATION_ICON_LABELS,
  COMPLICATION_ICONS,
  COMPLICATION_SOURCES,
  MAX_COMPLICATION_NAME_LENGTH,
  NUTRIENT_SOURCE_PREFIX,
  complicationSourceLabel,
  defaultLookFor,
  isComplicationSource,
  sourceHasGoal,
  upsertComplication,
  type ComplicationColor,
  type ComplicationFormat,
  type ComplicationIcon,
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
  };
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
    };
  });

  const hasGoal = sourceHasGoal(form.source);

  const sourceOptions = useMemo(() => {
    const nutrients = shownWatchNutrients
      .filter((key) => !FIXED_NUTRIENT_KEYS.includes(key))
      .map((key) => `${NUTRIENT_SOURCE_PREFIX}${key}`);
    // A saved nutrient source stays selectable after it leaves the Goals page.
    if (
      form.source.startsWith(NUTRIENT_SOURCE_PREFIX) &&
      !nutrients.includes(form.source)
    ) {
      nutrients.push(form.source);
    }
    return [...COMPLICATION_SOURCES, ...nutrients].map((source) => ({
      value: source,
      label: complicationSourceLabel(source as ComplicationSource, t),
    }));
  }, [shownWatchNutrients, form.source, t]);

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
            format: sourceHasGoal(value) ? current.format : 'value',
            gauge: sourceHasGoal(value) ? current.gauge : false,
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
        format: hasGoal ? form.format : 'value',
        gauge: hasGoal && form.gauge,
        color: form.color,
        icon: form.icon,
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

  const formats = COMPLICATION_FORMATS.filter(
    (format) => hasGoal || format === 'value'
  );

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
          options={sourceOptions}
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
          activeKey={hasGoal ? form.format : 'value'}
          onSelect={(format) => update('format', format)}
        />
        {!hasGoal ? (
          <Text className="text-xs text-text-muted mt-1">
            {t('watchComplications.noGoalNote', {
              defaultValue: 'This has no goal, so it can only show its value.',
            })}
          </Text>
        ) : null}

        <View className="mt-4">
          <SettingsRow
            title={t('watchComplications.gauge', { defaultValue: 'Gauge' })}
            subtitle={t('watchComplications.gaugeSubtitle', {
              defaultValue:
                'Draw a ring or bar for how much of the goal is done.',
            })}
            subtitleNumberOfLines={0}
            disabled={!hasGoal}
            rightAccessory={
              <Switch
                testID="watch-complication-gauge-switch"
                value={hasGoal && form.gauge}
                disabled={!hasGoal}
                onValueChange={(value) => update('gauge', value)}
              />
            }
          />
        </View>

        <Text className="text-sm font-semibold text-text-secondary mb-2 mt-4">
          {t('watchComplications.color', { defaultValue: 'Color' })}
        </Text>
        <View className="flex-row flex-wrap gap-3">
          {COMPLICATION_COLORS.map((color) => {
            const selected = form.color === color;
            return (
              <Pressable
                key={color}
                testID={`watch-complication-color-${color}`}
                accessibilityRole="button"
                accessibilityLabel={COMPLICATION_COLOR_LABELS[color](t)}
                accessibilityState={{ selected }}
                onPress={() => update('color', color)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  backgroundColor: COMPLICATION_COLOR_HEX[color],
                  borderWidth: selected ? 3 : 1,
                  borderColor: selected ? '#3b82f6' : 'rgba(128,128,128,0.4)',
                }}
              />
            );
          })}
        </View>

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
      </KeyboardAwareScrollView>
      {!usesNativeHeader ? <FooterSaveBar onPress={save} /> : null}
    </View>
  );
};

export default WatchComplicationEditScreen;

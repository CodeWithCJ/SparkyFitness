import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { ReorderSwitchList } from '../components/ReorderSwitchList';
import SegmentedControl from '../components/SegmentedControl';
import SettingsRow from '../components/SettingsRow';
import Switch from '../components/ui/Switch';
import { getNutrientLabel } from '../constants/nutrients';
import {
  WATCH_PAGE_KEYS,
  WATCH_PAGE_LABELS,
  type WatchSetInputStyle,
} from '../constants/watchPages';
import { useCustomNutrients } from '../hooks/useCustomNutrients';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { useServerConnection } from '../hooks/useServerConnection';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';
import type { RootStackScreenProps } from '../types/navigation';
import { resolveKeyOrder } from '../utils/reorderUtils';
import { WATCH_STANDARD_NUTRIENT_KEYS } from '../utils/watchNutrients';

type WatchSettingsScreenProps = RootStackScreenProps<'WatchSettings'>;

/**
 * The Apple Watch app's layout: which pages it shows and the order you swipe
 * through them, and which nutrients its Goals page lists under the calorie
 * ring. Stored on the phone and sent to the watch in its context push
 * (`useWatchCheckInBridge`), so a change reaches the wrist the next time the
 * two talk.
 */
const WatchSettingsScreen: React.FC<WatchSettingsScreenProps> = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { isConnected } = useServerConnection();
  const { customNutrients } = useCustomNutrients({ enabled: isConnected });

  const watchPageOrder = useAppPreferencesStore((s) => s.watchPageOrder);
  const hiddenWatchPages = useAppPreferencesStore((s) => s.hiddenWatchPages);
  const watchDoubleTapEnabled = useAppPreferencesStore(
    (s) => s.watchDoubleTapEnabled
  );
  const watchRpeEnabled = useAppPreferencesStore((s) => s.watchRpeEnabled);
  const setWatchRpeEnabled = useAppPreferencesStore(
    (s) => s.setWatchRpeEnabled
  );
  const setWatchDoubleTapEnabled = useAppPreferencesStore(
    (s) => s.setWatchDoubleTapEnabled
  );
  const setWatchPageOrder = useAppPreferencesStore((s) => s.setWatchPageOrder);
  const setWatchPageHidden = useAppPreferencesStore(
    (s) => s.setWatchPageHidden
  );
  const watchNutrientOrder = useAppPreferencesStore(
    (s) => s.watchNutrientOrder
  );
  const shownWatchNutrients = useAppPreferencesStore(
    (s) => s.shownWatchNutrients
  );
  const setWatchNutrientOrder = useAppPreferencesStore(
    (s) => s.setWatchNutrientOrder
  );
  const setWatchNutrientShown = useAppPreferencesStore(
    (s) => s.setWatchNutrientShown
  );
  const watchSetInputStyle = useAppPreferencesStore(
    (s) => s.watchSetInputStyle
  );
  const setWatchSetInputStyle = useAppPreferencesStore(
    (s) => s.setWatchSetInputStyle
  );

  const pageItems = useMemo(
    () =>
      resolveKeyOrder(watchPageOrder, WATCH_PAGE_KEYS).map((key) => ({
        key,
        label: WATCH_PAGE_LABELS[key](t),
      })),
    [watchPageOrder, t]
  );
  const shownPageCount = pageItems.filter(
    ({ key }) => !hiddenWatchPages.includes(key)
  ).length;

  // Standard nutrients, then the account's custom ones, in the saved order.
  const nutrientItems = useMemo(() => {
    const customNames = customNutrients.map((def) => def.name);
    return resolveKeyOrder(watchNutrientOrder, [
      ...WATCH_STANDARD_NUTRIENT_KEYS,
      ...customNames,
    ]).map((key) => ({
      key,
      label: customNames.includes(key) ? key : getNutrientLabel(t, key),
    }));
  }, [watchNutrientOrder, customNutrients, t]);

  const header = useScreenHeader({
    title: t('screens.watchSettings', { defaultValue: 'Apple Watch' }),
    left: { kind: 'back' },
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingTop: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-primary text-base font-semibold mb-1">
          {t('watchSettings.gesturesTitle', { defaultValue: 'Gestures' })}
        </Text>
        <SettingsRow
          title={t('watchSettings.doubleTapTitle', {
            defaultValue: 'Double-tap to log a set',
          })}
          subtitle={t('watchSettings.doubleTapSubtitle', {
            defaultValue:
              'Double-tap on a supported watch (Series 9, Ultra 2 or later, watchOS 11) logs the set on screen during a workout.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              testID="watch-double-tap-switch"
              value={watchDoubleTapEnabled}
              onValueChange={setWatchDoubleTapEnabled}
            />
          }
        />
        <SettingsRow
          title={t('watchSettings.rpeTitle', {
            defaultValue: 'Ask for effort (RPE) after each set',
          })}
          subtitle={t('watchSettings.rpeSubtitle', {
            defaultValue:
              'After you log a set on the watch, turn the Digital Crown to pick how hard it was, from 1 to 10, then tap Save, or tap Skip.',
          })}
          subtitleNumberOfLines={0}
          rightAccessory={
            <Switch
              testID="watch-rpe-switch"
              value={watchRpeEnabled}
              onValueChange={setWatchRpeEnabled}
            />
          }
        />

        <Text className="text-text-primary text-base font-semibold mt-6 mb-1">
          {t('watchSettings.setInputTitle', { defaultValue: 'Set input' })}
        </Text>
        <Text className="text-text-secondary text-sm mb-4">
          {t('watchSettings.setInputDescription', {
            defaultValue:
              'How you enter weight and reps on the watch during a workout: type them on a keypad, or tap a value and turn the Digital Crown or drag it, 0.5 at a time for weight.',
          })}
        </Text>
        <SegmentedControl<WatchSetInputStyle>
          segments={[
            {
              key: 'keypad',
              label: t('watchSettings.setInputKeypad', {
                defaultValue: 'Keypad',
              }),
            },
            {
              key: 'crown',
              label: t('watchSettings.setInputCrown', {
                defaultValue: 'Digital Crown',
              }),
            },
          ]}
          activeKey={watchSetInputStyle}
          onSelect={setWatchSetInputStyle}
        />

        <Text className="text-text-primary text-base font-semibold mt-6 mb-1">
          {t('watchSettings.pagesTitle', { defaultValue: 'Pages' })}
        </Text>
        <Text className="text-text-secondary text-sm mb-4">
          {t('watchSettings.description', {
            defaultValue:
              'Drag a page by its handle to change the order you swipe through them on your watch. Toggle a page off to hide it. The Workout page still appears while a workout is running.',
          })}
        </Text>
        <ReorderSwitchList
          items={pageItems}
          testIDPrefix="watch-page"
          isEnabled={(key) => !hiddenWatchPages.includes(key)}
          // The watch needs at least one page to land on.
          isSwitchDisabled={(key) =>
            !hiddenWatchPages.includes(key) && shownPageCount <= 1
          }
          onToggle={(key, enabled) => setWatchPageHidden(key, !enabled)}
          onReorder={setWatchPageOrder}
          reorderA11yLabel={(name) =>
            t('watchSettings.reorder', {
              defaultValue: 'Reorder {{name}}',
              name,
            })
          }
          reorderA11yHint={t('watchSettings.reorderHint', {
            defaultValue: 'Changes where this page sits on your watch',
          })}
        />

        <Text className="text-text-primary text-base font-semibold mt-6 mb-1">
          {t('watchSettings.nutrientsTitle', {
            defaultValue: 'Goals page nutrients',
          })}
        </Text>
        <Text className="text-text-secondary text-sm mb-4">
          {t('watchSettings.nutrientsDescription', {
            defaultValue:
              'Choose the nutrients listed under the calorie ring on your watch, and drag to set their order. Each shows today’s amount against its goal.',
          })}
        </Text>
        <ReorderSwitchList
          items={nutrientItems}
          testIDPrefix="watch-nutrient"
          isEnabled={(key) => shownWatchNutrients.includes(key)}
          onToggle={setWatchNutrientShown}
          onReorder={setWatchNutrientOrder}
          reorderA11yLabel={(name) =>
            t('watchSettings.reorder', {
              defaultValue: 'Reorder {{name}}',
              name,
            })
          }
          reorderA11yHint={t('watchSettings.nutrientReorderHint', {
            defaultValue: 'Changes where this nutrient sits on your watch',
          })}
        />
      </ScrollView>
    </View>
  );
};

export default WatchSettingsScreen;

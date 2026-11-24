import type { ReactElement } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCSSVariable } from 'uniwind';
import {
  FEATURE_GROUPS,
  FEATURE_KEYS,
  OPTIONAL_FEATURES,
  type ChoiceFeatureKey,
  type FeatureGroup,
  type FeatureKey,
} from '@workspace/shared';
import SettingsRow, { SettingsRowGroup } from '../components/SettingsRow';
import Switch from '../components/ui/Switch';
import Button from '../components/ui/Button';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import { useScreenHeader } from '../hooks/useScreenHeader';
import type { IconName } from '../components/Icon';
import { useSetMobileFeatureChoice } from '../hooks/useFeatureChoices';
import { useRefetchOnFocus } from '../hooks/useRefetchOnFocus';
import { useCycleSwitch, useMobileFeatures } from '../hooks/useMobileFeatures';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import type { RootStackScreenProps } from '../types/navigation';

function groupLabel(t: TFunction, group: FeatureGroup): string {
  switch (group) {
    case 'health':
      return t('featureSettings.groups.health', { defaultValue: 'Health' });
    case 'nutrition':
      return t('featureSettings.groups.nutrition', {
        defaultValue: 'Nutrition',
      });
    case 'training':
      return t('featureSettings.groups.training', {
        defaultValue: 'Training',
      });
    case 'wellbeing':
      return t('featureSettings.groups.wellbeing', {
        defaultValue: 'Wellbeing',
      });
  }
}

/**
 * Cycle tracking: one switch for the whole account, so it also shows or hides
 * cycle on the website. Named like the Cycle & Pregnancy settings row, so
 * discreet mode never says Cycle here either.
 */
function CycleFeatureRows() {
  const { t } = useTranslation();
  const cycle = useCycleSwitch();
  const [accent] = useCSSVariable(['--color-accent-primary']) as [string];

  // Until the settings are known, so is discreet mode: show nothing that
  // could name cycle.
  if (cycle.state === 'loading') {
    return (
      <View
        className="px-4 py-4 items-start"
        accessibilityLabel={t('featureSettings.loading', {
          defaultValue: 'Loading',
        })}
      >
        <ActivityIndicator color={accent} />
      </View>
    );
  }
  if (cycle.state === 'loadFailed') {
    return (
      <View className="px-4 py-3 gap-3 items-start">
        <Text className="text-sm text-text-secondary">
          {t('featureSettings.loadError', {
            defaultValue: 'Could not load this setting.',
          })}
        </Text>
        <Button variant="secondary" onPress={cycle.reload}>
          {t('common.retry', { defaultValue: 'Retry' })}
        </Button>
      </View>
    );
  }

  const discreet = cycle.settings?.discreet_mode === true;
  const title = discreet
    ? t('featureSettings.cycle.discreetTitle', { defaultValue: 'Wellness' })
    : t('featureSettings.cycle.title', { defaultValue: 'Cycle & Pregnancy' });
  const scope = t('featureSettings.cycle.scope', {
    defaultValue: 'One switch for the app and the website.',
  });
  const subtitle = discreet
    ? scope
    : `${t('featureSettings.cycle.description', {
        defaultValue: 'Track periods, fertility and pregnancy.',
      })}\n${scope}`;

  return (
    <>
      <SettingsRow
        icon="wellness"
        title={title}
        subtitle={subtitle}
        subtitleNumberOfLines={0}
        testID="feature-row-cycle"
        rightAccessory={
          <Switch
            accessibilityLabel={title}
            value={cycle.on}
            disabled={cycle.isPending}
            onValueChange={cycle.setOn}
            testID="feature-switch-cycle"
          />
        }
      />
      {cycle.needsSetup && (
        <>
          <View className="h-px bg-border-subtle" />
          <SettingsRow
            title={t('featureSettings.cycle.setupAction', {
              defaultValue: 'Set up',
            })}
            subtitle={t('featureSettings.cycle.setupHint', {
              defaultValue: 'Answer a few questions to finish setting it up.',
            })}
            subtitleNumberOfLines={0}
            onPress={cycle.openSetup}
            testID="feature-setup-cycle"
          />
        </>
      )}
    </>
  );
}

/**
 * A feature with one choice per platform (`feature_choices`): this switch
 * changes the app only. It can be used once the choices have loaded; until
 * then, and on a server older than Features, it shows the default.
 */
function ChoiceFeatureRows({
  feature,
  icon,
  title,
  description,
}: {
  feature: ChoiceFeatureKey;
  icon: IconName;
  title: string;
  description: string;
}) {
  const { t } = useTranslation();
  const { isEnabled } = useMobileFeatures();
  const choice = useSetMobileFeatureChoice();
  // Choices are read once per session; on an older server, ask again on each
  // visit, so updating the server takes effect without restarting the app.
  useRefetchOnFocus(choice.reload, choice.state === 'serverTooOld');
  const lines = [
    description,
    t('featureSettings.appOnly', {
      defaultValue: 'Only this app. The website has its own switch.',
    }),
  ];
  if (choice.state === 'serverTooOld') {
    lines.push(
      t('featureSettings.serverTooOld', {
        defaultValue: 'Update your SparkyFitness server to change this.',
      })
    );
  }

  return (
    <>
      <SettingsRow
        icon={icon}
        title={title}
        subtitle={lines.join('\n')}
        subtitleNumberOfLines={0}
        testID={`feature-row-${feature}`}
        rightAccessory={
          <Switch
            accessibilityLabel={title}
            value={isEnabled(feature)}
            disabled={choice.state !== 'ready' || choice.isPending}
            onValueChange={(on) => choice.setFeatureOn(feature, on)}
            testID={`feature-switch-${feature}`}
          />
        }
      />
      {choice.state === 'loadFailed' && (
        <>
          <View className="h-px bg-border-subtle" />
          <View className="px-4 py-3 gap-3 items-start">
            <Text className="text-sm text-text-secondary">
              {t('featureSettings.loadError', {
                defaultValue: 'Could not load this setting.',
              })}
            </Text>
            <Button variant="secondary" onPress={choice.reload}>
              {t('common.retry', { defaultValue: 'Retry' })}
            </Button>
          </View>
        </>
      )}
    </>
  );
}

function LabResultsFeatureRows() {
  const { t } = useTranslation();
  return (
    <ChoiceFeatureRows
      feature="labResults"
      icon="lab-results"
      title={t('featureSettings.labResults.title', {
        defaultValue: 'Lab results',
      })}
      description={t('featureSettings.labResults.description', {
        defaultValue: 'Record blood tests and follow each marker over time.',
      })}
    />
  );
}

/** Supplements and GLP-1 tracking are part of it. Reminders stop while it is
 * off; supplement nutrients still count in the day's totals. */
function MedicationsFeatureRows() {
  const { t } = useTranslation();
  return (
    <ChoiceFeatureRows
      feature="medications"
      icon="medication"
      title={t('featureSettings.medications.title', {
        defaultValue: 'Medications',
      })}
      description={t('featureSettings.medications.description', {
        defaultValue:
          'Medications, supplements and GLP-1 tracking. While it is off, reminders stop and come back when you turn it on; supplement nutrients still count in your totals.',
      })}
    />
  );
}

/** One row per feature. A new registry key needs its own rows here: the
 * return type makes a missing case fail to compile. */
function FeatureRows({ feature }: { feature: FeatureKey }): ReactElement {
  switch (feature) {
    case 'cycle':
      return <CycleFeatureRows />;
    case 'medications':
      return <MedicationsFeatureRows />;
    case 'labResults':
      return <LabResultsFeatureRows />;
  }
}

/**
 * Settings → Features: turn whole features on or off in the app, grouped as
 * in the shared registry (#3487).
 */
export default function FeatureSettingsScreen(
  _props: RootStackScreenProps<'FeatureSettings'>
) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const header = useScreenHeader({
    title: t('featureSettings.title', { defaultValue: 'Features' }),
    left: { kind: 'back' },
  });

  return (
    <View className="flex-1 bg-background">
      {header}
      <ScrollView
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        contentInsetAdjustmentBehavior={
          usesNativeHeader ? 'automatic' : 'never'
        }
      >
        <Text className="text-text-secondary text-sm mb-4">
          {t('featureSettings.description', {
            defaultValue: 'Turn whole features on or off in this app.',
          })}
        </Text>
        {FEATURE_GROUPS.map((group) => {
          const keys = FEATURE_KEYS.filter(
            (key) => OPTIONAL_FEATURES[key].group === group
          );
          if (keys.length === 0) return null;
          return (
            <SettingsRowGroup key={group} title={groupLabel(t, group)}>
              {keys.map((key) => (
                <FeatureRows key={key} feature={key} />
              ))}
            </SettingsRowGroup>
          );
        })}
        <Text className="text-text-secondary text-sm">
          {t('featureSettings.footnote', {
            defaultValue:
              'Turning a feature off only hides it: nothing is deleted, and syncs and imports keep running.',
          })}
        </Text>
      </ScrollView>
    </View>
  );
}

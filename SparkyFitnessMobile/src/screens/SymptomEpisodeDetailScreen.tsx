import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { formatDuration, minutesBetween, scaleMax } from '@workspace/shared';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { getAppLocale } from '../localization';
import { useSymptomDefinitions, useSymptomEntry } from '../hooks/useSymptoms';
import SymptomSeverityChart from '../components/symptoms/SymptomSeverityChart';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'SymptomEpisodeDetail'>;

const Chips = ({
  label,
  values,
  tone = 'bg-raised text-text-muted',
}: {
  label: string;
  values: string[];
  tone?: string;
}) => {
  if (values.length === 0) return null;
  const [bg, text] = [tone.split(' ')[0], tone.split(' ')[1]];
  return (
    <View className="mt-4">
      <Text className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
        {label}
      </Text>
      <View className="flex-row flex-wrap gap-1.5">
        {values.map((v) => (
          <View key={v} className={`px-2.5 py-1 rounded-md ${bg}`}>
            <Text className={`text-xs ${text}`}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

/** Full read-only view of one entry or episode: chart, details and treatments. */
export default function SymptomEpisodeDetailScreen({
  navigation,
  route,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const { entryId } = route.params;
  const { entry, isLoading } = useSymptomEntry(entryId);
  const { definitions } = useSymptomDefinitions();

  const header = useScreenHeader({
    title:
      entry?.symptom_name_snapshot ??
      t('symptoms.symptom', { defaultValue: 'Symptom' }),
    left: { kind: 'back' },
    right: {
      kind: 'icon',
      sfSymbol: 'pencil',
      ionicon: 'create-outline',
      onPress: () => navigation.navigate('SymptomLog', { entryId }),
      accessibilityLabel: t('symptoms.detail.edit', { defaultValue: 'Edit' }),
      identifier: 'symptom-detail-edit',
    },
  });

  const impactLabels = {
    none: t('symptoms.impacts.none', { defaultValue: 'None' }),
    mild: t('symptoms.impacts.mild', { defaultValue: 'Mild' }),
    moderate: t('symptoms.impacts.moderate', { defaultValue: 'Moderate' }),
    severe: t('symptoms.impacts.severe', { defaultValue: 'Severe' }),
  } as const;
  const effectivenessLabels = {
    full: t('symptoms.effectiveness.full', { defaultValue: 'full relief' }),
    partial: t('symptoms.effectiveness.partial', {
      defaultValue: 'partial relief',
    }),
    none: t('symptoms.effectiveness.none', { defaultValue: 'no relief' }),
  } as const;

  // Definitions load separately from the entry, so the scale is only known once
  // the matching definition is in; until then (or if it is gone) no chart is drawn.
  const scale = definitions.find((d) => d.id === entry?.symptom_id)?.scale_type;
  const chartMax = scale ? scaleMax(scale) : 0;
  const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString(getAppLocale(), {
      hour: '2-digit',
      minute: '2-digit',
    });

  const startIso = entry ? (entry.started_at ?? entry.logged_at) : '';
  const isEpisode = entry?.started_at != null;

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {isLoading || !entry ? (
        <View className="py-16 items-center">
          {isLoading ? (
            <ActivityIndicator size="large" />
          ) : (
            <Text className="text-sm text-text-muted">
              {t('symptoms.detail.notFound', {
                defaultValue: 'This entry is no longer available.',
              })}
            </Text>
          )}
        </View>
      ) : (
        <ScrollView className="flex-1 px-4 py-3">
          <Text className="text-xs text-text-muted">
            {entry.entry_date} · {clock(startIso)}
            {isEpisode &&
              ` → ${
                entry.ended_at
                  ? clock(entry.ended_at)
                  : t('symptoms.episode.ongoing', { defaultValue: 'ongoing' })
              } · ${formatDuration(
                minutesBetween(startIso, entry.ended_at ?? new Date())
              )}`}
          </Text>

          <View className="flex-row flex-wrap items-center mt-2 gap-2">
            {entry.severity != null && (
              <Text className="text-sm text-text-primary">
                {t('symptoms.severityTitle', { defaultValue: 'Severity' })}{' '}
                <Text className="font-bold">{entry.severity}</Text>
              </Text>
            )}
            {entry.peak_severity != null &&
              entry.peak_severity !== entry.severity && (
                <Text className="text-sm text-text-muted">
                  {t('symptoms.episode.peak', {
                    defaultValue: 'peak {{n}}',
                    n: entry.peak_severity,
                  })}
                </Text>
              )}
            {entry.impact && (
              <View className="px-2 py-0.5 rounded-md border border-border">
                <Text className="text-xs text-text-muted">
                  {impactLabels[entry.impact]}
                </Text>
              </View>
            )}
          </View>

          {isEpisode && chartMax > 0 && (
            <View className="mt-4 p-3 rounded-xl bg-surface border border-border">
              <SymptomSeverityChart entry={entry} max={chartMax} />
            </View>
          )}

          <Chips
            label={t('symptoms.location', { defaultValue: 'Location' })}
            values={entry.body_locations}
          />
          {Object.entries(entry.phases).map(([phase, values]) => (
            <Chips
              key={phase}
              label={phase.replace(/_/g, ' ')}
              values={values}
            />
          ))}
          <Chips
            label={t('symptoms.qualities', { defaultValue: 'Pain Qualities' })}
            values={entry.qualities}
          />
          <Chips
            label={t('symptoms.associated', {
              defaultValue: 'Associated Symptoms / Aura',
            })}
            values={entry.associated_symptoms}
          />
          <Chips
            label={t('symptoms.triggers', { defaultValue: 'Triggers' })}
            values={entry.triggers}
            tone="bg-amber-500/10 text-amber-500"
          />

          {entry.treatments.length > 0 && (
            <View className="mt-4">
              <Text className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                {t('symptoms.treatments', {
                  defaultValue: 'Treatments & Relief',
                })}
              </Text>
              {entry.treatments.map((tr) => (
                <View
                  key={tr.id}
                  className="flex-row items-center justify-between py-1.5"
                >
                  <Text className="text-sm text-text-primary flex-1">
                    {tr.name_snapshot}
                    {tr.taken_at ? ` · ${clock(tr.taken_at)}` : ''}
                  </Text>
                  <Text className="text-xs text-text-muted">
                    {tr.effectiveness
                      ? effectivenessLabels[tr.effectiveness]
                      : t('symptoms.effectiveness.unrated', {
                          defaultValue: 'unrated',
                        })}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {entry.context_text && (
            <Text className="mt-4 p-3 rounded-xl bg-surface border border-border text-sm italic text-text-primary">
              {entry.context_text}
            </Text>
          )}

          {entry.photo_ids.length > 0 && (
            <Text className="mt-4 text-xs text-text-muted">
              {t('symptoms.detail.photoCount', {
                defaultValue: '{{count}} photos attached',
                count: entry.photo_ids.length,
              })}
            </Text>
          )}
          <View className="h-12" />
        </ScrollView>
      )}
    </View>
  );
}

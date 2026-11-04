import React from 'react';
import { useTranslation } from 'react-i18next';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import { useScreenHeader } from '../hooks/useScreenHeader';
import { useCardioSessionDetail } from '../hooks/useCardioSessionDetail';
import { getAppLocale } from '../localization';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useActiveWorkoutBarPadding } from '../components/ActiveWorkoutBar';
import {
  METERS_PER_KM,
  METERS_PER_MILE,
  formatPace,
} from '../utils/gpsRecording';
import {
  paceSeriesFromDistance,
  paceSeriesFromTrack,
  splitsFromTrack,
} from '../utils/cardioSession';
import { bpmText, sessionStats } from '../utils/cardioSessionStats';
import Button from '../components/ui/Button';
import { shareRouteAsGpx } from '../services/gpxExport';
import { saveActivityAsRoute } from '../services/routeService';
import RouteMap from '../components/exerciseStats/RouteMap';
import HeartRateChart from '../components/exerciseStats/HeartRateChart';
import PaceChart from '../components/exerciseStats/PaceChart';
import SplitsTable from '../components/recording/SplitsTable';
import HeartRateZones from '../components/exerciseStats/HeartRateZones';
import ProgramWorkoutBadge from '../components/recording/ProgramWorkoutBadge';
import FitnessTestBadge from '../components/recording/FitnessTestBadge';
import ShoePickerCard from '../components/ShoePickerCard';
import type { RootStackScreenProps } from '../types/navigation';

type CardioSessionScreenProps = RootStackScreenProps<'CardioSession'>;

const Card: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => (
  <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm">
    <Text className="text-text-primary text-base font-bold mb-3">{title}</Text>
    {children}
  </View>
);

const CardioSessionScreen: React.FC<CardioSessionScreenProps> = ({
  navigation,
  route,
}) => {
  const { session, distanceUnit, diaryEntry } = route.params;
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const activeWorkoutBarPadding = useActiveWorkoutBarPadding('stack');
  const usesNativeHeader = useNativeIOSHeadersActive();

  const header = useScreenHeader({
    title: session.exerciseName,
    // The native iOS header only takes a title through nativeTitle; without
    // it the route's static "Cardio Session" shows instead.
    nativeTitle: session.exerciseName,
    left: { kind: 'back' },
    // A run or walk made in the app opens here from the diary; its editor is
    // the activity screen, which this hands over to.
    right: diaryEntry
      ? {
          kind: 'text',
          label: t('common.edit', { defaultValue: 'Edit' }),
          role: 'secondary',
          onPress: () =>
            navigation.replace('ActivityDetail', { session: diaryEntry }),
          accessibilityLabel: t('activityDetail.accessibility.edit', {
            defaultValue: 'Edit activity',
          }),
          identifier: 'cardio-session-edit',
        }
      : null,
  });

  const detail = useCardioSessionDetail(session.id, session.entryDate);
  const stats = sessionStats(t, session, distanceUnit);
  const exportGpx = async () => {
    try {
      await shareRouteAsGpx({
        name: session.exerciseName,
        day: session.entryDate.slice(0, 10),
        points: detail.route,
      });
    } catch {
      Toast.show({
        type: 'error',
        text1: t('exerciseStatistics.cardio.exportGpxFailed', {
          defaultValue: 'Could not export the route',
        }),
      });
    }
  };
  const [savingRoute, setSavingRoute] = React.useState(false);
  const saveAsRoute = () => {
    setSavingRoute(true);
    void saveActivityAsRoute(session.id)
      .then((saved) => {
        Toast.show({
          type: 'success',
          text1: t('routes.savedAsRoute', { defaultValue: 'Saved to Routes' }),
        });
        navigation.navigate('RouteDetail', { id: saved.id });
      })
      .catch(() => {
        Toast.show({
          type: 'error',
          text1: t('routes.saveAsRouteFailed', {
            defaultValue: 'Could not save the route',
          }),
        });
      })
      .finally(() => setSavingRoute(false));
  };
  const [year, month, day] = session.entryDate
    .slice(0, 10)
    .split('-')
    .map(Number);
  const dateText = new Date(
    year ?? 1970,
    (month ?? 1) - 1,
    day ?? 1
  ).toLocaleDateString(getAppLocale(), {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const unitMeters = distanceUnit === 'miles' ? METERS_PER_MILE : METERS_PER_KM;
  const paceSeries = React.useMemo(
    () =>
      detail.route.length > 0
        ? paceSeriesFromTrack(detail.route, unitMeters)
        : paceSeriesFromDistance(detail.distanceSeries ?? [], unitMeters),
    [detail.route, detail.distanceSeries, unitMeters]
  );
  const splits = React.useMemo(
    () =>
      detail.route.length > 1
        ? splitsFromTrack(detail.route, unitMeters, detail.heartRate)
        : [],
    [detail.route, detail.heartRate, unitMeters]
  );
  const paceUnitLabel =
    distanceUnit === 'miles'
      ? t('exerciseStatistics.cardio.perMile', { defaultValue: '/mi' })
      : t('exerciseStatistics.cardio.perKm', { defaultValue: '/km' });

  const peak = detail.heartRate.reduce((max, p) => Math.max(max, p.bpm), 0);
  const average =
    detail.heartRate.length > 0
      ? detail.heartRate.reduce((sum, p) => sum + p.bpm, 0) /
        detail.heartRate.length
      : 0;

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          padding: 16,
          paddingBottom: insets.bottom + 80 + activeWorkoutBarPadding,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text className="text-text-secondary text-sm mb-3">{dateText}</Text>

        <ProgramWorkoutBadge entryId={session.id} />
        <FitnessTestBadge entryId={session.id} unit={distanceUnit} />

        {stats.length > 0 ? (
          <View className="bg-surface rounded-xl p-4 mb-4 shadow-sm flex-row flex-wrap">
            {stats.map((stat) => (
              <View key={stat.key} className="w-1/2 py-1.5">
                <Text className="text-text-secondary text-xs">
                  {stat.label}
                </Text>
                <Text className="text-text-primary text-base font-semibold">
                  {stat.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <Button
          variant="secondary"
          className="mb-4 py-3 items-center"
          testID="share-as-image"
          onPress={() =>
            navigation.navigate('ActivityShare', { session, distanceUnit })
          }
        >
          {t('exerciseStatistics.cardio.shareImage', {
            defaultValue: 'Share as image',
          })}
        </Button>
        <ShoePickerCard exerciseEntryId={session.id} />

        {/* A duration-only workout (a jump rope) has no distance, so no route. */}
        {(session.modality ?? 'duration_distance') !== 'duration' ? (
          <Card
            title={t('exerciseStatistics.cardio.route', {
              defaultValue: 'Route',
            })}
          >
            {detail.isRouteLoading ? (
              <ActivityIndicator />
            ) : detail.route.length > 1 ? (
              <>
                <RouteMap
                  points={detail.route}
                  accessibilityLabel={t('exerciseStatistics.cardio.routeA11y', {
                    defaultValue:
                      'Route of this workout, from the green dot to the red ring',
                  })}
                />
                <Button
                  variant="link"
                  testID="export-gpx"
                  onPress={() => void exportGpx()}
                >
                  {t('exerciseStatistics.cardio.exportGpx', {
                    defaultValue: 'Export GPX',
                  })}
                </Button>
                <Button
                  variant="link"
                  testID="save-as-route"
                  loading={savingRoute}
                  onPress={saveAsRoute}
                >
                  {t('routes.saveAsRoute', { defaultValue: 'Save as route' })}
                </Button>
              </>
            ) : (
              <Text className="text-text-secondary text-sm">
                {t('exerciseStatistics.cardio.noRoute', {
                  defaultValue:
                    'No GPS route stored. Indoor workouts do not have one. An outdoor walk only has a route if Apple Health shared it when the workout synced.',
                })}
              </Text>
            )}
          </Card>
        ) : null}

        {paceSeries.length >= 2 ? (
          <Card
            title={t('exerciseStatistics.cardio.pace', {
              defaultValue: 'Pace',
            })}
          >
            <View className="flex-row mb-2">
              <Text className="text-text-secondary text-sm mr-4">
                {t('exerciseStatistics.cardio.bestPace', {
                  defaultValue: 'Best {{value}}',
                  value: `${formatPace(
                    Math.min(...paceSeries.map((p) => p.paceSeconds))
                  )} ${paceUnitLabel}`,
                })}
              </Text>
            </View>
            <PaceChart
              data={paceSeries}
              xAxisCaption={
                distanceUnit === 'miles'
                  ? t('exerciseStatistics.cardio.milesAxis', {
                      defaultValue: 'Miles from start',
                    })
                  : t('exerciseStatistics.cardio.kilometersAxis', {
                      defaultValue: 'Kilometers from start',
                    })
              }
            />
          </Card>
        ) : null}

        {splits.length > 0 ? (
          <Card
            title={t('exerciseStatistics.cardio.splits', {
              defaultValue: 'Splits',
            })}
          >
            <SplitsTable
              splits={splits}
              unitMeters={unitMeters}
              unit={distanceUnit}
            />
          </Card>
        ) : null}

        <Card
          title={t('exerciseStatistics.cardio.heartRate', {
            defaultValue: 'Heart Rate',
          })}
        >
          {detail.isHeartRateLoading ? (
            <ActivityIndicator />
          ) : detail.heartRate.length > 0 ? (
            <>
              <View className="flex-row mb-2">
                <Text className="text-text-secondary text-sm mr-4">
                  {t('exerciseStatistics.cardio.average', {
                    defaultValue: 'Avg {{value}}',
                    value: bpmText(t, average),
                  })}
                </Text>
                <Text className="text-text-secondary text-sm">
                  {t('exerciseStatistics.cardio.peak', {
                    defaultValue: 'Max {{value}}',
                    value: bpmText(t, peak),
                  })}
                </Text>
              </View>
              <HeartRateChart
                data={detail.heartRate}
                xAxisCaption={t('exerciseStatistics.cardio.minutesAxis', {
                  defaultValue: 'Minutes from start',
                })}
              />
            </>
          ) : session.avgHeartRate != null && session.avgHeartRate > 0 ? (
            <Text className="text-text-secondary text-sm">
              {t('exerciseStatistics.cardio.onlyAverage', {
                defaultValue:
                  'Average heart rate {{value}}. Beat-by-beat samples were not stored.',
                value: bpmText(t, session.avgHeartRate),
              })}
            </Text>
          ) : (
            <Text className="text-text-secondary text-sm">
              {t('exerciseStatistics.cardio.noHeartRate', {
                defaultValue: 'No heart-rate samples for this workout.',
              })}
            </Text>
          )}
        </Card>

        {detail.zones.length > 0 ? (
          <Card
            title={t('exerciseStatistics.cardio.zones', {
              defaultValue: 'Heart Rate Zones',
            })}
          >
            <HeartRateZones zones={detail.zones} />
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
};

export default CardioSessionScreen;

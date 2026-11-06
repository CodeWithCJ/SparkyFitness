import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAnimatedReaction, runOnJS } from 'react-native-reanimated';
import { measurementViewport } from '../../utils/measurementViewport';
import { useTranslation } from 'react-i18next';
import {
  CartesianChart,
  Line,
  Scatter,
  useChartTransformState,
} from 'victory-native';
import { Rect, scale } from '@shopify/react-native-skia';
import { useCSSVariable } from 'uniwind';
import {
  BLOOD_GLUCOSE_MG_DL_PER_MMOL_L,
  DEFAULT_GLUCOSE_UNIT,
  measurementDayPoints,
  instantToDay,
  instantHourMinute,
  localDateTimeToUtc,
  GLUCOSE_CONTEXT_KINDS,
  glucoseContextForDay,
  type GlucoseContextKind,
} from '@workspace/shared';
import Icon, { type IconName } from '../Icon';
import BottomSheetPicker from '../BottomSheetPicker';
import ChartTouchOverlay, {
  ChartLayoutReporter,
  createChartTouchLayoutSignature,
  EMPTY_CHART_TOUCH_LAYOUT,
  type ChartTouchLayout,
} from '../ChartTouchOverlay';
import {
  useChartFont,
  CHART_LABEL_FONT_SIZE,
  formatTooltipDate,
} from '../charts/chartFormatting';
import { useGlucoseContext } from '../../hooks/useGlucoseContext';
import { useMeasurementTimeline } from '../../hooks/useMeasurementTimeline';
import { usePreferences } from '../../hooks/usePreferences';
import { addDays } from '../../utils/dateUtils';
import { formatHourLabel } from '../../utils/entryTimeDisplay';
import { formatLocalizedNumber, getAppLocale } from '../../localization';

const CONTEXT_ICONS: Record<GlucoseContextKind, IconName> = {
  meal: 'food',
  exercise: 'exercise-default',
  sleep: 'sleep-bedtime',
  medication: 'medication',
  stress: 'wellness',
  caffeine: 'coffee',
  alcohol: 'wine',
  hydration: 'water',
};
const CONTEXT_COLOR_VARS = [
  '--color-cat-orange',
  '--color-exercise',
  '--color-cat-violet',
  '--color-cat-pink',
  '--color-cat-slate',
  '--color-cat-amber',
  '--color-cat-teal',
  '--color-hydration',
];

/** Projects source-separated observations and context into one timezone-aware, zoomable local day. */
export default function MeasurementTimelineCard({
  startDate,
  endDate,
}: {
  startDate: string;
  endDate: string;
}) {
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const timezone =
    preferences?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const font = useChartFont(CHART_LABEL_FONT_SIZE);
  const [lineColor, textColor, ...contextColors] = useCSSVariable([
    '--color-accent-primary',
    '--color-text-muted',
    ...CONTEXT_COLOR_VARS,
  ]) as string[];
  const contextColor = (kind: GlucoseContextKind) =>
    contextColors[GLUCOSE_CONTEXT_KINDS.indexOf(kind)]!;
  const [controlsOpen, setControlsOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const [eventsOpen, setEventsOpen] = useState(false);
  const [inspect, setInspect] = useState(false);
  const { state: transformState } = useChartTransformState();
  const { matrix, offset, origin } = transformState;
  const resetZoom = useCallback(() => {
    matrix.value = scale(1, 1);
    offset.value = scale(1, 1);
    origin.value = { x: 0, y: 0 };
  }, [matrix, offset, origin]);
  const [chosenDay, setDay] = useState(endDate);
  const day =
    chosenDay < startDate || chosenDay > endDate ? endDate : chosenDay;
  const dayStart = localDateTimeToUtc(`${day}T00:00`, timezone).getTime();
  const dayLength =
    (localDateTimeToUtc(`${addDays(day, 1)}T00:00`, timezone).getTime() -
      dayStart) /
    60_000;
  const [categoryId, setCategoryId] = useState('blood_glucose');
  const [sourceChoice, setSource] = useState('');
  const glucoseUnit = preferences?.default_glucose_unit ?? DEFAULT_GLUCOSE_UNIT;
  const [selected, setSelected] = useState<number | null>(null);
  const [layout, setLayout] = useState<ChartTouchLayout>(
    EMPTY_CHART_TOUCH_LAYOUT
  );
  const updateLayout = useCallback((next: ChartTouchLayout) => {
    setLayout((current) =>
      createChartTouchLayoutSignature(current) ===
      createChartTouchLayoutSignature(next)
        ? current
        : next
    );
  }, []);
  const { categories, readings } = useMeasurementTimeline(categoryId, day);
  const categoryOptions = [
    {
      value: 'blood_glucose',
      label: t('measurementTimeline.glucose', {
        defaultValue: 'Blood glucose (CGM)',
      }),
    },
    ...(categories.data ?? [])
      .filter((category) => category.data_type !== 'text')
      .map((category) => ({
        value: category.id,
        label: category.display_name || category.name,
      })),
  ];
  const category = categories.data?.find((item) => item.id === categoryId);
  const rawGlucose = categoryId === 'blood_glucose';
  const unit = rawGlucose ? glucoseUnit : (category?.measurement_type ?? '');
  useEffect(resetZoom, [resetZoom, day, sourceChoice, categoryId, glucoseUnit]);
  const dayReadings = useMemo(
    () =>
      readings.data.filter(
        (reading) =>
          Number.isFinite(Date.parse(reading.timestamp)) &&
          instantToDay(reading.timestamp, timezone) === day
      ),
    [readings.data, day, timezone]
  );
  const sources = useMemo(
    () =>
      [
        ...new Set(
          dayReadings
            .filter((reading) => Number.isFinite(reading.value))
            .map((reading) => reading.source)
        ),
      ].sort(),
    [dayReadings]
  );
  const source = sources.includes(sourceChoice) ? sourceChoice : sources[0];
  const points = useMemo(
    () =>
      measurementDayPoints(
        dayReadings
          .filter((reading) => reading.source === source)
          .map((reading) => ({
            ...reading,
            value:
              reading.value *
              (rawGlucose && glucoseUnit === 'mg/dL'
                ? BLOOD_GLUCOSE_MG_DL_PER_MMOL_L
                : 1),
          })),
        day,
        timezone
      ),
    [dayReadings, source, rawGlucose, glucoseUnit, day, timezone]
  );
  const actual = points.filter((point) => point.value !== null);
  const context = useGlucoseContext(day, timezone, actual.length > 0);
  const [layers, setLayers] = useState<GlucoseContextKind[]>([
    ...GLUCOSE_CONTEXT_KINDS,
  ]);
  const events = useMemo(
    () =>
      glucoseContextForDay(
        context.data ?? { events: [], unavailable: [] },
        day,
        timezone
      ),
    [context.data, day, timezone]
  );
  const visibleEvents = events.filter((event) => layers.includes(event.kind));
  const [viewport, setViewport] = useState({ from: 0, to: dayLength });
  const plotLeft = layout.chartBounds?.left ?? 0;
  const plotRight = layout.chartBounds?.right ?? 0;
  const updateViewport = useCallback(
    (scaleX: number, translateX: number) => {
      const next = measurementViewport(
        scaleX,
        translateX,
        plotLeft,
        plotRight,
        dayLength
      );
      setViewport((current) =>
        Math.abs(current.from - next.from) < 0.1 &&
        Math.abs(current.to - next.to) < 0.1
          ? current
          : next
      );
    },
    [plotLeft, plotRight, dayLength]
  );
  useAnimatedReaction(
    () =>
      transformState.panActive.value || transformState.zoomActive.value
        ? null
        : { scaleX: matrix.value[0], translateX: matrix.value[3] },
    (next, previous) => {
      if (
        next &&
        (!previous ||
          next.scaleX !== previous.scaleX ||
          next.translateX !== previous.translateX)
      )
        runOnJS(updateViewport)(next.scaleX, next.translateX);
    },
    [
      updateViewport,
      matrix,
      transformState.panActive,
      transformState.zoomActive,
    ]
  );
  useEffect(
    () => setViewport({ from: 0, to: dayLength }),
    [day, dayLength, sourceChoice, categoryId, glucoseUnit]
  );
  const windowEvents = visibleEvents.filter(
    (event) =>
      event.minutes !== null &&
      event.minutes < viewport.to &&
      (event.endMinutes ?? event.minutes) >= viewport.from
  );

  const windowReadings = actual.filter(
    (point) => point.minutes >= viewport.from && point.minutes <= viewport.to
  );
  const displayed =
    inspect && selected !== null
      ? (actual[selected] ?? windowReadings.at(-1))
      : windowReadings.at(-1);

  const kindLabel = (kind: GlucoseContextKind) =>
    ({
      meal: t('measurementTimeline.layerMeal', { defaultValue: 'Food' }),
      exercise: t('measurementTimeline.layerExercise', {
        defaultValue: 'Exercise',
      }),
      sleep: t('measurementTimeline.layerSleep', { defaultValue: 'Sleep' }),
      medication: t('measurementTimeline.layerMedication', {
        defaultValue: 'Medications',
      }),
      stress: t('measurementTimeline.layerStress', { defaultValue: 'Stress' }),
      caffeine: t('measurementTimeline.layerCaffeine', {
        defaultValue: 'Caffeine',
      }),
      alcohol: t('measurementTimeline.layerAlcohol', {
        defaultValue: 'Alcohol',
      }),
      hydration: t('measurementTimeline.layerHydration', {
        defaultValue: 'Hydration',
      }),
    })[kind];
  const contextTime = (timestamp: string) =>
    new Intl.DateTimeFormat(getAppLocale(), {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: preferences?.time_format
        ? preferences.time_format !== 'HH:mm'
        : undefined,
    }).format(new Date(timestamp));
  const clock = (minutes: number) =>
    new Intl.DateTimeFormat(getAppLocale(), {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: preferences?.time_format
        ? preferences.time_format !== 'HH:mm'
        : undefined,
    }).format(new Date(dayStart + minutes * 60_000));
  const changeDay = (next: string) => {
    setDay(next);
    setSelected(null);
  };
  return (
    <View
      className="bg-surface rounded-xl p-4 my-2 shadow-sm"
      testID="measurement-timeline"
    >
      <View className="flex-row justify-between items-center">
        <Text className="text-text-secondary font-bold flex-1">
          {categoryOptions.find((option) => option.value === categoryId)?.label}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('measurementTimeline.options', {
            defaultValue: 'Chart options',
          })}
          accessibilityState={{ expanded: controlsOpen }}
          hitSlop={8}
          onPress={() => setControlsOpen(!controlsOpen)}
          className="p-2 min-h-11 flex-row items-center gap-2"
        >
          <Icon name="app-settings" size={20} color={lineColor} />
        </Pressable>
      </View>
      {controlsOpen && (
        <View>
          <BottomSheetPicker
            value={categoryId}
            options={categoryOptions}
            title={t('measurementTimeline.category', {
              defaultValue: 'Measurement',
            })}
            onSelect={(value) => {
              setCategoryId(value);
              setSource('');
              setSelected(null);
            }}
          />
          {sources.length > 0 && (
            <BottomSheetPicker
              value={source ?? ''}
              options={sources.map((value) => ({ value, label: value }))}
              title={t('measurementTimeline.source', {
                defaultValue: 'Source',
              })}
              onSelect={(value) => {
                setSource(value);
                setSelected(null);
              }}
            />
          )}
        </View>
      )}
      <View className="flex-row justify-between items-center my-1">
        <Pressable
          accessibilityRole="button"
          disabled={day <= startDate}
          onPress={() => changeDay(addDays(day, -1))}
          accessibilityLabel={t('measurementTimeline.previous', {
            defaultValue: 'Previous day',
          })}
          className="p-2 min-h-11 min-w-11 items-center justify-center"
          hitSlop={8}
        >
          <Icon name="chevron-back" size={18} color={textColor} />
        </Pressable>
        <Text className="text-text-primary">{formatTooltipDate(day)}</Text>
        <Pressable
          accessibilityRole="button"
          disabled={day >= endDate}
          onPress={() => changeDay(addDays(day, 1))}
          accessibilityLabel={t('measurementTimeline.next', {
            defaultValue: 'Next day',
          })}
          className="p-2 min-h-11 min-w-11 items-center justify-center"
          hitSlop={8}
        >
          <Icon name="chevron-forward" size={18} color={textColor} />
        </Pressable>
      </View>
      <View className="flex-row justify-between items-center mb-2">
        <Pressable
          accessibilityRole="button"
          onPress={resetZoom}
          className="p-2 min-h-11 flex-row items-center gap-2"
        >
          <Icon name="replay" size={16} color={lineColor} />
          <Text className="text-text-secondary">
            {t('measurementTimeline.resetZoom', { defaultValue: 'Reset zoom' })}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: inspect }}
          onPress={() => {
            resetZoom();
            setInspect(!inspect);
          }}
          className="p-2 min-h-11 flex-row items-center gap-2"
        >
          <Icon
            name={inspect ? 'swap-horizontal' : 'search'}
            size={16}
            color={lineColor}
          />
          <Text className="text-text-secondary">
            {inspect
              ? t('measurementTimeline.explore', { defaultValue: 'Zoom & pan' })
              : t('measurementTimeline.inspect', {
                  defaultValue: 'Inspect readings',
                })}
          </Text>
        </Pressable>
      </View>
      {readings.isError || (!rawGlucose && categories.isError) ? (
        <Text accessibilityRole="alert" className="text-text-secondary my-3">
          {t('measurementTimeline.error', {
            defaultValue: 'Could not load measurement readings.',
          })}
        </Text>
      ) : readings.isLoading ? (
        <Text className="text-text-secondary my-3">
          {t('measurementTimeline.loading', {
            defaultValue: 'Loading readings…',
          })}
        </Text>
      ) : actual.length === 0 ? (
        <Text className="text-text-secondary my-3">
          {t('measurementTimeline.empty', {
            defaultValue:
              'No timestamped readings for this day. Choose a custom category to view imported/API readings, or sync Blood Glucose from Apple Health.',
          })}
        </Text>
      ) : (
        <>
          <Text
            className="text-text-primary my-3"
            accessibilityLiveRegion="polite"
          >
            {displayed
              ? `${clock(displayed.minutes)} · ${formatLocalizedNumber(displayed.value!, { maximumFractionDigits: 2 })} ${unit}`
              : ''}
          </Text>
          <View testID="measurement-timeline-plot" style={{ height: 300 }}>
            <CartesianChart
              transformState={inspect ? undefined : transformState}
              transformConfig={{
                pinch: { dimensions: 'x' },
                pan: { dimensions: 'x', activeOffsetX: [-10, 10] },
              }}
              data={points}
              xKey="minutes"
              yKeys={['value']}
              domain={{ x: [0, dayLength] }}
              xAxis={{
                font,
                tickCount: 5,
                labelColor: textColor,
                formatXLabel: (minutes) =>
                  formatHourLabel(
                    instantHourMinute(
                      new Date(dayStart + Number(minutes) * 60_000),
                      timezone
                    ).hour,
                    preferences?.time_format
                  ),
              }}
              yAxis={[
                {
                  font,
                  labelColor: textColor,
                  formatYLabel: (value) =>
                    formatLocalizedNumber(Number(value), {
                      maximumFractionDigits: 1,
                    }),
                },
              ]}
            >
              {({ points: plotted, chartBounds }) => (
                <>
                  <ChartLayoutReporter
                    points={plotted.value.filter(
                      (point) => point.yValue !== null
                    )}
                    chartBounds={chartBounds}
                    onChange={updateLayout}
                  />
                  {visibleEvents
                    .filter((event) => event.minutes !== null)
                    .map((event) => (
                      <Rect
                        key={event.id}
                        x={
                          chartBounds.left +
                          (event.minutes! / dayLength) *
                            (chartBounds.right - chartBounds.left)
                        }
                        y={
                          chartBounds.top +
                          (event.endMinutes !== null
                            ? 0
                            : GLUCOSE_CONTEXT_KINDS.indexOf(event.kind) * 6)
                        }
                        width={Math.max(
                          3,
                          (((event.endMinutes ?? event.minutes!) -
                            event.minutes!) /
                            dayLength) *
                            (chartBounds.right - chartBounds.left)
                        )}
                        height={
                          event.endMinutes !== null
                            ? chartBounds.bottom - chartBounds.top
                            : 5
                        }
                        color={contextColor(event.kind)}
                        opacity={event.endMinutes !== null ? 0.14 : 0.95}
                      />
                    ))}
                  <Line
                    points={plotted.value}
                    color={lineColor}
                    strokeWidth={2}
                    curveType="linear"
                    connectMissingData={false}
                  />
                  <Scatter
                    points={plotted.value.filter(
                      (point) => point.yValue !== null
                    )}
                    color={lineColor}
                    radius={2}
                  />
                </>
              )}
            </CartesianChart>
            {inspect && (
              <ChartTouchOverlay
                layout={layout}
                onSelect={setSelected}
                testIDPrefix="measurement-timeline-touch-overlay"
              />
            )}
          </View>
        </>
      )}
      {actual.length > 0 && (
        <View className="mt-2" testID="mobile-events-in-view">
          <Text className="text-text-secondary font-semibold">
            {t('measurementTimeline.eventsInView', {
              defaultValue: 'Events in view',
            })}{' '}
            · {windowEvents.length}
          </Text>
          {windowEvents.length === 0 && (
            <Text className="text-text-muted text-xs mt-1">
              {t('measurementTimeline.noEventsInView', {
                defaultValue: 'No timed events in this window.',
              })}
            </Text>
          )}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="mt-2"
          >
            {windowEvents.map((event) => (
              <View
                key={event.id}
                className="rounded-lg border border-border-subtle p-2 mr-2"
                style={{
                  width: 156,
                  flexShrink: 0,
                  borderLeftWidth: 4,
                  borderLeftColor: contextColor(event.kind),
                }}
              >
                <View className="flex-row items-center gap-2 mb-1">
                  <Icon
                    name={CONTEXT_ICONS[event.kind]}
                    size={18}
                    color={contextColor(event.kind)}
                  />
                  <Text className="text-text-secondary text-xs font-semibold flex-1">
                    {kindLabel(event.kind)}
                  </Text>
                </View>
                {event.label && (
                  <Text className="text-text-primary font-semibold">
                    {event.label}
                  </Text>
                )}
                <Text className="text-text-secondary text-xs">
                  {contextTime(event.start!)}
                  {event.end ? ` – ${contextTime(event.end)}` : ''}
                </Text>
                {event.value !== undefined && (
                  <Text className="text-text-secondary text-xs">
                    {event.kind === 'meal'
                      ? t('measurementTimeline.carbs', {
                          defaultValue: 'Carbs',
                        }) + ' '
                      : ''}
                    {formatLocalizedNumber(event.value, {
                      maximumFractionDigits: 6,
                    })}{' '}
                    {event.unit ?? ''}
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}
      <Text className="text-text-muted text-xs mt-1">
        {inspect
          ? t('measurementTimeline.inspectHint', {
              defaultValue: 'Hold a reading to inspect its value.',
            })
          : t('measurementTimeline.zoomHint', {
              defaultValue: 'Pinch to zoom · drag horizontally to pan',
            })}
      </Text>
      <View className="flex-row justify-between mt-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('measurementTimeline.layerOptions', {
            defaultValue: 'Context layers',
          })}
          accessibilityState={{ expanded: layersOpen }}
          onPress={() => setLayersOpen(!layersOpen)}
          className="p-2 min-h-11 flex-row items-center gap-2"
        >
          <Text className="text-text-secondary">
            {t('measurementTimeline.layerOptions', {
              defaultValue: 'Context layers',
            })}{' '}
            · {layers.length}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: eventsOpen }}
          onPress={() => setEventsOpen(!eventsOpen)}
          className="p-2 min-h-11 flex-row items-center gap-2"
        >
          <Text className="text-text-secondary">
            {t('measurementTimeline.events', { defaultValue: 'Event details' })}{' '}
            · {visibleEvents.length}
          </Text>
        </Pressable>
      </View>
      {layersOpen && (
        <View className="flex-row flex-wrap my-2">
          {GLUCOSE_CONTEXT_KINDS.map((kind) => (
            <Pressable
              key={kind}
              accessibilityRole="checkbox"
              accessibilityLabel={kindLabel(kind)}
              accessibilityState={{ checked: layers.includes(kind) }}
              onPress={() =>
                setLayers((current) =>
                  current.includes(kind)
                    ? current.filter((value) => value !== kind)
                    : [...current, kind]
                )
              }
              className="p-2 min-h-11 flex-row items-center gap-2"
            >
              <Icon
                name={CONTEXT_ICONS[kind]}
                size={18}
                color={layers.includes(kind) ? contextColor(kind) : textColor}
              />
              <Icon
                name={
                  layers.includes(kind)
                    ? 'checkmark-circle-filled'
                    : 'radio-button-off'
                }
                size={16}
                color={layers.includes(kind) ? lineColor : textColor}
              />
              <Text className="text-text-secondary">{kindLabel(kind)}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {context.isLoading && (
        <Text className="text-text-secondary">
          {t('measurementTimeline.contextLoading', {
            defaultValue: 'Loading recorded context…',
          })}
        </Text>
      )}
      {context.isError && (
        <Text accessibilityRole="alert" className="text-text-secondary">
          {t('measurementTimeline.contextError', {
            defaultValue: 'Could not load recorded context.',
          })}
        </Text>
      )}
      {(context.data?.unavailable.length ?? 0) > 0 && (
        <Text className="text-text-secondary">
          {t('measurementTimeline.unavailable', {
            defaultValue: 'Some context is unavailable: {{layers}}',
            layers: context.data?.unavailable.map(kindLabel).join(', '),
          })}
        </Text>
      )}
      {eventsOpen &&
        visibleEvents.map((event) => (
          <Text key={event.id} className="text-text-secondary mt-2">
            {kindLabel(event.kind)} ·{' '}
            {event.start
              ? contextTime(event.start)
              : event.summary === 'total'
                ? t('measurementTimeline.dailyTotal', {
                    defaultValue: 'Daily total',
                  })
                : event.summary === 'average'
                  ? t('measurementTimeline.dailyAverage', {
                      defaultValue: 'Daily average',
                    })
                  : t('measurementTimeline.noTime', {
                      defaultValue: 'Time not recorded',
                    })}
            {event.end ? ` – ${contextTime(event.end)}` : ''}
            {event.label ? ` · ${event.label}` : ''}
            {event.value !== undefined
              ? ` · ${event.kind === 'meal' ? t('measurementTimeline.carbs', { defaultValue: 'Carbs' }) + ' ' : ''}${formatLocalizedNumber(event.value, { maximumFractionDigits: 6 })} ${event.unit ?? ''}`
              : ''}
          </Text>
        ))}
      {eventsOpen && (
        <Text className="text-text-muted text-xs mt-3">
          {t('measurementTimeline.note', {
            defaultValue:
              'These are recorded events, not proven causes. Exercise end times use logged duration. Untimed entries and daily totals are not placed on the curve. Use your sensor app for live readings and alarms.',
          })}
        </Text>
      )}
    </View>
  );
}

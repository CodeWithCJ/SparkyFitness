import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import Toast from 'react-native-toast-message';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  buildCheckinCreateBody,
  buildCheckinUpdateBody,
  checkinEditChanged,
  defaultCheckinTime,
  draftFromEntry,
  hasCheckinContent,
  todayInZone,
  type CheckinDraft,
} from '@workspace/shared';
import type { RootStackParamList } from '../types/navigation';
import { useNativeIOSHeadersActive } from '../services/nativeTabBarPreference';
import { useScreenHeader } from '../hooks/useScreenHeader';
import { FooterSaveBar } from '../components/FormScreenChrome';
import GuidedCheckInStepIndicator from '../components/GuidedCheckInStepIndicator';
import Button from '../components/ui/Button';
import TimeSheet, { type TimeSheetRef } from '../components/TimeSheet';
import MoodHistoryCard from '../components/mood/MoodHistoryCard';
import MoodSupportCheckFailed from '../components/mood/MoodSupportCheckFailed';
import {
  MoodFacePicker,
  MoodJournalField,
  MoodRatingFields,
  MoodTagPicker,
} from '../components/mood/MoodLogFields';
import {
  useCreateMoodCheckin,
  useCustomMoods,
  useDeleteMoodCheckin,
  useMoodCheckinsForDate,
  useMoodEntryForDate,
  useSaveMood,
  useUpdateMoodCheckin,
} from '../hooks/useMood';
import {
  useGuidedCheckIn,
  type GuidedCheckIn,
} from '../hooks/useGuidedCheckIn';
import { useMoodCheckinsSupport } from '../hooks/useMoodCheckinsSupport';
import { useMoodRatingsSupport } from '../hooks/useMoodRatingsSupport';
import { usePreferences } from '../hooks/usePreferences';
import { getApiErrorMessage } from '../services/api/errors';
import type { MoodEntry } from '../services/api/moodApi';
import { offerCheckinRemindersAfterLeaving } from '../services/offerCheckinReminders';
import { getDeviceTimezone, getTodayDate } from '../utils/dateUtils';
import { moodDayInZone } from '../utils/moodDay';
import {
  formatTimeLabel,
  type EntryTimeFormat,
} from '../utils/entryTimeDisplay';

type Props = NativeStackScreenProps<RootStackParamList, 'MoodLog'>;
type Navigation = Props['navigation'];

const DEFAULT_MOOD_VALUE = 50;
/** How often an untouched default time is brought up to the clock. */
const DEFAULT_TIME_REFRESH_MS = 30_000;
const EMPTY_CHECKIN: Omit<CheckinDraft, 'time'> = {
  mood: null,
  energy: null,
  focus: null,
  notes: '',
  tags: [],
};
const noop = () => {};

/**
 * Logs mood. A server that keeps several check-ins a day gets the check-in
 * composer (a new one, or an edit with `checkinId`); one known to keep one
 * entry a day gets the one-entry-per-day form. Until the server check answers
 * the screen shows a spinner, or a retry when the check failed, with Save off,
 * so nothing is ever sent through the wrong contract. No params means a new
 * entry for today.
 */
export default function MoodLogScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const { supported, isLoading, retry, retrying } = useMoodCheckinsSupport();
  const date = route.params?.date;
  const checkinId = route.params?.checkinId;
  // Step 1 of the guided check-in. Opening a check-in to edit is never part
  // of it.
  const flowParams =
    checkinId === undefined ? route.params?.guidedCheckIn : undefined;
  const guidedCheckIn = useGuidedCheckIn({
    navigation,
    step: 'MoodLog',
    date,
    params: flowParams,
  });
  // Back from step 2 reopens the check-in step 1 created, to edit it rather
  // than add another.
  const flowCheckin = guidedCheckIn ? flowParams?.moodCheckin : undefined;
  const title = t('mood.logTitle', { defaultValue: 'Mood' });

  if (isLoading) {
    return (
      <MoodLogLoading
        navigation={navigation}
        title={title}
        guidedCheckIn={guidedCheckIn}
      />
    );
  }
  if (supported === true) {
    return (
      <CheckinMoodLog
        navigation={navigation}
        date={flowCheckin?.date ?? date}
        checkinId={checkinId ?? flowCheckin?.id}
        guidedCheckIn={guidedCheckIn}
      />
    );
  }
  if (supported === false) {
    return (
      <LegacyMoodLog
        navigation={navigation}
        date={date}
        guidedCheckIn={guidedCheckIn}
      />
    );
  }
  return (
    <MoodLogFrame
      title={title}
      onDismiss={() => navigation.goBack()}
      onSave={noop}
      saving={false}
      saveDisabled
      guidedCheckIn={guidedCheckIn}
    >
      <MoodSupportCheckFailed onRetry={retry} retrying={retrying} />
    </MoodLogFrame>
  );
}

interface MoodLogFrameProps {
  title: string;
  /** Also sets the native header's title, which otherwise reads "Mood". */
  nativeTitle?: string;
  onDismiss: () => void;
  onSave: () => void;
  saving: boolean;
  saveDisabled: boolean;
  /** Why Save is off, kept in view above the scrolling body. */
  hint?: string;
  /** Set when the screen is step 1 of the guided check-in. */
  guidedCheckIn?: GuidedCheckIn | null;
  /** Whether Skip has to ask before dropping the form's edits. */
  hasUnsavedEdits?: boolean;
  children: ReactNode;
}

/**
 * Where a successful save leads: on to the next step of the guided check-in,
 * or back, offering reminders once after a new check-in.
 */
function leaveAfterMoodSave(
  navigation: Navigation,
  t: TFunction,
  guidedCheckIn: GuidedCheckIn | null | undefined,
  isNewCheckin: boolean,
  created?: MoodEntry
) {
  if (guidedCheckIn) {
    // The reminder offer waits for the end of the check-in, and the flow
    // keeps the check-in it created so going back edits it.
    guidedCheckIn.advance({
      saved: true,
      offerReminders: isNewCheckin,
      moodCheckin: created
        ? { id: created.id, date: created.entry_date }
        : undefined,
    });
    return;
  }
  navigation.goBack();
  if (isNewCheckin) offerCheckinRemindersAfterLeaving(t);
}

/** Header, scrolling body and Save, the same in every mode. */
function MoodLogFrame({
  title,
  nativeTitle,
  onDismiss,
  onSave,
  saving,
  saveDisabled,
  hint,
  guidedCheckIn,
  hasUnsavedEdits = false,
  children,
}: MoodLogFrameProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const usesNativeHeader = useNativeIOSHeadersActive();
  const saveLabel = guidedCheckIn
    ? t('guidedCheckIn.saveAndContinue', { defaultValue: 'Save & continue' })
    : t('common.save', { defaultValue: 'Save' });

  const header = useScreenHeader({
    title,
    nativeTitle,
    left: {
      kind: 'dismiss',
      onPress: onDismiss,
      // In the check-in the X leaves the whole flow, not just this form.
      accessibilityLabel: guidedCheckIn
        ? t('common.close', { defaultValue: 'Close' })
        : t('common.cancel', { defaultValue: 'Cancel' }),
    },
    right: [
      {
        kind: 'primary',
        label: saveLabel,
        onPress: onSave,
        busy: saving,
        disabled: saveDisabled,
        placement: 'native-only',
        identifier: 'mood-log-save',
      },
    ],
  });

  return (
    <View
      className="flex-1 bg-background"
      style={usesNativeHeader ? undefined : { paddingTop: insets.top }}
    >
      {header}
      {guidedCheckIn && (
        <GuidedCheckInStepIndicator
          step={guidedCheckIn.step}
          total={guidedCheckIn.total}
          onSkip={() => guidedCheckIn.skip(hasUnsavedEdits)}
          skipDisabled={saving}
        />
      )}
      {hint && (
        <Text className="px-4 pt-2 text-xs text-text-muted text-center">
          {hint}
        </Text>
      )}
      <KeyboardAwareScrollView
        className="flex-1 px-4 py-3"
        contentContainerClassName="gap-4 pb-6"
        keyboardShouldPersistTaps="handled"
        bottomOffset={80}
      >
        {children}
      </KeyboardAwareScrollView>
      {!usesNativeHeader && (
        <FooterSaveBar
          onPress={onSave}
          busy={saving}
          disabled={saveDisabled}
          label={saveLabel}
        />
      )}
    </View>
  );
}

function MoodLogLoading({
  navigation,
  title,
  nativeTitle,
  guidedCheckIn,
}: {
  navigation: Navigation;
  title: string;
  nativeTitle?: string;
  guidedCheckIn?: GuidedCheckIn | null;
}) {
  const { t } = useTranslation();
  return (
    <MoodLogFrame
      title={title}
      nativeTitle={nativeTitle}
      onDismiss={() => navigation.goBack()}
      onSave={noop}
      saving={false}
      saveDisabled
      guidedCheckIn={guidedCheckIn}
    >
      <ActivityIndicator
        className="py-8"
        accessibilityLabel={t('common.loading', { defaultValue: 'Loading...' })}
      />
    </MoodLogFrame>
  );
}

function MoodLogDateNote({ date }: { date: string }) {
  const { t } = useTranslation();
  return (
    <Text className="text-xs text-text-muted">
      {t('mood.loggingForDate', {
        defaultValue: 'Logging for {{date}}',
        date,
      })}
    </Text>
  );
}

/** One entry per day through the legacy POST, for servers without check-ins. */
function LegacyMoodLog({
  navigation,
  date,
  guidedCheckIn,
}: {
  navigation: Navigation;
  date: string | undefined;
  guidedCheckIn: GuidedCheckIn | null;
}) {
  const { t } = useTranslation();
  const targetDate = date ?? getTodayDate();
  const {
    entry: existing,
    isLoading: entryLoading,
    isError: entryError,
  } = useMoodEntryForDate(targetDate);
  const customMoods = useCustomMoods();
  const saveMood = useSaveMood();
  const { supported: ratingsSupported } = useMoodRatingsSupport();
  const showRatings = ratingsSupported !== false;

  // Edits are held as overrides on top of the saved entry so the form follows
  // it once it loads, without an effect copying server state into local state.
  const [moodOverride, setMoodOverride] = useState<number | null>(null);
  const [tagsOverride, setTagsOverride] = useState<string[] | null>(null);
  const [notesOverride, setNotesOverride] = useState<string | null>(null);
  const moodValue = moodOverride ?? existing?.mood_value ?? DEFAULT_MOOD_VALUE;
  const tags = tagsOverride ?? existing?.mood_tags ?? [];
  const notes = notesOverride ?? existing?.notes ?? '';
  // undefined = untouched, so only ratings changed on this screen are sent;
  // null = cleared. A day's rating set elsewhere is never overwritten.
  const [energyOverride, setEnergyOverride] = useState<
    number | null | undefined
  >(undefined);
  const [focusOverride, setFocusOverride] = useState<number | null | undefined>(
    undefined
  );
  const energy =
    energyOverride !== undefined
      ? energyOverride
      : (existing?.energy_value ?? null);
  const focus =
    focusOverride !== undefined
      ? focusOverride
      : (existing?.focus_value ?? null);

  const isToday = targetDate === getTodayDate();
  const entryReady = !entryLoading && !entryError;
  const hasUnsavedEdits =
    moodOverride !== null ||
    tagsOverride !== null ||
    notesOverride !== null ||
    energyOverride !== undefined ||
    focusOverride !== undefined;

  const handleSave = async () => {
    if (!entryReady || saveMood.isPending) return;
    if (guidedCheckIn?.hasLeft()) return;
    // An untouched form would save the default mood, so the check-in just
    // moves on.
    if (guidedCheckIn && !hasUnsavedEdits) {
      guidedCheckIn.advance();
      return;
    }
    const sendEnergy = showRatings && energyOverride !== undefined;
    const sendFocus = showRatings && focusOverride !== undefined;
    let saved: Awaited<ReturnType<typeof saveMood.mutateAsync>>;
    try {
      saved = await saveMood.mutateAsync({
        mood_value: moodValue,
        mood_tags: tags,
        notes,
        entry_date: targetDate,
        ...(sendEnergy && { energy_value: energyOverride }),
        ...(sendFocus && { focus_value: focusOverride }),
      });
    } catch {
      // useSaveMood already reports the failure; stay on the screen.
      return;
    }
    // An older server ignores the fields and its row has no energy_value key.
    // An empty (non-object) response tells us nothing, so it shows no notice.
    const savedIsRow = saved != null && typeof saved === 'object';
    if ((sendEnergy || sendFocus) && savedIsRow && !('energy_value' in saved)) {
      Toast.show({
        type: 'info',
        text1: t('mood.ratingsUnsupported', {
          defaultValue:
            "Your server doesn't save energy and focus yet. Update SparkyFitness to keep them.",
        }),
      });
    }
    // Saving over the day's existing entry is an edit, and only a new
    // check-in offers reminders, as in the composer.
    leaveAfterMoodSave(navigation, t, guidedCheckIn, !existing);
  };

  return (
    <MoodLogFrame
      title={t('mood.logTitle', { defaultValue: 'Mood' })}
      onDismiss={() => navigation.goBack()}
      onSave={handleSave}
      saving={saveMood.isPending}
      saveDisabled={!entryReady || saveMood.isPending}
      guidedCheckIn={guidedCheckIn}
      hasUnsavedEdits={hasUnsavedEdits}
    >
      {entryLoading && (
        <Text className="text-xs text-text-muted">
          {t('common.loading', { defaultValue: 'Loading...' })}
        </Text>
      )}
      {entryError && (
        <Text className="text-xs text-text-muted">
          {t('mood.loadFailed', {
            defaultValue: "Could not load this day's mood",
          })}
        </Text>
      )}
      {!isToday && <MoodLogDateNote date={targetDate} />}
      <MoodFacePicker value={moodValue} onChange={setMoodOverride} />
      {showRatings && (
        <MoodRatingFields
          energy={energy}
          onEnergyChange={setEnergyOverride}
          focus={focus}
          onFocusChange={setFocusOverride}
        />
      )}
      <MoodTagPicker
        selected={tags}
        onChange={setTagsOverride}
        customMoods={customMoods}
      />
      <MoodJournalField value={notes} onChangeText={setNotesOverride} />
      <MoodHistoryCard customMoods={customMoods} />
    </MoodLogFrame>
  );
}

/** Several check-ins a day: a new one, or the one named by `checkinId`. */
function CheckinMoodLog({
  navigation,
  date,
  checkinId,
  guidedCheckIn,
}: {
  navigation: Navigation;
  date: string | undefined;
  checkinId: string | undefined;
  guidedCheckIn: GuidedCheckIn | null;
}) {
  const { preferences } = usePreferences();
  const tz = preferences?.timezone || getDeviceTimezone();
  const timeFormat = preferences?.time_format;
  // No date (a reminder tap, say) means a new check-in for today.
  const day = date ?? todayInZone(tz);

  if (checkinId === undefined) {
    return (
      <CheckinComposer
        navigation={navigation}
        date={day}
        tz={tz}
        timeFormat={timeFormat}
        editing={null}
        guidedCheckIn={guidedCheckIn}
      />
    );
  }
  return (
    <CheckinEditLoader
      navigation={navigation}
      date={day}
      tz={tz}
      timeFormat={timeFormat}
      checkinId={checkinId}
      guidedCheckIn={guidedCheckIn}
    />
  );
}

interface CheckinContext {
  navigation: Navigation;
  date: string;
  tz: string;
  timeFormat: EntryTimeFormat | undefined;
}

/** Finds the check-in to edit in its day's list. */
function CheckinEditLoader({
  checkinId,
  guidedCheckIn,
  ...context
}: CheckinContext & {
  checkinId: string;
  guidedCheckIn: GuidedCheckIn | null;
}) {
  const { t } = useTranslation();
  const { navigation, date } = context;
  const { checkins, isLoading, isFetching, isError, refetch } =
    useMoodCheckinsForDate(date);
  const found = checkins?.find((row) => row.id === checkinId) ?? null;
  // Hold on to the row once found: deleting it from this screen refetches the
  // day without it before the screen has closed, which must not flash the
  // missing state.
  const [row, setRow] = useState(found);
  if (found !== null && found !== row) setRow(found);

  if (row) {
    return (
      <CheckinComposer
        key={row.id}
        {...context}
        editing={row}
        guidedCheckIn={guidedCheckIn}
      />
    );
  }

  const title = t('mood.editCheckinTitle', { defaultValue: 'Edit check-in' });
  // In the check-in a missing row starts a new check-in, so a cached list
  // still being refreshed (one cached before step 1 created the row) must not
  // count as the answer.
  if (isLoading || (guidedCheckIn && isFetching)) {
    return (
      <MoodLogLoading
        navigation={navigation}
        title={title}
        nativeTitle={title}
        guidedCheckIn={guidedCheckIn}
      />
    );
  }
  // The check-in step 1 created is gone (deleted elsewhere): the step starts
  // a new one instead.
  if (guidedCheckIn && !isError) {
    return (
      <CheckinComposer
        key="new"
        {...context}
        editing={null}
        guidedCheckIn={guidedCheckIn}
      />
    );
  }
  return (
    <MoodLogFrame
      title={title}
      nativeTitle={title}
      onDismiss={() => navigation.goBack()}
      onSave={noop}
      saving={false}
      saveDisabled
      guidedCheckIn={guidedCheckIn}
    >
      <View className="items-center gap-3 py-8">
        <Text className="text-sm text-text-secondary text-center">
          {isError
            ? t('mood.loadFailed', {
                defaultValue: "Could not load this day's mood",
              })
            : t('mood.checkinMissing', {
                defaultValue: 'This check-in no longer exists.',
              })}
        </Text>
        {/* In the check-in, Back here would close the whole flow (the steps
            replace one another), so it offers a retry; Skip and the X stay. */}
        {guidedCheckIn ? (
          <Button
            variant="outline"
            onPress={() => void refetch()}
            accessibilityRole="button"
          >
            {t('common.retry', { defaultValue: 'Retry' })}
          </Button>
        ) : (
          <Button
            variant="outline"
            onPress={() => navigation.goBack()}
            accessibilityRole="button"
          >
            {t('common.back', { defaultValue: 'Back' })}
          </Button>
        )}
      </View>
    </MoodLogFrame>
  );
}

/** The check-in form; `editing` is the check-in being edited, or null. */
function CheckinComposer({
  navigation,
  date,
  tz,
  timeFormat,
  editing,
  guidedCheckIn,
}: CheckinContext & {
  editing: MoodEntry | null;
  guidedCheckIn?: GuidedCheckIn | null;
}) {
  const { t } = useTranslation();
  const customMoods = useCustomMoods();
  const createCheckin = useCreateMoodCheckin();
  const updateCheckin = useUpdateMoodCheckin();
  const deleteCheckin = useDeleteMoodCheckin();
  const timeSheetRef = useRef<TimeSheetRef>(null);

  // What the user changed, over the check-in being edited or an empty one, so
  // the form follows a refetched row without an effect copying it in.
  const [changes, setChanges] = useState<Partial<CheckinDraft>>({});
  const change = (patch: Partial<CheckinDraft>) =>
    setChanges((prev) => ({ ...prev, ...patch }));
  // Until the user picks a time, an edit keeps the check-in's own and a new
  // check-in's is the default for now, which follows the clock and the zone.
  const timeTouched = changes.time !== undefined;
  const [now, setNow] = useState(() => new Date());
  // The device's today and the zone's today both count as today, and a new
  // check-in for today goes on the zone's own today, at the zone's clock, so
  // its day and time are never a day apart. Until a time is picked it stays
  // on today past midnight too, so an untouched time is always "now".
  const zoneToday = todayInZone(tz);
  const [openedForToday] = useState(
    () => editing === null && moodDayInZone(date, tz) === zoneToday
  );
  const followsToday = openedForToday && !timeTouched;
  const checkinDay = followsToday ? zoneToday : moodDayInZone(date, tz);
  const isToday = checkinDay === zoneToday;
  const base: CheckinDraft = editing
    ? draftFromEntry(editing, tz)
    : { ...EMPTY_CHECKIN, time: defaultCheckinTime(checkinDay, tz, now) };
  const draft: CheckinDraft = { ...base, ...changes };

  // A screen left open keeps showing "now" until the user sets a time.
  const followsClock = editing === null && !timeTouched && isToday;
  useEffect(() => {
    if (!followsClock) return;
    const id = setInterval(() => setNow(new Date()), DEFAULT_TIME_REFRESH_MS);
    return () => clearInterval(id);
  }, [followsClock]);

  const saving = createCheckin.isPending || updateCheckin.isPending;
  const busy = saving || deleteCheckin.isPending;
  const hasContent = hasCheckinContent(draft);
  const saveDisabled = !hasContent || busy;

  // These mutations leave errors to the screen: the server's reason when it
  // gives one (a refused edit of a synced mood, say), else the fallback.
  const showError = (error: unknown, fallback: string) =>
    Toast.show({
      type: 'error',
      text1: getApiErrorMessage(error) ?? fallback,
    });

  const handleSave = async () => {
    if (saveDisabled) return;
    // A create is not idempotent: once the check-in moved on, a press still
    // queued behind the transition must not add a second check-in.
    if (guidedCheckIn?.hasLeft()) return;
    if (editing && !checkinEditChanged(editing, draft, date, tz)) {
      // An edit that changes nothing sends nothing.
      if (guidedCheckIn) guidedCheckIn.advance();
      else navigation.goBack();
      return;
    }
    let created: MoodEntry | undefined;
    try {
      if (editing) {
        await updateCheckin.mutateAsync({
          id: editing.id,
          body: buildCheckinUpdateBody(editing, draft, date, tz),
        });
      } else {
        // An untouched time means "now" as the check-in is sent, not as it
        // was when the screen opened or last re-rendered, and so does its day.
        const sentDay = followsToday ? todayInZone(tz) : checkinDay;
        const sent = timeTouched
          ? draft
          : { ...draft, time: defaultCheckinTime(sentDay, tz) };
        created = await createCheckin.mutateAsync(
          buildCheckinCreateBody(sent, sentDay, tz)
        );
      }
    } catch (error) {
      showError(
        error,
        t('mood.saveFailed', { defaultValue: 'Could not save mood' })
      );
      return;
    }
    // The single success point after a save. Only a new check-in prompts;
    // an edit never does.
    leaveAfterMoodSave(navigation, t, guidedCheckIn, !editing, created);
  };

  // Set at once rather than on the next render, so a second confirm sent
  // before the screen re-renders cannot send a second delete.
  const deleteInFlight = useRef(false);

  // The confirm's callback: refuses while anything is being sent.
  const handleDelete = async (id: string) => {
    if (busy || deleteInFlight.current) return;
    deleteInFlight.current = true;
    try {
      await deleteCheckin.mutateAsync(id);
    } catch (error) {
      deleteInFlight.current = false;
      showError(
        error,
        t('mood.deleteFailed', { defaultValue: 'Could not delete check-in' })
      );
      return;
    }
    navigation.goBack();
  };

  const confirmDelete = (id: string) =>
    Alert.alert(
      t('mood.deleteCheckinConfirm', {
        defaultValue: 'Delete this check-in?',
      }),
      t('mood.deleteCheckinMessage', {
        defaultValue: 'This removes the check-in and its journal entry.',
      }),
      [
        {
          text: t('common.cancel', { defaultValue: 'Cancel' }),
          style: 'cancel',
        },
        {
          text: t('common.delete', { defaultValue: 'Delete' }),
          style: 'destructive',
          onPress: () => void handleDelete(id),
        },
      ]
    );

  const title = editing
    ? t('mood.editCheckinTitle', { defaultValue: 'Edit check-in' })
    : t('mood.newCheckinTitle', { defaultValue: 'New check-in' });
  const timeLabel = formatTimeLabel(draft.time, timeFormat) ?? draft.time;
  const deleteLabel = t('mood.deleteCheckin', {
    defaultValue: 'Delete check-in',
  });

  return (
    <MoodLogFrame
      title={title}
      nativeTitle={title}
      onDismiss={() => navigation.goBack()}
      onSave={handleSave}
      saving={saving}
      saveDisabled={saveDisabled}
      guidedCheckIn={guidedCheckIn}
      hasUnsavedEdits={Object.keys(changes).length > 0}
      hint={
        !hasContent
          ? t('mood.checkinNeedsContent', {
              defaultValue:
                'Add a mood, energy, focus, a tag or a journal entry to save.',
            })
          : undefined
      }
    >
      {!isToday && <MoodLogDateNote date={date} />}
      <TouchableOpacity
        onPress={() => timeSheetRef.current?.present()}
        accessibilityRole="button"
        accessibilityLabel={t('mood.timeA11y', {
          defaultValue: 'Time, {{time}}',
          time: timeLabel,
        })}
        className="bg-surface border border-border p-3.5 rounded-2xl flex-row items-center justify-between"
      >
        <Text className="text-sm font-semibold text-text-primary">
          {t('mood.time', { defaultValue: 'Time' })}
        </Text>
        <Text className="text-sm font-semibold text-accent-primary">
          {timeLabel}
        </Text>
      </TouchableOpacity>
      <MoodFacePicker
        value={draft.mood}
        onChange={(mood) => change({ mood })}
        clearable
      />
      <MoodRatingFields
        energy={draft.energy}
        onEnergyChange={(energy) => change({ energy })}
        focus={draft.focus}
        onFocusChange={(focus) => change({ focus })}
      />
      <MoodTagPicker
        selected={draft.tags}
        onChange={(tags) => change({ tags })}
        customMoods={customMoods}
      />
      <MoodJournalField
        value={draft.notes}
        onChangeText={(notes) => change({ notes })}
      />
      {/* The check-in keeps to logging; a check-in is deleted from its day. */}
      {editing && !guidedCheckIn && (
        <Button
          variant="destructive"
          onPress={() => confirmDelete(editing.id)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={deleteLabel}
        >
          {deleteLabel}
        </Button>
      )}
      <MoodHistoryCard customMoods={customMoods} />
      <TimeSheet
        ref={timeSheetRef}
        value={draft.time}
        onSelectTime={(time) => change({ time })}
        timeFormat={timeFormat}
      />
    </MoodLogFrame>
  );
}

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences, type WeightUnit } from '@/contexts/PreferencesContext';
import { formatWeight } from '@/utils/numberFormatting';
import { FaChevronDown, FaChevronUp, FaDumbbell } from 'react-icons/fa';
import { useBodyMapSvgQuery } from '@/hooks/Exercises/useExercises';
import { useGroupedWorkoutSession } from '@/hooks/Exercises/useExercises';
import { svgClassToSchemaName } from '@/constants/exercises';
import type { ExerciseEntryResponse } from '@workspace/shared';
import './WorkoutSessionBodyMap.css';

const formatExerciseName = (name: string | undefined | null): string => {
  if (!name) return 'Exercise';
  if (name.includes('_') || name === name.toUpperCase()) {
    return name
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }
  return name;
};

interface ExerciseSetItem {
  setNumber: number;
  exerciseName: string;
  durationSeconds: number;
  restSeconds: number;
  reps: number;
  weightKg: number;
  volumeKg: number;
  setType: string;
}

interface GroupedExercise {
  exerciseName: string;
  totalTimeSeconds: number;
  totalRestSeconds: number;
  totalReps: number;
  totalVolumeKg: number;
  sets: ExerciseSetItem[];
}

interface MuscleGroupSummary {
  muscleName: string;
  totalTimeSeconds: number;
  totalReps: number;
  totalVolumeKg: number;
  sets: ExerciseSetItem[];
}

interface WorkoutSessionBreakdownProps {
  /** The single exercise entry being viewed. If it belongs to a preset session, the
   *  full session (all sibling exercises) is fetched relationally via its
   *  exercise_preset_entry_id — this component never reads the raw provider JSON blob. */
  exerciseEntry?: ExerciseEntryResponse | Record<string, unknown>;
}

export const WorkoutSessionBreakdown = ({
  exerciseEntry,
}: WorkoutSessionBreakdownProps) => {
  const { t } = useTranslation();
  const { weightUnit } = usePreferences();
  // Guess synchronously from the entry actually passed in — this is exact for
  // a standalone entry, and merely a best-effort guess for a preset session
  // (whose sibling exercises load async); effectiveActiveTab below corrects
  // the guess once the full session's primary_muscles are known.
  const [activeTab, setActiveTab] = useState<'sets' | 'exercises' | 'muscles'>(
    () => {
      const snapshot = exerciseEntry?.['exercise_snapshot'] as
        | Record<string, unknown>
        | undefined;
      const primary = snapshot?.['primary_muscles'] as
        | string[]
        | null
        | undefined;
      return primary && primary.length > 0 ? 'muscles' : 'sets';
    }
  );
  const [expandedExercises, setExpandedExercises] = useState<
    Record<string, boolean>
  >({});

  const toggleExerciseExpand = (name: string) => {
    setExpandedExercises((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const [expandedMuscles, setExpandedMuscles] = useState<
    Record<string, boolean>
  >({});

  const toggleMuscleExpand = (name: string) => {
    setExpandedMuscles((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const presetEntryId = exerciseEntry?.['exercise_preset_entry_id'] as
    | string
    | null
    | undefined as string | undefined;
  const { data: groupedSession } = useGroupedWorkoutSession(
    presetEntryId ?? undefined
  );

  // The relational list of exercises this session's summaries are built from: every
  // child exercise of the preset session, or just the single entry if it isn't part of
  // one (e.g. a standalone strength activity).
  const sessionExercises = useMemo(() => {
    if (groupedSession?.exercises && groupedSession.exercises.length > 0) {
      return groupedSession.exercises;
    }
    return exerciseEntry ? [exerciseEntry as ExerciseEntryResponse] : [];
  }, [groupedSession, exerciseEntry]);

  const setList = useMemo<ExerciseSetItem[]>(() => {
    let setCounter = 1;
    const items: ExerciseSetItem[] = [];

    for (const entry of sessionExercises) {
      const snapshot = entry?.exercise_snapshot as
        | Record<string, unknown>
        | undefined;
      const exerciseName = formatExerciseName(
        (snapshot?.['name'] as string) || 'Exercise'
      );
      const entrySets =
        (entry?.['sets'] as
          | Array<{
              set_number?: number;
              reps?: number | null;
              weight?: number | null;
              duration?: number | null;
              rest_time?: number | null;
              set_type?: string | null;
            }>
          | undefined) ?? [];

      for (const set of entrySets) {
        const reps = set?.reps || 0;
        const weightKg = set?.weight || 0;
        items.push({
          setNumber: set?.set_number || setCounter,
          exerciseName,
          durationSeconds: set?.duration || 0,
          restSeconds: set?.rest_time || 0,
          reps,
          weightKg,
          volumeKg: reps * weightKg,
          setType: set?.set_type || 'Working Set',
        });
        setCounter++;
      }
    }

    return items;
  }, [sessionExercises]);

  const groupedExercises = useMemo<GroupedExercise[]>(() => {
    const map = new Map<string, GroupedExercise>();

    setList.forEach((setItem) => {
      const name = setItem.exerciseName;
      if (!map.has(name)) {
        map.set(name, {
          exerciseName: name,
          totalTimeSeconds: 0,
          totalRestSeconds: 0,
          totalReps: 0,
          totalVolumeKg: 0,
          sets: [],
        });
      }
      const group = map.get(name)!;
      group.totalTimeSeconds += setItem.durationSeconds;
      group.totalRestSeconds += setItem.restSeconds;
      group.totalReps += setItem.reps;
      group.totalVolumeKg += setItem.volumeKg;
      group.sets.push(setItem);
    });

    return Array.from(map.values());
  }, [setList]);

  // Per-exercise muscle lookup, driven entirely by each exercise's relational
  // exercise_snapshot.primary_muscles/secondary_muscles (populated at log time from the
  // exercises table — see garminExerciseMapper.ts for how Garmin-synced exercises get
  // theirs). No name/category guessing.
  const musclesByExerciseName = useMemo(() => {
    const map = new Map<string, { primary: string[]; secondary: string[] }>();
    for (const entry of sessionExercises) {
      const snapshot = entry?.exercise_snapshot as
        | Record<string, unknown>
        | undefined;
      const exerciseName = formatExerciseName(
        (snapshot?.['name'] as string) || 'Exercise'
      );
      const primary = (snapshot?.['primary_muscles'] as string[] | null) || [];
      const secondary =
        (snapshot?.['secondary_muscles'] as string[] | null) || [];
      map.set(exerciseName, { primary, secondary });
    }
    return map;
  }, [sessionExercises]);

  const muscleGroupSummaries = useMemo<MuscleGroupSummary[]>(() => {
    const map = new Map<string, MuscleGroupSummary>();

    setList.forEach((item) => {
      const muscles = musclesByExerciseName.get(item.exerciseName);
      const targetMuscles =
        muscles && muscles.primary.length > 0
          ? muscles.primary
          : ['Untargeted'];

      targetMuscles.forEach((muscle) => {
        if (!map.has(muscle)) {
          map.set(muscle, {
            muscleName: muscle,
            totalTimeSeconds: 0,
            totalReps: 0,
            totalVolumeKg: 0,
            sets: [],
          });
        }
        const summary = map.get(muscle)!;
        summary.totalTimeSeconds += item.durationSeconds;
        summary.totalReps += item.reps;
        summary.totalVolumeKg += item.volumeKg;
        summary.sets.push(item);
      });
    });

    return Array.from(map.values()).sort((a, b) =>
      a.muscleName.localeCompare(b.muscleName)
    );
  }, [setList, musclesByExerciseName]);

  const primaryMusclesTargeted = useMemo(() => {
    const set = new Set<string>();
    musclesByExerciseName.forEach(({ primary }) =>
      primary.forEach((m) => set.add(m.toLowerCase()))
    );
    return Array.from(set);
  }, [musclesByExerciseName]);

  const secondaryMusclesTargeted = useMemo(() => {
    const set = new Set<string>();
    musclesByExerciseName.forEach(({ secondary }) =>
      secondary.forEach((m) => set.add(m.toLowerCase()))
    );
    return Array.from(set);
  }, [musclesByExerciseName]);

  // Cardio activities (HealthKit/Health Connect/Garmin) generally have no
  // primary_muscles snapshot at all, so this tab would otherwise show a body
  // diagram where every muscle reads "Untargeted" — not useful, hide it.
  const hasTargetedMuscles = primaryMusclesTargeted.length > 0;

  // The lazy useState guess above is exact for a standalone entry but only a
  // best-effort guess for a preset session (whose sibling exercises resolve
  // async) — derive the tab actually used for rendering from the now-final
  // hasTargetedMuscles instead of trusting the stored guess, so a late-arriving
  // "no muscles after all" answer can never render the Untargeted view.
  const effectiveActiveTab =
    !hasTargetedMuscles && activeTab === 'muscles' ? 'sets' : activeTab;

  if (setList.length === 0) return null;

  const formatSeconds = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = (totalSecs % 60).toFixed(1);
    return `${mins}:${Number(secs) < 10 ? '0' : ''}${secs}`;
  };

  // formatWeight takes a kg value and converts to `unit` itself, so do NOT
  // pre-convert here — doing both applies the kg->lbs factor twice.
  const formatWeightValue = (kg: number) => {
    if (kg <= 0) return '--';
    return formatWeight(kg, weightUnit as WeightUnit);
  };

  return (
    <div className="workout-session-breakdown border rounded-xl p-4 sm:p-6 bg-card text-card-foreground shadow-sm mb-8 space-y-6">
      <div className="flex border-b border-border space-x-2 sm:space-x-4">
        <button
          className={`pb-3 px-4 text-sm font-semibold transition-colors border-b-2 ${
            effectiveActiveTab === 'sets'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('sets')}
        >
          {t('workoutReport.sets', 'Sets')} ({setList.length})
        </button>
        <button
          className={`pb-3 px-4 text-sm font-semibold transition-colors border-b-2 ${
            effectiveActiveTab === 'exercises'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('exercises')}
        >
          {t('workoutReport.exercises', 'Exercises')} ({groupedExercises.length}
          )
        </button>
        {hasTargetedMuscles && (
          <button
            className={`pb-3 px-4 text-sm font-semibold transition-colors border-b-2 ${
              effectiveActiveTab === 'muscles'
                ? 'border-primary text-primary font-bold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('muscles')}
          >
            {t('workoutReport.primaryMuscles', 'Primary Muscles')}
          </button>
        )}
      </div>

      {effectiveActiveTab === 'sets' && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/50 border-b text-xs font-semibold text-muted-foreground uppercase">
              <tr>
                <th className="py-3 px-3 w-16">
                  {t('workoutReport.set', 'Set')}
                </th>
                <th className="py-3 px-3">
                  {t('workoutReport.exerciseName', 'Exercise Name')}
                </th>
                <th className="py-3 px-3">{t('workoutReport.time', 'Time')}</th>
                <th className="py-3 px-3">{t('workoutReport.rest', 'Rest')}</th>
                <th className="py-3 px-3">{t('workoutReport.reps', 'Reps')}</th>
                <th className="py-3 px-3">
                  {t('workoutReport.weight', 'Weight')}
                </th>
                <th className="py-3 px-3">
                  {t('workoutReport.volume', 'Volume')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {setList.map((setItem, idx) => (
                <tr
                  key={`${setItem.exerciseName}-${setItem.setNumber}-${idx}`}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="py-3 px-3 font-medium">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                      {setItem.setNumber}
                    </span>
                  </td>
                  <td className="py-3 px-3 font-semibold text-foreground">
                    {formatExerciseName(setItem.exerciseName)}
                  </td>
                  <td className="py-3 px-3 text-muted-foreground">
                    {formatSeconds(setItem.durationSeconds)}
                  </td>
                  <td className="py-3 px-3 text-muted-foreground">
                    {formatSeconds(setItem.restSeconds)}
                  </td>
                  <td className="py-3 px-3 font-medium">
                    {setItem.reps > 0 ? setItem.reps : '--'}
                  </td>
                  <td className="py-3 px-3 font-medium">
                    {formatWeightValue(setItem.weightKg)}
                  </td>
                  <td className="py-3 px-3 font-medium">
                    {setItem.volumeKg > 0
                      ? formatWeightValue(setItem.volumeKg)
                      : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {effectiveActiveTab === 'exercises' && (
        <div className="space-y-4">
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b text-xs font-semibold text-muted-foreground uppercase">
                <tr>
                  <th className="py-3 px-3 w-10"></th>
                  <th className="py-3 px-3">
                    {t('workoutReport.exerciseName', 'Exercise Name')}
                  </th>
                  <th className="py-3 px-3">
                    {t('workoutReport.totalTime', 'Time')}
                  </th>
                  <th className="py-3 px-3">
                    {t('workoutReport.rest', 'Rest')}
                  </th>
                  <th className="py-3 px-3">
                    {t('workoutReport.reps', 'Reps')}
                  </th>
                  <th className="py-3 px-3">
                    {t('workoutReport.volume', 'Volume')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {groupedExercises.map((group) => {
                  const isExpanded = expandedExercises[group.exerciseName];
                  return (
                    <React.Fragment key={group.exerciseName}>
                      <tr
                        className="hover:bg-muted/40 cursor-pointer font-medium transition-colors"
                        onClick={() => toggleExerciseExpand(group.exerciseName)}
                      >
                        <td className="py-3 px-3 text-center">
                          {isExpanded ? (
                            <FaChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                          ) : (
                            <FaChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </td>
                        <td className="py-3 px-3 font-bold text-foreground flex items-center gap-2">
                          <FaDumbbell className="w-4 h-4 text-primary" />
                          {formatExerciseName(group.exerciseName)}
                          <span className="text-xs font-normal text-muted-foreground">
                            ({group.sets.length}{' '}
                            {group.sets.length === 1 ? 'set' : 'sets'})
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {formatSeconds(group.totalTimeSeconds)}
                        </td>
                        <td className="py-3 px-3 text-muted-foreground">
                          {formatSeconds(group.totalRestSeconds)}
                        </td>
                        <td className="py-3 px-3">
                          {group.totalReps > 0 ? group.totalReps : '--'}
                        </td>
                        <td className="py-3 px-3 font-bold text-primary">
                          {group.totalVolumeKg > 0
                            ? formatWeightValue(group.totalVolumeKg)
                            : '--'}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={6} className="bg-muted/20 p-4">
                            <table className="w-full text-xs text-left border rounded bg-background">
                              <thead className="bg-muted/50 border-b">
                                <tr>
                                  <th className="py-2 px-3">Set #</th>
                                  <th className="py-2 px-3">Time</th>
                                  <th className="py-2 px-3">Rest</th>
                                  <th className="py-2 px-3">Reps</th>
                                  <th className="py-2 px-3">Weight</th>
                                  <th className="py-2 px-3">Volume</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {group.sets.map((s, idx) => (
                                  <tr key={`${s.setNumber}-${idx}`}>
                                    <td className="py-2 px-3 font-semibold">
                                      Set {s.setNumber}
                                    </td>
                                    <td className="py-2 px-3">
                                      {formatSeconds(s.durationSeconds)}
                                    </td>
                                    <td className="py-2 px-3">
                                      {formatSeconds(s.restSeconds)}
                                    </td>
                                    <td className="py-2 px-3">{s.reps}</td>
                                    <td className="py-2 px-3">
                                      {formatWeightValue(s.weightKg)}
                                    </td>
                                    <td className="py-2 px-3 font-semibold">
                                      {s.volumeKg > 0
                                        ? formatWeightValue(s.volumeKg)
                                        : '--'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {effectiveActiveTab === 'muscles' && (
        <div className="space-y-6">
          <WorkoutSessionBodyMap
            primaryMuscles={primaryMusclesTargeted}
            secondaryMuscles={secondaryMusclesTargeted}
          />

          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50 border-b text-xs font-bold text-muted-foreground">
                <tr>
                  <th className="py-3 px-3 w-10"></th>
                  <th className="py-3 px-3">Muscle Group Name</th>
                  <th className="py-3 px-3">Time</th>
                  <th className="py-3 px-3">Reps</th>
                  <th className="py-3 px-3">Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {muscleGroupSummaries.map((mgSummary) => {
                  const isExpanded = expandedMuscles[mgSummary.muscleName];
                  return (
                    <React.Fragment key={mgSummary.muscleName}>
                      <tr
                        className="hover:bg-muted/40 cursor-pointer font-medium transition-colors"
                        onClick={() => toggleMuscleExpand(mgSummary.muscleName)}
                      >
                        <td className="py-3 px-3 text-center">
                          {isExpanded ? (
                            <FaChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                          ) : (
                            <FaChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                          )}
                        </td>
                        <td className="py-3 px-3 font-bold text-foreground capitalize">
                          {mgSummary.muscleName}
                        </td>
                        <td className="py-3 px-3 font-bold">
                          {formatSeconds(mgSummary.totalTimeSeconds)}
                        </td>
                        <td className="py-3 px-3 font-bold">
                          {mgSummary.totalReps > 0 ? mgSummary.totalReps : '0'}
                        </td>
                        <td className="py-3 px-3 font-bold">
                          {mgSummary.totalVolumeKg > 0
                            ? formatWeightValue(mgSummary.totalVolumeKg)
                            : '--'}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={5} className="bg-muted/20 p-4">
                            <table className="w-full text-xs text-left border rounded bg-background">
                              <thead className="bg-muted/50 border-b">
                                <tr>
                                  <th className="py-2 px-3">Exercise Name</th>
                                  <th className="py-2 px-3">Set</th>
                                  <th className="py-2 px-3">Time</th>
                                  <th className="py-2 px-3">Reps</th>
                                  <th className="py-2 px-3">Volume</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {mgSummary.sets.map((s, idx) => (
                                  <tr
                                    key={`${s.exerciseName}-${s.setNumber}-${idx}`}
                                    className="hover:bg-muted/30"
                                  >
                                    <td className="py-2 px-3 font-medium text-foreground">
                                      {formatExerciseName(s.exerciseName)}
                                    </td>
                                    <td className="py-2 px-3">{s.setNumber}</td>
                                    <td className="py-2 px-3">
                                      {formatSeconds(s.durationSeconds)}
                                    </td>
                                    <td className="py-2 px-3">{s.reps}</td>
                                    <td className="py-2 px-3 font-semibold">
                                      {s.volumeKg > 0
                                        ? formatWeightValue(s.volumeKg)
                                        : '--'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const WorkoutSessionBodyMap: React.FC<{
  primaryMuscles: string[];
  secondaryMuscles: string[];
}> = ({ primaryMuscles, secondaryMuscles }) => {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const { data: svgContent } = useBodyMapSvgQuery();

  useEffect(() => {
    if (!svgContent || !svgContainerRef.current) return;
    const container = svgContainerRef.current;
    container.innerHTML = svgContent;

    const svgElement = container.querySelector('svg');
    if (!svgElement) return;

    svgElement.setAttribute('width', '100%');
    svgElement.style.maxWidth = '380px';
    svgElement.style.height = 'auto';

    const paths = svgElement.querySelectorAll('path[class]');

    paths.forEach((path) => {
      const svgClassName = path.getAttribute('class') || '';
      const muscleName = (
        svgClassToSchemaName[svgClassName] || svgClassName
      ).toLowerCase();

      const isPrimary = primaryMuscles.includes(muscleName);
      const isSecondary = secondaryMuscles.includes(muscleName);

      path.classList.remove('active-primary', 'active-secondary', 'inactive');
      if (isPrimary) {
        path.classList.add('active-primary');
      } else if (isSecondary) {
        path.classList.add('active-secondary');
      } else {
        path.classList.add('inactive');
      }
    });
  }, [svgContent, primaryMuscles, secondaryMuscles]);

  return (
    <div className="w-full flex flex-col items-center justify-center p-4 bg-muted/20 rounded-xl border border-border overflow-hidden">
      <div
        ref={svgContainerRef}
        className="workout-session-body-map w-full flex justify-center overflow-hidden max-w-[380px]"
      />
      <div className="flex items-center gap-6 mt-4 text-xs font-semibold">
        <span className="flex items-center gap-1.5 text-red-500">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />{' '}
          Primary Muscles
        </span>
        <span className="flex items-center gap-1.5 text-amber-500">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />{' '}
          Secondary Muscles
        </span>
        <span className="flex items-center gap-1.5 text-gray-400">
          <span className="w-2.5 h-2.5 rounded-full bg-gray-400 inline-block" />{' '}
          Untargeted Muscles
        </span>
      </div>
    </div>
  );
};

export default WorkoutSessionBreakdown;

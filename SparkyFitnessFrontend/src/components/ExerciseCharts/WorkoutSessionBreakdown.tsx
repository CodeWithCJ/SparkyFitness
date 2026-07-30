import type React from 'react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { usePreferences, type WeightUnit } from '@/contexts/PreferencesContext';
import { formatWeight } from '@/utils/numberFormatting';
import { FaChevronDown, FaChevronUp, FaDumbbell } from 'react-icons/fa';
import { useBodyMapSvgQuery } from '@/hooks/Exercises/useExercises';

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

interface RawExerciseItem {
  name?: string;
  category?: string;
}

interface RawWorkoutSet {
  setType?: string;
  repetitionCount?: number;
  weight?: number;
  duration?: number;
  exercises?: RawExerciseItem[];
  category?: string;
}

interface RawSetItem {
  set_number?: number;
  reps?: number;
  weight?: number;
  duration?: number;
  rest_time?: number;
  set_type?: string;
}

interface WorkoutSessionBreakdownProps {
  activityData?: Record<string, unknown>;
  exerciseEntry?: Record<string, unknown>;
}

export const WorkoutSessionBreakdown = ({
  activityData,
  exerciseEntry,
}: WorkoutSessionBreakdownProps) => {
  const { t } = useTranslation();
  const { weightUnit, convertWeight } = usePreferences();
  const [activeTab, setActiveTab] = useState<'sets' | 'exercises' | 'muscles'>(
    'muscles'
  );
  const [expandedExercises, setExpandedExercises] = useState<
    Record<string, boolean>
  >({});

  const toggleExerciseExpand = (name: string) => {
    setExpandedExercises((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const [expandedMuscles, setExpandedMuscles] = useState<
    Record<string, boolean>
  >({ Biceps: true });

  const toggleMuscleExpand = (name: string) => {
    setExpandedMuscles((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const setList = useMemo<ExerciseSetItem[]>(() => {
    const activityObj = activityData?.['activity'] as
      | Record<string, unknown>
      | undefined;
    const exerciseSetsObj = activityObj?.['exercise_sets'] as
      | Record<string, unknown>
      | undefined;
    const rawSets = exerciseSetsObj?.['exerciseSets'] as
      | RawWorkoutSet[]
      | undefined;

    if (Array.isArray(rawSets) && rawSets.length > 0) {
      let setCounter = 1;
      const items: ExerciseSetItem[] = [];

      for (let i = 0; i < rawSets.length; i++) {
        const set = rawSets[i];
        if (!set || set.setType === 'REST') continue;

        let name = 'Exercise';
        if (set.exercises && set.exercises.length > 0 && set.exercises[0]) {
          name = formatExerciseName(
            set.exercises[0].name || set.exercises[0].category || name
          );
        } else if (set.category) {
          name = formatExerciseName(set.category);
        }

        const duration = set.duration ? Number(set.duration) : 0;
        const reps = set.repetitionCount ? Math.round(set.repetitionCount) : 0;
        const weightRaw = set.weight || 0;
        // Divide by 2.204622 to undo double conversion in Garmin FIT set telemetry
        const weightKg = weightRaw > 0 ? (weightRaw * 0.001) / 2.204622 : 0;
        const volumeKg = reps * weightKg;

        let restSecs = 0;
        const nextSet = rawSets[i + 1];
        if (nextSet && nextSet.setType === 'REST') {
          const nextSetDuration = nextSet.duration;
          restSecs = nextSetDuration ? Number(nextSetDuration) : 0;
        }

        items.push({
          setNumber: setCounter++,
          exerciseName: name,
          durationSeconds: duration,
          restSeconds: restSecs,
          reps,
          weightKg,
          volumeKg,
          setType: set.setType || 'ACTIVE',
        });
      }
      return items;
    }

    const entrySets = exerciseEntry?.['sets'] as RawSetItem[] | undefined;
    if (Array.isArray(entrySets) && entrySets.length > 0) {
      const exerciseSnapshot = exerciseEntry?.['exercise_snapshot'] as
        | Record<string, unknown>
        | undefined;
      const fallbackName = formatExerciseName(
        (exerciseEntry?.['exercise_name'] as string) ||
          (exerciseSnapshot?.['name'] as string) ||
          'Exercise'
      );

      return entrySets.map((set, index) => {
        const reps = set?.reps || 0;
        const weightKg = set?.weight || 0;
        return {
          setNumber: set?.set_number || index + 1,
          exerciseName: fallbackName,
          durationSeconds: set?.duration || 0,
          restSeconds: set?.rest_time || 0,
          reps,
          weightKg,
          volumeKg: reps * weightKg,
          setType: set?.set_type || 'Working Set',
        };
      });
    }

    return [];
  }, [activityData, exerciseEntry]);

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

  const muscleGroupSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        muscleName: string;
        totalTimeSeconds: number;
        totalReps: number;
        totalVolumeKg: number;
        sets: ExerciseSetItem[];
      }
    >();

    const getPrimaryMuscle = (exName: string) => {
      const lower = exName.toLowerCase();
      if (lower.includes('biceps') || lower.includes('curl')) return 'Biceps';
      if (lower.includes('chest') || lower.includes('bench press'))
        return 'Chest';
      if (lower.includes('shoulder') || lower.includes('overhead'))
        return 'Shoulders';
      if (lower.includes('triceps') || lower.includes('extension'))
        return 'Triceps';
      if (
        lower.includes('row') ||
        lower.includes('pull') ||
        lower.includes('lat')
      )
        return 'Back / Lats';
      if (lower.includes('squat') || lower.includes('leg')) return 'Quadriceps';
      if (lower.includes('calf') || lower.includes('calves')) return 'Calves';
      return 'Full Body';
    };

    setList.forEach((item) => {
      const muscle = getPrimaryMuscle(item.exerciseName);
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

    return Array.from(map.values()).sort((a, b) =>
      a.muscleName.localeCompare(b.muscleName)
    );
  }, [setList]);

  const primaryMusclesTargeted = useMemo(() => {
    const set = new Set<string>();
    groupedExercises.forEach((g) => {
      const lower = g.exerciseName.toLowerCase();
      if (lower.includes('chest') || lower.includes('bench press'))
        set.add('chest');
      if (
        lower.includes('row') ||
        lower.includes('pull') ||
        lower.includes('lat')
      ) {
        set.add('lats');
        set.add('trapezius');
        set.add('upperback');
      }
    });
    return Array.from(set);
  }, [groupedExercises]);

  const secondaryMusclesTargeted = useMemo(() => {
    const set = new Set<string>();
    groupedExercises.forEach((g) => {
      const lower = g.exerciseName.toLowerCase();
      if (
        lower.includes('biceps') ||
        lower.includes('curl') ||
        lower.includes('row')
      )
        set.add('biceps');
      if (
        lower.includes('triceps') ||
        lower.includes('extension') ||
        lower.includes('press')
      )
        set.add('triceps');
      if (
        lower.includes('shoulder') ||
        lower.includes('press') ||
        lower.includes('deltoid')
      )
        set.add('shoulders');
    });
    return Array.from(set);
  }, [groupedExercises]);

  if (setList.length === 0) return null;

  const formatSeconds = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = (totalSecs % 60).toFixed(1);
    return `${mins}:${Number(secs) < 10 ? '0' : ''}${secs}`;
  };

  const formatWeightValue = (kg: number) => {
    if (kg <= 0) return '--';
    const converted = convertWeight(kg, 'kg', weightUnit as WeightUnit);
    return `${formatWeight(converted, weightUnit as WeightUnit)}`;
  };

  return (
    <div className="workout-session-breakdown border rounded-xl p-4 sm:p-6 bg-card text-card-foreground shadow-sm mb-8 space-y-6">
      <div className="flex border-b border-border space-x-2 sm:space-x-4">
        <button
          className={`pb-3 px-4 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'sets'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('sets')}
        >
          {t('workoutReport.sets', 'Sets')} ({setList.length})
        </button>
        <button
          className={`pb-3 px-4 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'exercises'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('exercises')}
        >
          {t('workoutReport.exercises', 'Exercises')} ({groupedExercises.length}
          )
        </button>
        <button
          className={`pb-3 px-4 text-sm font-semibold transition-colors border-b-2 ${
            activeTab === 'muscles'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
          onClick={() => setActiveTab('muscles')}
        >
          {t('workoutReport.primaryMuscles', 'Primary Muscles')}
        </button>
      </div>

      {activeTab === 'sets' && (
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
              {setList.map((setItem) => (
                <tr
                  key={setItem.setNumber}
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

      {activeTab === 'exercises' && (
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
                    <div key={group.exerciseName} className="contents">
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
                                {group.sets.map((s) => (
                                  <tr key={s.setNumber}>
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
                    </div>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'muscles' && (
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
                    <div key={mgSummary.muscleName} className="contents">
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
                        <td className="py-3 px-3 font-bold text-foreground">
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
                                  <th className="py-2 px-3">Time</th>
                                  <th className="py-2 px-3">Reps</th>
                                  <th className="py-2 px-3">Volume</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {mgSummary.sets.map((s, idx) => (
                                  <tr key={idx}>
                                    <td className="py-2 px-3 font-semibold">
                                      {formatExerciseName(s.exerciseName)}
                                    </td>
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
                    </div>
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
      const cls = (path.getAttribute('class') || '').toLowerCase();

      const isPrimary = primaryMuscles.some((m) =>
        cls.includes(m.toLowerCase())
      );
      const isSecondary = secondaryMuscles.some((m) =>
        cls.includes(m.toLowerCase())
      );

      if (isPrimary) {
        (path as HTMLElement).style.fill = '#e11d48';
        (path as HTMLElement).style.opacity = '1';
      } else if (isSecondary) {
        (path as HTMLElement).style.fill = '#eab308';
        (path as HTMLElement).style.opacity = '1';
      } else {
        (path as HTMLElement).style.fill = '#f3f4f6';
        (path as HTMLElement).style.stroke = '#d1d5db';
        (path as HTMLElement).style.strokeWidth = '0.5';
        (path as HTMLElement).style.opacity = '1';
      }
    });
  }, [svgContent, primaryMuscles, secondaryMuscles]);

  return (
    <div className="w-full flex flex-col items-center justify-center p-4 bg-muted/20 rounded-xl border border-border overflow-hidden">
      <div
        ref={svgContainerRef}
        className="w-full flex justify-center overflow-hidden max-w-[380px]"
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

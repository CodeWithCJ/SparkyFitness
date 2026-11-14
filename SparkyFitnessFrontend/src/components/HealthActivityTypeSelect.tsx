import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronsUpDown } from 'lucide-react';
import {
  COMMON_HEALTH_ACTIVITY_TYPES,
  guessHealthActivityType,
  HEALTH_ACTIVITY_TYPES,
  type HealthActivityType,
  type HealthActivityTypeInput,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { AUTOMATIC_HEALTH_ACTIVITY_TYPE } from '@/utils/healthActivityType';

/** English fallbacks for `healthActivityTypes.<key>`; a new shared key without one fails to compile. */
const DEFAULT_LABELS: Record<HealthActivityType, string> = {
  american_football: 'American Football',
  archery: 'Archery',
  australian_football: 'Australian Football',
  badminton: 'Badminton',
  baseball: 'Baseball',
  basketball: 'Basketball',
  bowling: 'Bowling',
  boxing: 'Boxing',
  climbing: 'Climbing',
  cricket: 'Cricket',
  cross_training: 'Cross Training',
  curling: 'Curling',
  cycling: 'Cycling',
  cycling_indoor: 'Indoor Cycling',
  elliptical: 'Elliptical',
  equestrian_sports: 'Equestrian Sports',
  fencing: 'Fencing',
  fishing: 'Fishing',
  functional_strength_training: 'Functional Strength Training',
  golf: 'Golf',
  gymnastics: 'Gymnastics',
  handball: 'Handball',
  hiking: 'Hiking',
  ice_hockey: 'Ice Hockey',
  roller_hockey: 'Roller Hockey',
  hunting: 'Hunting',
  lacrosse: 'Lacrosse',
  martial_arts: 'Martial Arts',
  mind_and_body: 'Mind and Body',
  breathing: 'Breathing',
  paddle_sports: 'Paddle Sports',
  play: 'Play',
  preparation_and_recovery: 'Preparation and Recovery',
  racquetball: 'Racquetball',
  rowing: 'Rowing',
  rowing_machine: 'Rowing Machine',
  rugby: 'Rugby',
  running: 'Running',
  running_treadmill: 'Treadmill Running',
  sailing: 'Sailing',
  skating: 'Skating',
  ice_skating: 'Ice Skating',
  snowshoeing: 'Snowshoeing',
  soccer: 'Soccer',
  softball: 'Softball',
  squash: 'Squash',
  stair_climbing_machine: 'Stair Climbing Machine',
  surfing: 'Surfing',
  swimming_pool: 'Pool Swimming',
  swimming_open_water: 'Open Water Swimming',
  table_tennis: 'Table Tennis',
  tennis: 'Tennis',
  track_and_field: 'Track and Field',
  strength_training: 'Strength Training',
  weightlifting: 'Weightlifting',
  volleyball: 'Volleyball',
  walking: 'Walking',
  walking_treadmill: 'Indoor Walking',
  water_fitness: 'Water Fitness',
  water_polo: 'Water Polo',
  water_sports: 'Water Sports',
  wrestling: 'Wrestling',
  yoga: 'Yoga',
  barre: 'Barre',
  core_training: 'Core Training',
  calisthenics: 'Calisthenics',
  cross_country_skiing: 'Cross Country Skiing',
  downhill_skiing: 'Downhill Skiing',
  stretching: 'Stretching',
  hiit: 'High Intensity Interval Training',
  jump_rope: 'Jump Rope',
  kickboxing: 'Kickboxing',
  pilates: 'Pilates',
  snowboarding: 'Snowboarding',
  stairs: 'Stairs',
  step_training: 'Step Training',
  wheelchair_walk_pace: 'Wheelchair (Walk Pace)',
  wheelchair_run_pace: 'Wheelchair (Run Pace)',
  tai_chi: 'Tai Chi',
  mixed_cardio: 'Mixed Cardio',
  exercise_class: 'Exercise Class',
  boot_camp: 'Boot Camp',
  hand_cycling: 'Hand Cycling',
  disc_sports: 'Disc Sports',
  fitness_gaming: 'Fitness Gaming',
  cardio_dance: 'Cardio Dance',
  social_dance: 'Dance',
  pickleball: 'Pickleball',
  cooldown: 'Cooldown',
  underwater_diving: 'Underwater Diving',
  paragliding: 'Paragliding',
  other: 'Other',
};

/** Case- and accent-insensitive form of a label, for search. */
const searchForm = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

interface Option {
  value: string;
  label: string;
}

interface HealthActivityTypeSelectProps {
  id: string;
  /** A key, or `AUTOMATIC_HEALTH_ACTIVITY_TYPE`. */
  value: string;
  onChange: (value: string) => void;
  /** The exercise as currently edited, for the Automatic label. */
  exercise: HealthActivityTypeInput;
  className?: string;
}

/**
 * Which Apple Health / Health Connect activity type workouts with this
 * exercise are written as (#1750). Automatic shows the guessed type; the list
 * opens on the common types, then every type, and filters as you type.
 */
export function HealthActivityTypeSelect({
  id,
  value,
  onChange,
  exercise,
  className,
}: HealthActivityTypeSelectProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const guessed = guessHealthActivityType(exercise);
  const { automatic, common, all } = useMemo(() => {
    const option = (key: HealthActivityType): Option => ({
      value: key,
      label: t(`healthActivityTypes.${key}`, DEFAULT_LABELS[key]),
    });
    return {
      automatic: {
        value: AUTOMATIC_HEALTH_ACTIVITY_TYPE,
        label: t(
          'exercise.addExerciseDialog.healthActivityTypeAutomatic',
          'Automatic ({{type}})',
          { type: t(`healthActivityTypes.${guessed}`, DEFAULT_LABELS[guessed]) }
        ),
      },
      common: COMMON_HEALTH_ACTIVITY_TYPES.map(option),
      all: HEALTH_ACTIVITY_TYPES.map(option).sort((a, b) =>
        a.label.localeCompare(b.label)
      ),
    };
  }, [t, guessed]);

  const needle = searchForm(query.trim());
  const groups: { heading?: string; options: Option[] }[] = needle
    ? [
        {
          options: [automatic, ...all].filter((o) =>
            searchForm(o.label).includes(needle)
          ),
        },
      ]
    : [
        {
          heading: t(
            'exercise.addExerciseDialog.healthActivityTypeCommon',
            'Common'
          ),
          options: [automatic, ...common],
        },
        {
          heading: t(
            'exercise.addExerciseDialog.healthActivityTypeAll',
            'All activities'
          ),
          options: all,
        },
      ];
  const selectedLabel =
    [automatic, ...all].find((o) => o.value === value)?.label ??
    automatic.label;
  const nothingFound = groups.every((g) => g.options.length === 0);

  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className="truncate">{selectedLabel}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0">
        <div className="border-b p-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(
              'exercise.addExerciseDialog.healthActivityTypeSearch',
              'Search activities'
            )}
            aria-label={t(
              'exercise.addExerciseDialog.healthActivityTypeSearch',
              'Search activities'
            )}
            onKeyDown={(e) => {
              const first = groups.find((g) => g.options.length > 0)
                ?.options[0];
              if (e.key === 'Enter' && first) {
                e.preventDefault();
                choose(first.value);
              }
            }}
          />
        </div>
        <div
          role="listbox"
          aria-label={t(
            'exercise.addExerciseDialog.healthActivityTypeLabel',
            'Health activity type'
          )}
          className="max-h-72 overflow-y-auto py-1"
        >
          {nothingFound ? (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              {t(
                'exercise.addExerciseDialog.healthActivityTypeNoMatches',
                'No matches'
              )}
            </p>
          ) : (
            groups.map((group, index) => (
              <div key={group.heading ?? index}>
                {group.heading && (
                  <div className="px-3 pb-1 pt-2 text-xs font-semibold uppercase text-muted-foreground">
                    {group.heading}
                  </div>
                )}
                {group.options.map((option) => (
                  <button
                    key={`${group.heading ?? 'match'}-${option.value}`}
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    onClick={() => choose(option.value)}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent focus:bg-accent focus:outline-none"
                  >
                    <Check
                      className={cn(
                        'h-4 w-4 shrink-0',
                        option.value === value ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {option.label}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

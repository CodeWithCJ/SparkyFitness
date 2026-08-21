import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Trophy,
  Zap,
  Calendar,
  Footprints,
  Bike,
  PersonStanding,
  Waves,
  Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { formatWeight } from '@/utils/unitConversions';
import { PR_SPORT_GROUPS, prSportGroupLabel } from '@workspace/shared';
import type {
  ExercisePRMatrixResponse,
  ExercisePersonalRecordItem,
  PrSportGroup,
} from '@workspace/shared';

interface CardioPRBadgesWidgetProps {
  prData?: ExercisePRMatrixResponse;
  viewMode?: 'all' | 'strength' | 'cardio';
}

const SPORT_GROUP_ICONS: Record<PrSportGroup, LucideIcon> = {
  run: Footprints,
  ride: Bike,
  walk: PersonStanding,
  swim: Waves,
  other: Activity,
};

interface PrSection {
  key: string;
  heading: string;
  Icon: LucideIcon;
  items: ExercisePersonalRecordItem[];
}

export const CardioPRBadgesWidget = ({
  prData,
  viewMode = 'all',
}: CardioPRBadgesWidgetProps) => {
  const { weightUnit } = usePreferences();
  const strength1RMs = prData?.strength1RMs || [];

  const showCardio = viewMode === 'all' || viewMode === 'cardio';
  const showStrength = viewMode === 'all' || viewMode === 'strength';

  // Records are only comparable within a sport — a 1 km walk is slower than a
  // 1 mile run — so each sport gets its own section.
  const prSections = useMemo<PrSection[]>(() => {
    const prs = prData?.cardioPRs || [];
    // A backend older than the per-sport change sends no sportGroup. Fall back
    // to the single legacy section rather than dumping everything into "Other".
    if (prs.some((pr) => !pr.sportGroup)) {
      return [
        {
          key: 'legacy',
          heading: 'Cardio Milestone PRs',
          Icon: Activity,
          items: prs,
        },
      ];
    }
    return PR_SPORT_GROUPS.map((group) => ({
      key: group,
      heading: `${prSportGroupLabel(group)} PRs`,
      Icon: SPORT_GROUP_ICONS[group],
      items: prs.filter((pr) => pr.sportGroup === group),
    })).filter((section) => section.items.length > 0);
  }, [prData?.cardioPRs]);

  return (
    <Card className="shadow-sm border">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            Personal Records & Best Efforts Matrix
          </span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          All-time best times for standard distances and estimated 1-Rep Maxes.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Cardio Distance PR Badges */}
        {showCardio &&
          (prSections.length > 0 ? (
            prSections.map((section) => (
              <div key={section.key}>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                  <section.Icon className="w-3.5 h-3.5" />
                  {section.heading}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {section.items.map((pr: ExercisePersonalRecordItem) => (
                    <div
                      key={pr.id}
                      className="p-3 rounded-lg border bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border-amber-500/30 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                          {pr.label}
                        </span>
                        <Trophy className="w-4 h-4 text-amber-500" />
                      </div>
                      <div className="my-2">
                        <div className="text-xl font-extrabold text-foreground">
                          {pr.formattedTime}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <Zap className="w-3 h-3 text-blue-500" />
                          Pace: {pr.formattedPace}
                        </div>
                      </div>
                      <div className="text-[10px] text-muted-foreground flex items-center justify-between pt-1 border-t border-amber-500/20">
                        <span
                          className="truncate max-w-[120px]"
                          title={
                            pr.sportConfidence === 'inferred'
                              ? `${pr.activityName} — sport inferred from the activity name`
                              : pr.activityName
                          }
                        >
                          {pr.activityName}
                          {pr.sportConfidence === 'inferred' && ' *'}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Calendar className="w-2.5 h-2.5" />
                          {pr.achievedAt}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Cardio Milestone PRs
              </h4>
              <div className="text-xs text-muted-foreground p-4 text-center border rounded-lg bg-muted/20">
                No cardio distance PRs recorded yet. Log or sync GPS activities
                (5k, 10k, Half Marathon).
              </div>
            </div>
          ))}

        {/* Strength 1RM PRs */}
        {showStrength && strength1RMs.length > 0 && (
          <div className="pt-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Top Strength 1-Rep Maxes
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {strength1RMs.slice(0, 4).map((st) => (
                <div
                  key={st.exerciseName}
                  className="p-3 rounded-lg border bg-muted/30 flex flex-col justify-between"
                >
                  <div className="text-xs font-medium truncate">
                    {st.exerciseName}
                  </div>
                  <div className="my-1">
                    <span className="text-lg font-bold text-blue-600">
                      {formatWeight(st.estimatedOneRMKg, weightUnit)}
                    </span>
                    <span className="text-[10px] text-muted-foreground block">
                      Best set: {formatWeight(st.weightKg, weightUnit)} ×{' '}
                      {st.reps} reps
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {st.achievedAt}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

import { useTranslation } from 'react-i18next';
import { OctagonAlert, Search, type LucideIcon } from 'lucide-react';
import {
  NUTRI_SCORE_GRADE_COLORS,
  NUTRI_SCORE_GRADES,
  type FoodHealthScore,
  type FrontOfPackWarning,
  type FrontOfPackWarningRegion,
  type NutriScoreResult,
} from '@workspace/shared';
import { Badge } from '@/components/ui/badge';
import { usePreferences } from '@/contexts/PreferencesContext';
import { cn } from '@/lib/utils';

const WARNING_LABELS: Record<FrontOfPackWarning, string> = {
  calories: 'High in calories',
  sugars: 'High in sugars',
  added_sugars: 'High in added sugar',
  saturated_fat: 'High in saturated fat',
  trans_fat: 'High in trans fat',
  sodium: 'High in sodium',
};

// Brazil's seal is a magnifying glass; Chile and Mexico use black octagons.
const REGION_ICONS: Record<FrontOfPackWarningRegion, LucideIcon> = {
  brazil: Search,
  chile: OctagonAlert,
  mexico: OctagonAlert,
};

const NutriScoreBadge = ({ nutriScore }: { nutriScore: NutriScoreResult }) => {
  const { t } = useTranslation();
  const grade = nutriScore.grade.toUpperCase();
  const label =
    nutriScore.source === 'provider'
      ? t('foods.healthScore.nutriScoreProvider', {
          grade,
          defaultValue: `Nutri-Score ${grade} (from Open Food Facts)`,
        })
      : t('foods.healthScore.nutriScoreComputed', {
          grade,
          defaultValue: `Nutri-Score ${grade} (calculated from nutrients)`,
        });

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-testid="nutri-score-badge"
      className="inline-flex h-5 items-center overflow-hidden rounded-full border border-border bg-muted text-[10px] font-black leading-none"
    >
      {NUTRI_SCORE_GRADES.map((letter) => {
        const active = letter === nutriScore.grade;
        return (
          <span
            key={letter}
            aria-hidden="true"
            className={cn(
              'flex h-full items-center justify-center uppercase',
              active ? 'w-5 text-white' : 'w-3 text-muted-foreground/60'
            )}
            style={
              active
                ? { backgroundColor: NUTRI_SCORE_GRADE_COLORS[letter] }
                : {}
            }
          >
            {letter}
          </span>
        );
      })}
    </span>
  );
};

interface FoodHealthBadgesProps {
  healthScore?: FoodHealthScore | null;
  className?: string;
}

/**
 * Nutri-Score plus the "high in" warnings of the region the user picked in
 * Settings. Renders nothing when there is neither a grade nor a warning.
 */
const FoodHealthBadges = ({
  healthScore,
  className,
}: FoodHealthBadgesProps) => {
  const { t } = useTranslation();
  const { frontOfPackRegion } = usePreferences();
  if (!healthScore) return null;

  const warnings =
    frontOfPackRegion === 'none' ? [] : healthScore.warnings[frontOfPackRegion];
  if (!healthScore.nutri_score && warnings.length === 0) return null;
  const WarningIcon =
    frontOfPackRegion === 'none' ? null : REGION_ICONS[frontOfPackRegion];

  return (
    <div className={cn('flex flex-wrap items-center gap-1', className)}>
      {healthScore.nutri_score && (
        <NutriScoreBadge nutriScore={healthScore.nutri_score} />
      )}
      {warnings.map((warning) => (
        <Badge
          key={warning}
          data-testid="front-of-pack-warning"
          className="h-5 gap-1 border-transparent bg-neutral-900 px-1.5 text-[10px] font-bold uppercase text-white hover:bg-neutral-900 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-100"
        >
          {WarningIcon && (
            <WarningIcon className="h-3 w-3" aria-hidden="true" />
          )}
          {t(`foods.healthScore.warnings.${warning}`, WARNING_LABELS[warning])}
        </Badge>
      ))}
    </div>
  );
};

export default FoodHealthBadges;

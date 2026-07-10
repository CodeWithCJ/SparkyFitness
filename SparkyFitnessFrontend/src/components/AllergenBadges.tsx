import { Badge } from '@/components/ui/badge';
import { useAllergenPreferences } from '@/hooks/useAllergenPreferences';
import { useTranslation } from 'react-i18next';
import { getLocalizedAllergenLabel } from '@/utils/allergenLocalization';

interface AllergenBadgesProps {
  allergens?: string[] | null;
  traces?: string[] | null;
}

/**
 * Shows allergen/trace warning badges for a food item, but only for allergens
 * the user has configured in their allergen preferences. If the user has set no
 * preferences nothing is rendered, so the UI stays clean for everyone who doesn't
 * track allergens.
 */
const AllergenBadges = ({ allergens, traces }: AllergenBadgesProps) => {
  const { t } = useTranslation();
  const { data: preferences } = useAllergenPreferences();
  const userAllergens =
    preferences?.map((p) => p.allergen_name.toLowerCase()) ?? [];

  if (userAllergens.length === 0) return null;
  if (!allergens?.length && !traces?.length) return null;

  const matchingAllergens = (allergens ?? []).filter((a) =>
    userAllergens.includes(a.toLowerCase())
  );
  const matchingTraces = (traces ?? []).filter((t) =>
    userAllergens.includes(t.toLowerCase())
  );

  if (matchingAllergens.length === 0 && matchingTraces.length === 0)
    return null;

  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {matchingAllergens.map((a) => (
        <Badge key={`allergen-${a}`} variant="destructive" className="text-xs">
          ⚠ {getLocalizedAllergenLabel(a, t)}
        </Badge>
      ))}
      {matchingTraces.map((trace) => (
        <Badge
          key={`trace-${trace}`}
          className="border-orange-300 bg-orange-100 text-xs text-orange-800 dark:bg-orange-900 dark:text-orange-200"
        >
          {t('foodResultCard.traceAllergen', {
            allergen: getLocalizedAllergenLabel(trace, t),
            defaultValue: 'Trace: {{allergen}}',
          })}
        </Badge>
      ))}
    </div>
  );
};

export default AllergenBadges;

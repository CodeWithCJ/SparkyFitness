import { Badge } from '@/components/ui/badge';
import { useAllergenPreferences } from '@/hooks/useAllergenPreferences';

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
    <div className="flex flex-wrap gap-1 mt-1">
      {matchingAllergens.map((a) => (
        <Badge
          key={`allergen-${a}`}
          variant="destructive"
          className="text-xs capitalize"
        >
          ⚠ {a}
        </Badge>
      ))}
      {matchingTraces.map((t) => (
        <Badge
          key={`trace-${t}`}
          className="text-xs capitalize bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-orange-300"
        >
          trace: {t}
        </Badge>
      ))}
    </div>
  );
};

export default AllergenBadges;

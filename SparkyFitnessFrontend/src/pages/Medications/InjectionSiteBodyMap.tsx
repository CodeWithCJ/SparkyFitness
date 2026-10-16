import { useTranslation } from 'react-i18next';
import {
  INJECTION_SITES,
  INJECTION_BODY_MAP_VIEWBOX,
  INJECTION_BODY_SILHOUETTE_PATH,
  INJECTION_SITE_ZONES,
  type InjectionSite,
} from '@workspace/shared';

/**
 * Clickable front-view injection-site body map. Reuses the "clickable region + state colour"
 * technique of the exercise body map (`pages/Exercises/BodyMapFilter.tsx`) but as a self-contained,
 * typed inline SVG so the zones line up exactly with `INJECTION_SITES` (stomach quadrants, arms,
 * thighs, hips) — the muscle SVG has no such zones.
 *
 * State colours match the rest of the coach: suggested = green, resting/lipo = amber,
 * selected = blue, otherwise muted.
 */
interface InjectionSiteBodyMapProps {
  /** Sites to render (defaults to all built-ins minus `unknown`); pass the user's active set to filter. */
  sites?: InjectionSite[];
  selectedSiteId: string | null;
  suggestedSiteId?: string | null;
  restingSiteIds?: string[];
  onSelect: (siteId: string) => void;
}

function zoneFill(
  state: 'selected' | 'suggested' | 'resting' | 'default'
): string {
  switch (state) {
    case 'selected':
      return '#3b82f6'; // blue
    case 'suggested':
      return '#22c55e'; // green
    case 'resting':
      return '#f59e0b'; // amber
    default:
      return 'currentColor';
  }
}

export default function InjectionSiteBodyMap({
  sites = INJECTION_SITES.filter((s) => s.id !== 'unknown'),
  selectedSiteId,
  suggestedSiteId,
  restingSiteIds = [],
  onSelect,
}: InjectionSiteBodyMapProps) {
  const { t } = useTranslation();
  const resting = new Set(restingSiteIds);
  const drawable = sites.filter((s) => INJECTION_SITE_ZONES[s.id]);

  return (
    <svg
      viewBox={INJECTION_BODY_MAP_VIEWBOX}
      className="mx-auto h-auto w-full max-w-[280px] text-muted-foreground/25"
      role="group"
      aria-label={t('medications.bodymap.label', 'Injection site body map')}
    >
      {/* Silhouette (non-interactive) */}
      <path
        d={INJECTION_BODY_SILHOUETTE_PATH}
        fill="currentColor"
        stroke="none"
      />

      {/* Clickable zones */}
      {drawable.map((s) => {
        const z = INJECTION_SITE_ZONES[s.id]!;
        const state =
          selectedSiteId === s.id
            ? 'selected'
            : suggestedSiteId === s.id
              ? 'suggested'
              : resting.has(s.id)
                ? 'resting'
                : 'default';
        const transform = z.rotate
          ? `rotate(${z.rotate}, ${z.x + z.w / 2}, ${z.y})`
          : undefined;
        return (
          <rect
            key={s.id}
            x={z.x}
            y={z.y}
            width={z.w}
            height={z.h}
            rx={5}
            transform={transform}
            fill={zoneFill(state)}
            fillOpacity={state === 'default' ? 0.5 : 0.85}
            stroke={state === 'default' ? 'currentColor' : zoneFill(state)}
            strokeOpacity={0.9}
            strokeWidth={state === 'selected' ? 2.5 : 1}
            className="cursor-pointer transition-[fill-opacity] hover:[fill-opacity:1] focus:outline-none focus-visible:[stroke-width:2.5]"
            role="button"
            tabIndex={0}
            onClick={() => onSelect(s.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(s.id);
              }
            }}
            aria-label={t('medications.sites.label.' + s.id, s.label)}
            aria-pressed={selectedSiteId === s.id}
          >
            <title>{t('medications.sites.label.' + s.id, s.label)}</title>
          </rect>
        );
      })}
    </svg>
  );
}

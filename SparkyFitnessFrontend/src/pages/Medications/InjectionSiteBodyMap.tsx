import { INJECTION_SITES, type InjectionSite } from '@workspace/shared';

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

// Schematic zone rectangles over a simple front-facing silhouette (viewBox 0 0 224 360).
const ZONE: Record<string, { x: number; y: number; w: number; h: number }> = {
  stomach_upper_left: { x: 74, y: 96, w: 24, h: 26 },
  stomach_upper_mid: { x: 100, y: 96, w: 24, h: 26 },
  stomach_upper_right: { x: 126, y: 96, w: 24, h: 26 },
  stomach_mid_left: { x: 74, y: 124, w: 24, h: 24 },
  stomach_mid_right: { x: 126, y: 124, w: 24, h: 24 },
  stomach_lower_left: { x: 74, y: 150, w: 24, h: 26 },
  stomach_lower_mid: { x: 100, y: 150, w: 24, h: 26 },
  stomach_lower_right: { x: 126, y: 150, w: 24, h: 26 },
  left_arm: { x: 44, y: 88, w: 20, h: 58 },
  right_arm: { x: 160, y: 88, w: 20, h: 58 },
  left_hip: { x: 74, y: 180, w: 24, h: 22 },
  right_hip: { x: 126, y: 180, w: 24, h: 22 },
  left_thigh: { x: 78, y: 208, w: 24, h: 72 },
  right_thigh: { x: 122, y: 208, w: 24, h: 72 },
};

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
  const resting = new Set(restingSiteIds);
  const drawable = sites.filter((s) => ZONE[s.id]);

  return (
    <svg
      viewBox="0 0 224 360"
      className="mx-auto h-auto w-full max-w-[260px] text-muted-foreground/25"
      role="group"
      aria-label="Injection site body map"
    >
      {/* Silhouette (non-interactive) */}
      <g fill="currentColor" stroke="none">
        <circle cx="112" cy="40" r="20" />
        <rect x="66" y="62" width="92" height="124" rx="16" />
        <rect x="44" y="84" width="20" height="64" rx="10" />
        <rect x="160" y="84" width="20" height="64" rx="10" />
        <rect x="74" y="186" width="32" height="160" rx="14" />
        <rect x="118" y="186" width="32" height="160" rx="14" />
      </g>

      {/* Clickable zones */}
      {drawable.map((s) => {
        const z = ZONE[s.id]!;
        const state =
          selectedSiteId === s.id
            ? 'selected'
            : suggestedSiteId === s.id
              ? 'suggested'
              : resting.has(s.id)
                ? 'resting'
                : 'default';
        return (
          <rect
            key={s.id}
            x={z.x}
            y={z.y}
            width={z.w}
            height={z.h}
            rx={5}
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
            aria-label={s.label}
            aria-pressed={selectedSiteId === s.id}
          >
            <title>{s.label}</title>
          </rect>
        );
      })}
    </svg>
  );
}

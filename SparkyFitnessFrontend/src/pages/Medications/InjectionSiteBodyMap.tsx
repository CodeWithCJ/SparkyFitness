import { useTranslation } from 'react-i18next';
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

/* eslint-disable max-len */
const BODY_SILHOUETTE_PATH =
  'M303.204 343.028c-0.883 10.41 6.183 65.516 9.829 87.121 1.736 10.236 6.497 26.913 4.784 35.769 -2.445 12.342 -3.153 28.313 -1.806 37.612 0.849 5.647 3.522 31.695 -0.303 41.222 -2.001 4.997 -5.667 30.599 -5.667 30.599 -9.553 24.119 -4.161 22.932 -4.161 22.932 2.958 3.628 8.024 0.285 8.024 0.285 3.859 2.46 6.531 -0.585 6.531 -0.585 3.312 2.742 7.175 -0.338 7.175 -0.338 4.161 2.16 8.021 -1.824 8.021 -1.824 2.391 1.205 2.974 -0.317 2.974 -0.317 7.171 -0.459 -4.002 -23.409 -4.002 -23.409 -2.676 -20.611 2.655 -32.084 2.655 -32.084 17.46 -51.777 18.346 -65.517 11.367 -85.03 -1.966 -5.633 -2.463 -7.863 -1.558 -10.309 2.091 -5.644 0.567 -28.347 3.117 -37.362 4.92 -17.386 9.774 -61.482 12.304 -82.056 3.399 -27.714 -12.042 -64.872 -12.042 -64.872 -3.382 -15.121 1.576 -68.999 1.576 -68.999 6.924 10.774 6.66 29.793 6.66 29.793 -1.099 19.946 16.113 50.431 16.113 50.431 8.271 12.597 11.403 24.549 11.403 25.437 0 3.628 -0.794 12.414 -0.794 12.414l0.317 7.652c0.143 1.948 1.239 8.656 1.062 11.899 -1.292 19.955 1.878 16.2 1.878 16.2 2.676 0 5.616 -16.058 5.616 -16.058 0 4.142 -1.013 16.538 1.221 21.215 2.673 5.577 4.638 -0.957 4.673 -2.268 0.706 -25.407 2.234 -18.752 2.234 -18.752 1.486 20.611 3.312 25.267 6.587 23.657 2.481 -1.183 0.213 -24.735 0.213 -24.735 4.248 13.991 7.47 16.218 7.47 16.218 7.011 4.923 2.676 -8.675 1.701 -11.367 -5.189 -14.307 -5.348 -19.266 -5.348 -19.266 6.481 12.857 11.367 12.38 11.367 12.38 6.322 -2.018 -5.524 -20.223 -12.466 -28.944 -3.542 -4.443 -8.111 -10.393 -9.437 -13.926 -2.16 -5.985 -3.792 -25.224 -3.792 -25.224 -0.654 -22.703 -6.267 -32.563 -6.267 -32.563 -9.597 -15.36 -11.403 -44.013 -11.403 -44.013l-0.424 -48.375c-3.364 -32.997 -27.678 -33.236 -27.678 -33.236 -24.576 -3.659 -27.996 -11.596 -27.996 -11.596 -5.205 -7.491 -2.231 -21.851 -2.231 -21.851 4.319 -3.513 5.985 -12.838 5.985 -12.838 7.171 -5.499 6.819 -13.545 3.507 -13.458 -2.658 0.071 -2.056 -2.131 -2.056 -2.131C334.62 1.85 302.463 0 302.463 0h-4.908s-32.172 1.85 -27.693 38.063c0 0 0.602 2.205 -2.079 2.131 -3.303 -0.087 -3.612 7.959 3.532 13.458 0 0 1.663 9.322 5.985 12.838 0 0 2.974 14.36 -2.231 21.851 0 0 -3.408 7.94 -27.996 11.596 0 0 -24.354 0.238 -27.668 33.236l-0.459 48.375s-1.772 28.653 -11.406 44.013c0 0 -5.586 9.864 -6.232 32.563 0 0 -1.636 19.239 -3.789 25.224 -1.311 3.516 -5.877 9.465 -9.449 13.926 -7.002 8.703 -18.771 26.87 -12.476 28.944 0 0 4.911 0.477 11.367 -12.38 0 0 -0.134 4.923 -5.313 19.266 -1.018 2.658 -5.348 16.255 1.667 11.367 0 0 3.249 -2.231 7.47 -16.218 0 0 -2.265 23.552 0.257 24.735 3.296 1.614 5.093 -3.045 6.577 -23.657 0 0 1.524 -6.657 2.231 18.752 0.035 1.311 1.958 7.846 4.641 2.268 2.265 -4.675 1.248 -17.052 1.248 -21.215 0 0 2.905 16.058 5.62 16.058 0 0 3.196 3.755 1.884 -16.2 -0.213 -3.26 0.93 -9.951 1.073 -11.899l0.309 -7.652s-0.796 -8.764 -0.796 -12.414c0 -0.904 3.135 -12.838 11.403 -25.437 0 0 17.194 -30.499 16.087 -50.431 0 0 -0.238 -19.018 6.685 -29.793 0 0 4.914 53.874 1.585 68.999 0 0 -15.468 37.158 -12.057 64.872 2.513 20.63 7.357 64.665 12.29 82.056 2.577 8.997 1.053 31.695 3.117 37.362 0.93 2.463 0.443 4.731 -1.558 10.309 -6.942 19.514 -6.057 33.257 11.403 85.03 0 0 5.375 11.472 2.658 32.084 0 0 -11.155 22.95 -4.01 23.409 0 0 0.558 1.521 2.974 0.317 0 0 3.859 3.984 8.029 1.824 0 0 3.863 3.083 7.163 0.338 0 0 2.646 3.045 6.505 0.585 0 0 5.066 3.417 8.076 -0.285 0 0 5.348 1.187 -4.173 -22.932 0 0 -3.647 -25.571 -5.656 -30.599 -3.833 -9.524 -1.125 -35.627 -0.309 -41.222 1.317 -9.353 0.61 -25.285 -1.797 -37.612 -1.763 -8.835 3.011 -25.515 4.771 -35.769 3.621 -21.587 10.716 -76.694 9.829 -87.121l2.931 1.029c2.1 0.006 3.426 -1.02 3.426 -1.02';
/* eslint-enable max-len */

// Schematic zone rectangles over a simple front-facing silhouette (viewBox 0 0 224 360).
const ZONE: Record<
  string,
  { x: number; y: number; w: number; h: number; rotate?: number }
> = {
  stomach_upper_left: { x: 314, y: 200, w: 24, h: 30 },
  stomach_upper_mid: { x: 288, y: 200, w: 24, h: 30 },
  stomach_upper_right: { x: 262, y: 200, w: 24, h: 30 },
  stomach_mid_left: { x: 314, y: 232, w: 24, h: 30 },
  stomach_mid_right: { x: 262, y: 232, w: 24, h: 30 },
  stomach_lower_left: { x: 314, y: 264, w: 24, h: 30 },
  stomach_lower_mid: { x: 288, y: 264, w: 24, h: 30 },
  stomach_lower_right: { x: 262, y: 264, w: 24, h: 30 },
  left_arm: { x: 354, y: 140, w: 30, h: 110, rotate: -6 },
  right_arm: { x: 216, y: 140, w: 30, h: 110, rotate: 6 },
  left_hip: { x: 308, y: 296, w: 34, h: 28 },
  right_hip: { x: 258, y: 296, w: 34, h: 28 },
  left_thigh: { x: 308, y: 336, w: 36, h: 76 },
  right_thigh: { x: 256, y: 336, w: 36, h: 76 },
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
  const { t } = useTranslation();
  const resting = new Set(restingSiteIds);
  const drawable = sites.filter((s) => ZONE[s.id]);

  return (
    <svg
      viewBox="150 0 300 600"
      className="mx-auto h-auto w-full max-w-[280px] text-muted-foreground/25"
      role="group"
      aria-label={t('medications.bodymap.label', 'Injection site body map')}
    >
      {/* Silhouette (non-interactive) */}
      <path d={BODY_SILHOUETTE_PATH} fill="currentColor" stroke="none" />

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

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { translateSymptomLabel } from './symptomLabels';
import {
  BODY_REGIONS,
  HEAD_REGIONS,
  type SymptomRegion,
} from '@workspace/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type MapKind = 'head' | 'body';
type MapView = 'front' | 'back';

interface SymptomLocationMapProps {
  kind: MapKind;
  /** Region labels currently selected (the values stored on the entry). */
  selected: string[];
  onToggle: (label: string) => void;
}

type Shape =
  | {
      tag: 'rect';
      x: number;
      y: number;
      width: number;
      height: number;
      rx: number;
    }
  | { tag: 'circle'; cx: number; cy: number; r: number }
  | { tag: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { tag: 'path'; d: string };

const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  rx: number
): Shape => ({ tag: 'rect', x, y, width, height, rx });
const circle = (cx: number, cy: number, r: number): Shape => ({
  tag: 'circle',
  cx,
  cy,
  r,
});
const ellipse = (cx: number, cy: number, rx: number, ry: number): Shape => ({
  tag: 'ellipse',
  cx,
  cy,
  rx,
  ry,
});
const path = (d: string): Shape => ({ tag: 'path', d });

// Shape of each region on the drawing. A region can be more than one shape
// (both arms, both knees); they share one selection. "Left" and "right" are the
// user's own, so the user's left sits on the viewer's right of a front view.
const SHAPES: Record<MapKind, Record<string, Shape[]>> = {
  head: {
    behind_both_eyes: [rect(34, 52, 52, 16, 8)],
    forehead: [ellipse(60, 30, 24, 10)],
    left_temple: [circle(94, 52, 9)],
    right_temple: [circle(26, 52, 9)],
    behind_left_eye: [circle(76, 60, 8)],
    behind_right_eye: [circle(44, 60, 8)],
    sinuses: [ellipse(60, 82, 9, 8)],
    face: [ellipse(60, 97, 28, 7)],
    jaw: [
      path('M38 106c8 12 16 18 22 18s14-6 22-18c-6 3-14 6-22 6s-16-3-22-6z'),
    ],
    top_of_head: [ellipse(60, 28, 26, 14)],
    back_of_head: [ellipse(60, 66, 30, 26)],
    neck: [rect(46, 112, 28, 26, 5)],
  },
  body: {
    head: [circle(60, 20, 14)],
    neck: [rect(54, 34, 12, 10, 3)],
    shoulders: [rect(22, 46, 76, 12, 6)],
    chest: [rect(40, 60, 40, 32, 6)],
    abdomen: [rect(42, 94, 36, 28, 6)],
    pelvis: [rect(42, 124, 36, 16, 6)],
    arms: [rect(16, 60, 14, 60, 7), rect(90, 60, 14, 60, 7)],
    hands: [ellipse(23, 130, 8, 9), ellipse(97, 130, 8, 9)],
    hips: [rect(30, 126, 10, 20, 5), rect(80, 126, 10, 20, 5)],
    legs: [rect(42, 142, 16, 92, 8), rect(62, 142, 16, 92, 8)],
    knees: [circle(50, 196, 9), circle(70, 196, 9)],
    feet: [ellipse(50, 248, 10, 8), ellipse(70, 248, 10, 8)],
    upper_back: [rect(38, 50, 44, 38, 8)],
    lower_back: [rect(42, 90, 36, 36, 8)],
  },
};

function renderShape(shape: Shape, index: number, className: string) {
  const common = { className, strokeWidth: 1 };
  switch (shape.tag) {
    case 'rect':
      return <rect key={index} {...shape} {...common} />;
    case 'circle':
      return <circle key={index} {...shape} {...common} />;
    case 'ellipse':
      return <ellipse key={index} {...shape} {...common} />;
    default:
      return <path key={index} d={shape.d} {...common} />;
  }
}

const OUTLINE: Record<MapKind, Record<MapView, string>> = {
  head: {
    front:
      'M60 10c-22 0-38 18-38 46 0 16 3 28 9 40 5 10 10 22 10 32h38c0-10 5-22 10-32 6-12 9-24 9-40 0-28-16-46-38-46z',
    back: 'M60 10c-22 0-38 18-38 46 0 16 3 28 9 40 5 10 10 22 10 32h38c0-10 5-22 10-32 6-12 9-24 9-40 0-28-16-46-38-46z',
  },
  body: {
    front:
      'M60 6a14 14 0 1 1 0 28 14 14 0 0 1 0-28zM54 34h12v12h32v12h-6v62h-10v8h-8v104H62v-70h-4v70H44V138h-8v-8H26V58h-6V46h32V34z',
    back: 'M60 6a14 14 0 1 1 0 28 14 14 0 0 1 0-28zM54 34h12v12h32v12h-6v62h-10v8h-8v104H62v-70h-4v70H44V138h-8v-8H26V58h-6V46h32V34z',
  },
};

const VIEW_BOX: Record<MapKind, string> = {
  head: '0 0 120 150',
  body: '0 0 120 262',
};

/**
 * A tappable head or body drawing. Each region toggles the same label the chip
 * list uses, so the map and the list are one selection. Every region is
 * keyboard reachable, and the chips remain a full fallback.
 */
export default function SymptomLocationMap({
  kind,
  selected,
  onToggle,
}: SymptomLocationMapProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<MapView>('front');
  const regions: SymptomRegion[] = (
    kind === 'head' ? HEAD_REGIONS : BODY_REGIONS
  ).filter((r) => r.view === view);
  const set = new Set(selected);

  return (
    <div className="flex flex-col gap-2 items-start">
      <div
        className="inline-flex rounded-lg bg-muted p-0.5 text-xs"
        role="group"
        aria-label={t('symptoms.map.view', 'Map view')}
      >
        {(['front', 'back'] as const).map((v) => (
          <Button
            key={v}
            type="button"
            size="sm"
            variant={view === v ? 'secondary' : 'ghost'}
            className="h-7 px-3 text-xs"
            aria-pressed={view === v}
            onClick={() => setView(v)}
          >
            {v === 'front'
              ? t('symptoms.map.front', 'Front')
              : t('symptoms.map.back', 'Back')}
          </Button>
        ))}
      </div>
      <svg
        viewBox={VIEW_BOX[kind]}
        className={cn('h-auto', kind === 'head' ? 'w-32' : 'w-24')}
        role="group"
        aria-label={
          kind === 'head'
            ? t('symptoms.map.headLabel', 'Head map')
            : t('symptoms.map.bodyLabel', 'Body map')
        }
      >
        <path
          d={OUTLINE[kind][view]}
          className="fill-none stroke-border"
          strokeWidth={1.5}
        />
        {regions.map((region) => {
          const isOn = set.has(region.label);
          return (
            <g
              key={region.id}
              role="button"
              tabIndex={0}
              aria-pressed={isOn}
              aria-label={translateSymptomLabel(t, region.label)}
              className="cursor-pointer outline-none focus-visible:[&>*]:stroke-ring focus-visible:[&>*]:stroke-2"
              onClick={() => onToggle(region.label)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onToggle(region.label);
                }
              }}
            >
              {(SHAPES[kind][region.id] ?? []).map((shape, i) =>
                renderShape(
                  shape,
                  i,
                  cn(
                    'stroke-border transition-colors',
                    isOn
                      ? 'fill-primary/60 stroke-primary'
                      : 'fill-muted hover:fill-accent'
                  )
                )
              )}
            </g>
          );
        })}
      </svg>
      <p className="text-xs text-muted-foreground max-w-[14rem]">
        {t(
          'symptoms.map.hint',
          'Tap where it hurts. Left and right are yours.'
        )}
      </p>
    </div>
  );
}

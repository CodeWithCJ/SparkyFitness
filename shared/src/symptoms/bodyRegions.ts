/**
 * Region ids shared by the web and mobile head/body location pickers. A region's
 * `label` is the value stored in `symptom_entries.body_locations`, so tapping a
 * region on a map and picking the same name from the chip list are the same
 * selection. "Left" and "right" always mean the user's own left and right.
 */
export interface SymptomRegion {
  id: string;
  label: string;
  view: 'front' | 'back' | 'side';
}

export const HEAD_REGIONS: SymptomRegion[] = [
  { id: 'forehead', label: 'Forehead', view: 'front' },
  { id: 'behind_both_eyes', label: 'Behind both eyes', view: 'front' },
  { id: 'behind_left_eye', label: 'Behind left eye', view: 'front' },
  { id: 'behind_right_eye', label: 'Behind right eye', view: 'front' },
  { id: 'left_temple', label: 'Left temple', view: 'front' },
  { id: 'right_temple', label: 'Right temple', view: 'front' },
  { id: 'sinuses', label: 'Sinuses', view: 'front' },
  { id: 'face', label: 'Face', view: 'front' },
  { id: 'jaw', label: 'Jaw', view: 'front' },
  { id: 'top_of_head', label: 'Top of head', view: 'back' },
  { id: 'back_of_head', label: 'Back of head', view: 'back' },
  { id: 'neck', label: 'Neck', view: 'back' },
];

export const BODY_REGIONS: SymptomRegion[] = [
  { id: 'head', label: 'Head', view: 'front' },
  { id: 'neck', label: 'Neck', view: 'front' },
  { id: 'shoulders', label: 'Shoulders', view: 'front' },
  { id: 'chest', label: 'Chest', view: 'front' },
  { id: 'abdomen', label: 'Abdomen', view: 'front' },
  { id: 'pelvis', label: 'Pelvis', view: 'front' },
  { id: 'arms', label: 'Arms', view: 'front' },
  { id: 'hands', label: 'Hands / wrists', view: 'front' },
  { id: 'hips', label: 'Hips', view: 'front' },
  { id: 'legs', label: 'Legs', view: 'front' },
  { id: 'knees', label: 'Knees', view: 'front' },
  { id: 'feet', label: 'Feet / ankles', view: 'front' },
  { id: 'upper_back', label: 'Upper back', view: 'back' },
  { id: 'lower_back', label: 'Lower back', view: 'back' },
];

export type MapKind = 'head' | 'body';
export type MapView = 'front' | 'back';

export type RegionShape =
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
): RegionShape => ({ tag: 'rect', x, y, width, height, rx });
const circle = (cx: number, cy: number, r: number): RegionShape => ({
  tag: 'circle',
  cx,
  cy,
  r,
});
const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry: number
): RegionShape => ({
  tag: 'ellipse',
  cx,
  cy,
  rx,
  ry,
});
const path = (d: string): RegionShape => ({ tag: 'path', d });

// Shape of each region on the drawing. A region can be more than one shape
// (both arms, both knees); they share one selection. "Left" and "right" are the
// user's own, so the user's left sits on the viewer's right of a front view.
export const REGION_SHAPES: Record<MapKind, Record<string, RegionShape[]>> = {
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

export const MAP_OUTLINE: Record<MapKind, Record<MapView, string>> = {
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

export const MAP_VIEW_BOX: Record<MapKind, string> = {
  head: '0 0 120 150',
  body: '0 0 120 262',
};

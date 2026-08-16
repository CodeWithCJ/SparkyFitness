import fs from 'fs';
import path from 'path';

const LAYOUT_PATH = path.join(
  __dirname,
  '../../src/services/WorkoutLiveActivityLayout.tsx',
);
const LAYOUT_SRC = fs.readFileSync(LAYOUT_PATH, 'utf8');

const FORBIDDEN_LITERALS = [
  '"Rest"',
  '"Paused"',
  '"Elapsed"',
  '"Workout complete"',
  '"Complete"',
  '"Add 15 seconds"',
  '"Skip rest"',
  '"Workout"',
  '"Exercise"',
  '"Set"',
  '"of"',
  "'Rest'",
  "'Paused'",
  "'Elapsed'",
  "'Workout complete'",
  "'Complete'",
  "'Add 15 seconds'",
  "'Skip rest'",
  "'Workout'",
  "'Exercise'",
  "'Set'",
  "'of'",
  '>Rest<',
  '>Paused<',
  '>Elapsed<',
  '>Workout complete<',
  '>Complete<',
  '>Add 15 seconds<',
  '>Skip rest<',
  '>Workout<',
  '>Exercise<',
  '>Set<',
  '>+15s<',
];

describe('WorkoutLiveActivityLayout contract', () => {
  it('does not import i18next or React Native', () => {
    expect(LAYOUT_SRC).not.toMatch(/from ['"]i18next/);
    expect(LAYOUT_SRC).not.toMatch(/react-i18next/);
    expect(LAYOUT_SRC).not.toMatch(/from ['"]react-native['"]/);
    expect(LAYOUT_SRC).not.toMatch(/react-native/);
  });

  it('does not contain forbidden hardcoded English user-facing literals', () => {
    for (const literal of FORBIDDEN_LITERALS) {
      expect(LAYOUT_SRC).not.toContain(literal);
    }
  });

  it('renders all user-facing labels from the labels prop', () => {
    const labelRefs = [
      'props.labels.rest',
      'props.labels.paused',
      'props.labels.elapsed',
      'props.labels.workoutComplete',
      'props.labels.complete',
      'props.labels.addFifteenSeconds',
      'props.labels.addFifteenSecondsShort',
      'props.labels.skipRest',
    ];
    for (const ref of labelRefs) {
      expect(LAYOUT_SRC).toContain(ref);
    }
  });

  it('declares locale and labels on the props type', () => {
    expect(LAYOUT_SRC).toMatch(/locale: WorkoutLiveActivityLocale/);
    expect(LAYOUT_SRC).toMatch(/labels: WorkoutLiveActivityLabels/);
    expect(LAYOUT_SRC).toMatch(/import type \{[^}]*WorkoutLiveActivityLabels/);
  });

  it('keeps action target ids unchanged', () => {
    expect(LAYOUT_SRC).toContain('target="rest-add-15"');
    expect(LAYOUT_SRC).toContain('target="rest-skip"');
    expect(LAYOUT_SRC).toContain('target="complete-set"');
  });

  it('keeps all widget regions', () => {
    for (const region of [
      'banner:',
      'bannerSmall:',
      'compactLeading:',
      'compactTrailing:',
      'minimal:',
      'expandedLeading:',
      'expandedTrailing:',
      'expandedBottom:',
    ]) {
      expect(LAYOUT_SRC).toContain(region);
    }
  });

  it('does not perform storage reads or use Intl in the layout', () => {
    expect(LAYOUT_SRC).not.toMatch(/UserDefaults|AsyncStorage|new File\(/);
    expect(LAYOUT_SRC).not.toMatch(/Intl\./);
  });

  it('keeps timestamps as numbers and the widget directive', () => {
    expect(LAYOUT_SRC).toMatch(/'widget'/);
    expect(LAYOUT_SRC).toMatch(/startedAt: number/);
    expect(LAYOUT_SRC).toMatch(/restStartedAt: number \| null/);
    expect(LAYOUT_SRC).toMatch(/restEndsAt: number \| null/);
  });
});

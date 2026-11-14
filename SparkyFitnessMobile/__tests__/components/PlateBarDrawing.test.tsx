import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { useCSSVariable } from 'uniwind';
import type { PlateLoad } from '@workspace/shared';
import PlateBarDrawing, {
  layoutBar,
} from '../../src/components/PlateBarDrawing';
import { plateColorKey, plateDimensions } from '../../src/utils/plateColors';
import { initializeI18n } from '../../src/localization/i18n';

const TOKENS = [
  'red',
  'blue',
  'yellow',
  'green',
  'white',
  'grey',
  'steel',
  'sleeve',
  'label',
];
const tokenColor = (name: string) =>
  `#0${TOKENS.indexOf(name.replace('--color-plate-', ''))}0000`;
// react-native-svg hands the native layer a processed colour.
const fillOf = (key: string) => ({
  type: 0,
  payload: 0xff000000 + TOKENS.indexOf(key) * 0x10000,
});

beforeAll(async () => {
  await initializeI18n('en');
});
beforeEach(() => {
  // Each token reads back as its own distinct colour, so a fill says which
  // token it came from.
  jest
    .mocked(useCSSVariable)
    .mockImplementation(((vars: string | string[]) =>
      Array.isArray(vars) ? vars.map(tokenColor) : tokenColor(vars)) as never);
});

const load = (plates: [number, number][]): PlateLoad => ({
  plates: plates.map(([weight, count]) => ({ weight, count })),
  perSideWeight: plates.reduce((sum, [w, c]) => sum + w * c, 0),
  totalWeight: 0,
  plateCountPerSide: plates.reduce((sum, [, c]) => sum + c, 0),
});

describe('plateColorKey', () => {
  it.each([
    ['kg', 25, 'red'],
    ['kg', 20, 'blue'],
    ['kg', 15, 'yellow'],
    ['kg', 10, 'green'],
    ['kg', 5, 'white'],
    ['kg', 2.5, 'grey'],
    ['kg', 1.25, 'grey'],
    ['kg', 55, 'grey'],
    ['lbs', 55, 'red'],
    ['lbs', 45, 'blue'],
    ['lbs', 35, 'yellow'],
    ['lbs', 25, 'green'],
    ['lbs', 10, 'white'],
    ['lbs', 5, 'grey'],
    ['lbs', 20, 'grey'],
  ] as const)('%s %s is %s', (unit, weight, key) => {
    expect(plateColorKey(weight, unit)).toBe(key);
  });
});

describe('plateDimensions', () => {
  it('draws heavier plates taller and thicker, the heaviest at full size', () => {
    const heights = [25, 20, 15, 10, 5, 2.5, 1.25].map(
      (w) => plateDimensions(w, 'kg').height
    );
    expect(heights).toEqual([...heights].sort((a, b) => b - a));
    expect(plateDimensions(25, 'kg')).toEqual({ height: 120, width: 22 });
    expect(plateDimensions(55, 'lbs').height).toBe(120);
    expect(plateDimensions(45, 'lbs').height).toBeCloseTo(112, 0);
    expect(plateDimensions(1.25, 'kg').height).toBeGreaterThan(40);
  });
});

describe('PlateBarDrawing', () => {
  it('fills each plate with its competition colour and others grey', () => {
    render(
      <PlateBarDrawing
        load={load([
          [25, 1],
          [5, 1],
          [1.25, 1],
        ])}
        unit="kg"
      />
    );
    expect(screen.getByTestId('plate-25').props.fill).toEqual(fillOf('red'));
    expect(screen.getByTestId('plate-5').props.fill).toEqual(fillOf('white'));
    expect(screen.getByTestId('plate-1.25').props.fill).toEqual(fillOf('grey'));
    expect(screen.getByLabelText('Per side: 25, 5, 1.25 kg')).toBeTruthy();
  });

  it('colours lb plates by the lb scale and reads out lb', () => {
    render(<PlateBarDrawing load={load([[45, 2]])} unit="lbs" />);
    expect(screen.getAllByTestId('plate-45')).toHaveLength(2);
    expect(screen.getAllByTestId('plate-45')[0]!.props.fill).toEqual(
      fillOf('blue')
    );
    expect(screen.getByLabelText('Per side: 45, 45 lb')).toBeTruthy();
  });

  it('labels an empty bar', () => {
    render(<PlateBarDrawing load={load([])} unit="kg" />);
    expect(
      screen.getByLabelText('Per side: no plates, empty bar')
    ).toBeTruthy();
  });

  it('draws the strip small, without a sleeve', () => {
    const large = layoutBar(load([[25, 1]]), 'kg', 'large');
    const compact = layoutBar(load([[25, 1]]), 'kg', 'compact');
    expect(large.sleeve).not.toBeNull();
    expect(compact.sleeve).toBeNull();
    expect(compact.plates[0]!.height).toBeLessThan(large.plates[0]!.height);
    expect(compact.plates[0]!.label).toBeNull();
    expect(large.plates[0]!.label).toBe('25');
  });

  it('grows the canvas for a wide load instead of overflowing', () => {
    const wide = layoutBar(load([[25, 12]]), 'kg', 'large');
    expect(wide.width).toBeGreaterThan(358);
    const last = wide.plates[wide.plates.length - 1]!;
    expect(last.x + last.width).toBeLessThan(wide.width);
  });
});

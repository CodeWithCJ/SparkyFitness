import { evaluateArithmetic } from '@workspace/shared';

describe('evaluateArithmetic', () => {
  it.each([
    ['28/3', 28 / 3],
    ['30*5', 150],
    ['50+10', 60],
    ['50-10', 40],
    ['2+3*4', 14],
    ['(2+3)*4', 20],
    ['20/2/5', 2],
    ['10-3-2', 5],
    ['-2 * -3', 6],
    ['-(2+3)', -5],
    ['+2 + .5', 2.5],
    ['1,5*2', 3],
    [' 1.25 + (3 / 4) ', 2],
    ['1e2/4', 25],
    ['0', 0],
    // Grouped operands (space / EU / US thousands) match the mobile
    // parseDecimalInput rules, so `1 000/2` and `1.001,5/2` evaluate like
    // their plain-number counterparts.
    ['1 000/2', 500],
    ['1.001,5/2', 500.75],
    ['1 000/2 + 1.001,5', 1501.5],
    // A leading comma (or dot) starts a decimal, matching parseDecimalInput:
    // `,5` is 0.5, so `,5*2` and `2*,5` evaluate.
    [',5*2', 1],
    [',5+1', 1.5],
    ['2*,5', 1],
  ])('evaluates %s', (expression, expected) => {
    expect(evaluateArithmetic(expression)).toBeCloseTo(expected);
  });

  it.each([
    '',
    ' ',
    '30*',
    '(2+3',
    '2+3)',
    '2(3)',
    '1..5',
    '1,2,3',
    '1/0',
    '0/0',
    '1e309',
    '1/1e309',
    '10/(1+1/1e309)',
    '1e308*10',
    'NaN',
    'Infinity',
    'Math.random()',
    'alert(1)',
    '2**3',
    '2//3',
    '2;3',
    '0x10',
    '1e',
    '1'.repeat(201),
    // A space group that is not exactly three digits is malformed (the
    // mobile parseDecimalInput rejects it too), so it must not be stripped.
    '1 0000/2',
    // A lone comma has no digits; only a leading comma followed by digits is
    // a decimal.
    ',',
  ])('rejects invalid or non-finite input %s', (expression) => {
    expect(evaluateArithmetic(expression)).toBeUndefined();
  });
});

import { evaluateArithmetic } from '@/utils/evaluateArithmetic';

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
  ])('rejects invalid or non-finite input %s', (expression) => {
    expect(evaluateArithmetic(expression)).toBeUndefined();
  });
});

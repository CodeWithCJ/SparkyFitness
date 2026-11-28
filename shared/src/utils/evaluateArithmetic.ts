/**
 * Number-shape rules for expression operands, mirroring the mobile
 * `parseDecimalInput` (SparkyFitnessMobile/src/utils/numericInput.ts). An
 * operand may be a plain number, a decimal, a comma/dot decimal, a
 * dot/comma thousands-grouped value, or a space-grouped value. Exponent
 * forms (`1e2`, `1.5e-3`) are handled separately, as `parseDecimalInput`
 * does not cover them.
 */
const WS = '[\\s\\u00a0\\u202f]';
const OUTER_WS = new RegExp(`^${WS}+|${WS}+$`, 'g');
const HAS_WS = new RegExp(`${WS}`);
const STRIP_WS = new RegExp(WS, 'g');
const SPACE_THOUSANDS = new RegExp(`^\\d{1,3}(?:${WS}\\d{3})+(?:[.,]\\d+)?$`);
const PLAIN_INT = /^\d+$/;
const US_THOUSANDS_WITH_DECIMAL = /^\d{1,3}(?:,\d{3})+\.\d+$/;
const US_THOUSANDS = /^\d{1,3}(?:,\d{3}){2,}$/;
const EU_THOUSANDS_WITH_DECIMAL = /^\d{1,3}(?:\.\d{3})+,\d+$/;
const EU_THOUSANDS = /^\d{1,3}(?:\.\d{3}){2,}$/;
const DOT_DECIMAL = /^(?:\d+\.\d*|\.\d+)$/;
const COMMA_DECIMAL = /^(?:\d+,\d*|,\d+)$/;

function normalizeNumberToken(token: string): number {
  const trimmed = token.replace(OUTER_WS, '');
  if (trimmed === '') return NaN;
  // Exponent form: parse directly; overflow yields NaN.
  if (/[eE]/.test(trimmed)) {
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : NaN;
  }
  let s: string;
  if (HAS_WS.test(trimmed)) {
    if (!SPACE_THOUSANDS.test(trimmed)) return NaN;
    s = trimmed.replace(STRIP_WS, '');
  } else {
    s = trimmed;
  }
  if (PLAIN_INT.test(s)) return parseFloat(s);
  if (US_THOUSANDS_WITH_DECIMAL.test(s) || US_THOUSANDS.test(s)) {
    return parseFloat(s.replace(/,/g, ''));
  }
  if (EU_THOUSANDS_WITH_DECIMAL.test(s) || EU_THOUSANDS.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  if (DOT_DECIMAL.test(s)) return parseFloat(s);
  if (COMMA_DECIMAL.test(s)) return parseFloat(s.replace(',', '.'));
  return NaN;
}

/** Evaluate numbers and basic arithmetic without executing JavaScript. */
export function evaluateArithmetic(input: string): number | undefined {
  if (input.length > 200 || !input.trim()) return undefined;

  const expression = input;
  let position = 0;

  function skipWhitespace() {
    while (/\s/.test(expression[position] ?? '')) position++;
  }

  function factor(): number {
    skipWhitespace();
    const operator = expression[position];
    if (operator === '+' || operator === '-') {
      position++;
      const value = factor();
      return operator === '-' ? -value : value;
    }
    if (operator === '(') {
      position++;
      const value = sum();
      skipWhitespace();
      if (expression[position] !== ')') return NaN;
      position++;
      return value;
    }
    const number = expression
      .slice(position)
      .match(/^(?:\d[\d\s\u00a0\u202f.,]*|\.\d+)(?:[eE][+-]?\d+)?/);
    if (!number) return NaN;
    position += number[0].length;
    return normalizeNumberToken(number[0]);
  }

  function product(): number {
    let value = factor();
    skipWhitespace();
    while (expression[position] === '*' || expression[position] === '/') {
      const operator = expression[position++];
      const right = factor();
      value = operator === '*' ? value * right : value / right;
      // A later operation must not conceal division by zero or overflow.
      if (!Number.isFinite(value)) return NaN;
      skipWhitespace();
    }
    return value;
  }

  function sum(): number {
    let value = product();
    skipWhitespace();
    while (expression[position] === '+' || expression[position] === '-') {
      const operator = expression[position++];
      const right = product();
      value = operator === '+' ? value + right : value - right;
      if (!Number.isFinite(value)) return NaN;
      skipWhitespace();
    }
    return value;
  }

  const value = sum();
  return position === expression.length && Number.isFinite(value)
    ? value
    : undefined;
}

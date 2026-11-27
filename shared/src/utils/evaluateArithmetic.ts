/** Evaluate numbers and basic arithmetic without executing JavaScript. */
export function evaluateArithmetic(input: string): number | undefined {
  if (input.length > 200 || !input.trim()) return undefined;

  const expression = input.replace(/,/g, '.');
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
      .match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (!number) return NaN;
    position += number[0].length;
    const value = Number(number[0]);
    return Number.isFinite(value) ? value : NaN;
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

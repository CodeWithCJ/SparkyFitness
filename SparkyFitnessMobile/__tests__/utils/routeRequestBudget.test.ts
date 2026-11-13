import { createRequestBudget } from '../../src/utils/routeRequestBudget';

describe('createRequestBudget', () => {
  it('allows the limit within the window, then refuses until the oldest ages out', () => {
    const budget = createRequestBudget(3, 1000);
    expect(budget.take(0)).toBe(true);
    expect(budget.take(100)).toBe(true);
    expect(budget.take(200)).toBe(true);
    expect(budget.take(300)).toBe(false);
    expect(budget.msUntilFree(300)).toBe(700);
    expect(budget.take(999)).toBe(false);
    expect(budget.take(1000)).toBe(true);
    expect(budget.msUntilFree(1000)).toBe(100);
  });

  it('reports no wait while there is room and can be reset', () => {
    const budget = createRequestBudget(1, 1000);
    expect(budget.msUntilFree(0)).toBe(0);
    budget.take(0);
    expect(budget.msUntilFree(10)).toBe(990);
    budget.reset();
    expect(budget.take(10)).toBe(true);
  });
});

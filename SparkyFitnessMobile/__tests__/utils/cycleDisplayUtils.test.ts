import { getPhaseDisplayName } from '../../src/utils/cycleDisplayUtils';

describe('getPhaseDisplayName', () => {
  it('uses the injected translator for rendered phase labels', () => {
    const t = (key: string) => 'translated:' + key;

    expect(getPhaseDisplayName('menstrual', false, t)).toBe('translated:cycle.phase.period');
  });
});

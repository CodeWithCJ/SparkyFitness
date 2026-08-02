import React from 'react';
import { render } from '@testing-library/react-native';
import CycleCard from '../../src/components/CycleCard';

let mockLocale: 'en' | 'pl' = 'en';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        en: {
          'cycleCard.title.pregnancy': 'Pregnancy tracking',
          'cycleCard.setup.action': 'Set up',
          'cycleCard.setup.description': 'Track cycle phases, predictions, symptoms, and pregnancy milestones.',
        },
        pl: {
          'cycleCard.title.pregnancy': 'Monitorowanie ciąży',
          'cycleCard.setup.action': 'Skonfiguruj',
          'cycleCard.setup.description': 'Monitoruj fazy cyklu, prognozy, objawy i etapy ciąży.',
        },
      })[mockLocale][key] ?? key,
  }),
}));

jest.mock('uniwind', () => ({ useCSSVariable: () => ['#000000'] }));
jest.mock('../../src/hooks/useCycleSettings', () => ({
  useCycleSettings: () => ({
    settings: { enabled: true, onboarded_at: null, mode: 'pregnant' },
    isLoading: false,
  }),
}));
jest.mock('../../src/hooks/useDiscreetMode', () => ({ useDiscreetMode: () => ({ discreetMode: false }) }));
jest.mock('../../src/hooks/usePregnancy', () => ({
  useCurrentPregnancy: () => ({ pregnancy: null }),
  usePregnancyOverview: () => ({ overview: null }),
}));
jest.mock('../../src/hooks/useCyclePredictionData', () => ({ useCyclePredictionData: () => null }));
jest.mock('../../src/components/Icon', () => 'Icon');
jest.mock('../../src/components/wellness/pregnancy/WombScene', () => 'WombScene');
jest.mock('../../src/components/wellness/CycleRing', () => 'CycleRing');
jest.mock('../../src/components/wellness/theme/wellnessTokens', () => ({
  useWellnessTokens: () => ({ phasePregnant: '#000000' }),
}));

describe('CycleCard localization', () => {
  it.each([
    ['en', 'Pregnancy tracking', 'Set up'],
    ['pl', 'Monitorowanie ciąży', 'Skonfiguruj'],
  ] as const)('renders setup content in %s', (selectedLocale, title, action) => {
    mockLocale = selectedLocale;
    const view = render(<CycleCard navigation={{ navigate: jest.fn() } as never} />);

    expect(view.getByText(title)).toBeTruthy();
    expect(view.getByText(action)).toBeTruthy();
  });
});

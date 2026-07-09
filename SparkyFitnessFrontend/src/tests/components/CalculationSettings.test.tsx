import { render, screen } from '@testing-library/react';
import { CalculationSettings } from '@/components/Onboarding/CalculationSettings';
import {
  FatBreakdownAlgorithm,
  MineralCalculationAlgorithm,
  SugarCalculationAlgorithm,
  VitaminCalculationAlgorithm,
} from '@/types/nutrientAlgorithms';

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => `[${key}]`,
  }),
}));

describe('CalculationSettings', () => {
  it('localizes the advanced calculation controls and algorithm names', () => {
    render(
      <CalculationSettings
        localFatBreakdownAlgorithm={FatBreakdownAlgorithm.AHA_GUIDELINES}
        localMineralAlgorithm={MineralCalculationAlgorithm.RDA_STANDARD}
        localSugarAlgorithm={SugarCalculationAlgorithm.WHO_GUIDELINES}
        localVitaminAlgorithm={VitaminCalculationAlgorithm.RDA_STANDARD}
        setLocalFatBreakdownAlgorithm={jest.fn()}
        setLocalMineralAlgorithm={jest.fn()}
        setLocalSugarAlgorithm={jest.fn()}
        setLocalVitaminAlgorithm={jest.fn()}
        setShowAdvancedSettings={jest.fn()}
        showAdvancedSettings
      />
    );

    expect(
      screen.getByRole('button', {
        name: '[onboarding.calculationSettingsTitle]',
      })
    ).toBeTruthy();
    expect(
      screen.getByRole('combobox', {
        name: '[onboarding.calculationSettingsFatMethod]',
      })
    ).toBeTruthy();
    expect(
      screen.getByText(
        '[onboarding.calculationSettingsAlgorithms.AHA_GUIDELINES]'
      )
    ).toBeTruthy();
  });
});

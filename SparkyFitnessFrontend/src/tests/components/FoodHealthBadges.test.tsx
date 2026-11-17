import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { FoodHealthScore, FrontOfPackRegion } from '@workspace/shared';
import FoodHealthBadges from '@/components/FoodHealthBadges';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

let mockRegion: FrontOfPackRegion = 'none';
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => ({ frontOfPackRegion: mockRegion }),
}));

const healthScore: FoodHealthScore = {
  nutri_score: { grade: 'e', score: 21, source: 'computed' },
  warnings: {
    brazil: ['saturated_fat', 'sodium'],
    chile: ['calories'],
    mexico: [],
  },
};

describe('FoodHealthBadges', () => {
  it('shows only the Nutri-Score when no region is selected', () => {
    mockRegion = 'none';
    render(<FoodHealthBadges healthScore={healthScore} />);
    expect(screen.getByTestId('nutri-score-badge')).toHaveAccessibleName(
      'Nutri-Score E (calculated from nutrients)'
    );
    expect(screen.queryByTestId('front-of-pack-warning')).toBeNull();
  });

  it("shows the selected region's warnings", () => {
    mockRegion = 'brazil';
    render(<FoodHealthBadges healthScore={healthScore} />);
    expect(
      screen.getAllByTestId('front-of-pack-warning').map((w) => w.textContent)
    ).toEqual(['High in saturated fat', 'High in sodium']);
  });

  it('renders nothing without a grade or a warning for the region', () => {
    mockRegion = 'mexico';
    const { container } = render(
      <FoodHealthBadges healthScore={{ ...healthScore, nutri_score: null }} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});

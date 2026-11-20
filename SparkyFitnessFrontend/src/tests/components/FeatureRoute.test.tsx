import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import type { FeatureKey } from '@workspace/shared';
import type { FeatureChoiceState } from '@/hooks/Settings/useFeatureChoices';
import { FeatureRoute } from '@/components/FeatureRoute';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);

let mockActingOnBehalf = false;
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: mockActingOnBehalf }),
}));

let mockFeaturesOff = new Set<FeatureKey>();
jest.mock('@/hooks/Settings/useWebFeatures', () => ({
  useWebFeatures: () => ({
    isEnabled: (key: FeatureKey) => !mockFeaturesOff.has(key),
  }),
}));

let mockChoice: { state: FeatureChoiceState; isPending: boolean };
const mockSetFeatureOn = jest.fn();
jest.mock('@/hooks/Settings/useFeatureChoices', () => ({
  useSetWebFeatureChoice: () => ({
    ...mockChoice,
    setFeatureOn: mockSetFeatureOn,
  }),
}));

function renderRoute() {
  return render(
    <MemoryRouter>
      <FeatureRoute feature="labResults">
        <p>Lab results page</p>
      </FeatureRoute>
    </MemoryRouter>
  );
}

describe('FeatureRoute', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActingOnBehalf = false;
    mockFeaturesOff = new Set();
    mockChoice = { state: 'ready', isPending: false };
  });

  it('shows the page while its feature is on', () => {
    renderRoute();
    expect(screen.getByText('Lab results page')).toBeInTheDocument();
  });

  it('says the feature is off instead of showing the page, and turns it back on', () => {
    mockFeaturesOff = new Set<FeatureKey>(['labResults']);
    renderRoute();
    expect(screen.queryByText('Lab results page')).not.toBeInTheDocument();
    expect(screen.getByText('Lab results is turned off')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Features' })).toHaveAttribute(
      'href',
      '/settings?section=features'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(mockSetFeatureOn).toHaveBeenCalledWith('labResults', true);
  });

  it.each([
    ['a change is saving', { state: 'ready', isPending: true }],
    [
      'the choices are reloading after a failure',
      { state: 'loadFailed', isPending: false },
    ],
  ] as const)('cannot turn it on while %s', (_label, choice) => {
    mockFeaturesOff = new Set<FeatureKey>(['labResults']);
    mockChoice = choice;
    renderRoute();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeDisabled();
  });

  it('shows the page to someone acting for the person, whose switch it is not', () => {
    mockFeaturesOff = new Set<FeatureKey>(['labResults']);
    mockActingOnBehalf = true;
    renderRoute();
    expect(screen.getByText('Lab results page')).toBeInTheDocument();
  });
});

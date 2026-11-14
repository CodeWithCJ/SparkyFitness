import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import * as challengesApi from '@/api/Challenges/challengesApi';
import ChallengeStandingsCard from '@/pages/Diary/ChallengeStandingsCard';
import { challenge, standings, wrapper } from './challengesTestKit';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/api/Challenges/challengesApi');
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => jest.requireActual('./challengesTestKit').preferences,
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-me', fullName: 'Test Person' } }),
}));

const api = jest.mocked(challengesApi);

describe('Challenge standings (Diary card)', () => {
  it('shows each challenge with its current leaders and links to it', async () => {
    api.getChallengeStandings.mockResolvedValue(standings());
    const { Wrapper } = wrapper();
    render(
      <Wrapper>
        <MemoryRouter>
          <ChallengeStandingsCard challenges={[challenge({ emoji: '🏆' })]} />
        </MemoryRouter>
      </Wrapper>
    );
    expect(screen.getByText('Challenge standings')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '🏆 Office cup' })).toHaveAttribute(
      'href',
      `/challenges/${challenge().id}`
    );
    expect(await screen.findByText('Test B')).toBeInTheDocument();
    expect(screen.getByText('120.5 pts')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'All challenges' })
    ).toHaveAttribute('href', '/challenges');
  });
});

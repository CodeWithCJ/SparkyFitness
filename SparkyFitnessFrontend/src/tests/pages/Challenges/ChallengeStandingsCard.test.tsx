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

const api = jest.mocked(challengesApi);

describe('Challenge standings (Diary card)', () => {
  const renderCard = () => {
    const { Wrapper } = wrapper();
    render(
      <Wrapper>
        <MemoryRouter>
          <ChallengeStandingsCard challenges={[challenge({ emoji: '🏆' })]} />
        </MemoryRouter>
      </Wrapper>
    );
  };

  it('shows your place and who leads in each challenge, linking to it', async () => {
    api.getChallengeStandings.mockResolvedValue(standings());
    renderCard();
    expect(screen.getByText('Challenge standings')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /🏆 Office cup/ })).toHaveAttribute(
      'href',
      `/challenges/${challenge().id}`
    );
    expect(await screen.findByText('#2 of 2 · 90 pts')).toBeInTheDocument();
    expect(screen.getByText('Test B leads with 120.5 pts')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'All challenges' })
    ).toHaveAttribute('href', '/challenges');
  });

  it('says you lead when your row is on rank 1', async () => {
    const data = standings();
    data.rows = [
      { ...data.rows[1]!, rank: 1, total: 150 },
      { ...data.rows[0]!, rank: 2 },
    ];
    api.getChallengeStandings.mockResolvedValue(data);
    renderCard();
    expect(await screen.findByText('#1 of 2 · 150 pts')).toBeInTheDocument();
    expect(screen.getByText('You lead')).toBeInTheDocument();
  });
});

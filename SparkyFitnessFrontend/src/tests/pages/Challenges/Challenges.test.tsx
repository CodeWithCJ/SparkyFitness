import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { addDays, challengePreset, todayInZone } from '@workspace/shared';
import { HttpApiError } from '@/api/api';
import * as challengesApi from '@/api/Challenges/challengesApi';
import Challenges from '@/pages/Challenges/Challenges';
import ChallengeJoinLink from '@/pages/Challenges/ChallengeJoinLink';
import {
  CHALLENGE_ID,
  INVITE_CODE,
  challenge,
  standings,
  wrapper,
} from './challengesTestKit';

jest.mock('react-i18next', () =>
  jest.requireActual('@/tests/mocks/reactI18next')
);
jest.mock('@/api/Challenges/challengesApi');
jest.mock('@/hooks/use-toast', () => ({ toast: jest.fn() }));
let mockActingOnBehalf = false;
jest.mock('@/contexts/ActiveUserContext', () => ({
  useActiveUser: () => ({ isActingOnBehalf: mockActingOnBehalf }),
}));
jest.mock('@/contexts/PreferencesContext', () => ({
  usePreferences: () => jest.requireActual('./challengesTestKit').preferences,
}));
jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-me', fullName: 'Test Person' } }),
}));

const api = jest.mocked(challengesApi);

const renderAt = (path: string) => {
  const { Wrapper } = wrapper();
  render(
    <Wrapper>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/challenges" element={<Challenges />} />
          <Route path="/challenges/join" element={<ChallengeJoinLink />} />
          <Route path="/challenges/:challengeId" element={<Challenges />} />
        </Routes>
      </MemoryRouter>
    </Wrapper>
  );
};

describe('Challenges page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockActingOnBehalf = false;
    api.getChallengesStatus.mockResolvedValue({ enabled: true });
    api.listChallenges.mockResolvedValue([challenge()]);
    api.getChallenge.mockResolvedValue(challenge());
    api.getChallengeStandings.mockResolvedValue(standings());
    api.getChallengeRuleChanges.mockResolvedValue([
      {
        id: 'c1',
        changed_by_display_name: 'Test A',
        effective_from: '2026-10-19',
        rules: challengePreset('all_rounder').rules,
        previous_rules: null,
        created_at: '2026-10-18T10:00:00.000Z',
      },
    ]);
  });

  it('reads nothing while acting for someone else', () => {
    mockActingOnBehalf = true;
    renderAt('/challenges');
    expect(screen.getByText(/Challenges are personal/)).toBeInTheDocument();
    expect(api.getChallengesStatus).not.toHaveBeenCalled();
    expect(api.listChallenges).not.toHaveBeenCalled();
  });

  it('says so and asks for nothing more while the admin switch is off', async () => {
    api.getChallengesStatus.mockResolvedValue({ enabled: false });
    renderAt('/challenges');
    expect(
      await screen.findByText(/turned off on this server/)
    ).toBeInTheDocument();
    expect(api.listChallenges).not.toHaveBeenCalled();
  });

  it('lists challenges with the top of the current standings', async () => {
    renderAt('/challenges');
    expect(await screen.findByText('Office cup')).toBeInTheDocument();
    expect(await screen.findByText('Test B')).toBeInTheDocument();
    expect(screen.getByText('120.5 pts')).toBeInTheDocument();
    expect(screen.getByText('90 pts')).toBeInTheDocument();
    expect(api.getChallengeStandings).toHaveBeenCalledWith(CHALLENGE_ID, null);
  });

  it('steps the leaderboard to the period before and back', async () => {
    renderAt(`/challenges/${CHALLENGE_ID}`);
    expect(
      await screen.findByTestId('challenge-leaderboard')
    ).toBeInTheDocument();
    expect(await screen.findByText('Nov 9 – Nov 15')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();

    api.getChallengeStandings.mockResolvedValue(
      standings({
        period_start: '2026-11-02',
        period_end: '2026-11-08',
        final: true,
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Previous period' }));
    await waitFor(() =>
      expect(api.getChallengeStandings).toHaveBeenCalledWith(
        CHALLENGE_ID,
        '2026-11-08'
      )
    );
    expect(await screen.findByText('Final')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Current' }));
    expect(await screen.findByText('Nov 9 – Nov 15')).toBeInTheDocument();
  });

  it("opens a member's recent periods from the leaderboard", async () => {
    renderAt(`/challenges/${CHALLENGE_ID}`);
    fireEvent.click(await screen.findByRole('button', { name: /Test B/ }));
    const list = await screen.findByTestId('member-periods');
    // Weeks from the challenge start (Oct 19) up to the one shown (Nov 9).
    await waitFor(() =>
      expect(api.getChallengeStandings).toHaveBeenCalledWith(
        CHALLENGE_ID,
        '2026-10-19'
      )
    );
    expect(list.querySelectorAll('li')).toHaveLength(4);
  });

  it('explains the rules in effect, from the shared rules and scorer', async () => {
    renderAt(`/challenges/${CHALLENGE_ID}`);
    fireEvent.mouseDown(
      await screen.findByRole('tab', { name: 'How points work' })
    );
    const how = await screen.findByTestId('how-points-work');
    expect(how).toHaveTextContent('Steps: 1 point per 1,000, up to 10 a day.');
    expect(how).toHaveTextContent(
      'A 45-minute workout in zone 3 earns 90, and 8,000 steps add 8: 98 points.'
    );
  });

  it('shows the host an invite code once, with its link', async () => {
    api.createChallengeInvite.mockResolvedValue({
      code: INVITE_CODE,
      expires_at: '2026-11-21T00:00:00.000Z',
    });
    renderAt(`/challenges/${CHALLENGE_ID}`);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Members' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Make an invite code' })
    );
    expect(await screen.findByDisplayValue(INVITE_CODE)).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(
        `${window.location.origin}/challenges/join#${INVITE_CODE}`
      )
    ).toBeInTheDocument();
  });

  it('opens the join dialog from an invite link with the code filled in', async () => {
    api.joinChallenge.mockResolvedValue(challenge({ is_host: false }));
    renderAt(`/challenges/join#${INVITE_CODE}`);
    const code = await screen.findByLabelText('Invite link or code');
    expect(code).toHaveValue(INVITE_CODE);
    expect(screen.getByLabelText('Your name in this challenge')).toHaveValue(
      'Test'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    await waitFor(() =>
      expect(api.joinChallenge).toHaveBeenCalledWith({
        code: INVITE_CODE,
        display_name: 'Test',
        goal_type: 'stay_active',
      })
    );
    expect(
      await screen.findByTestId('challenge-leaderboard')
    ).toBeInTheDocument();
  });

  it('says why a join failed', async () => {
    api.joinChallenge.mockRejectedValue(
      new HttpApiError('This challenge is full', 409, 'CHALLENGE_FULL')
    );
    renderAt('/challenges');
    fireEvent.click(
      await screen.findByRole('button', { name: 'Join with a code' })
    );
    fireEvent.change(screen.getByLabelText('Invite link or code'), {
      target: { value: INVITE_CODE },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Join' }));
    expect(
      await screen.findByText('This challenge is full.')
    ).toBeInTheDocument();
  });

  it('creates a challenge from a preset with its rules and dates', async () => {
    api.createChallenge.mockResolvedValue(challenge());
    renderAt('/challenges');
    fireEvent.click(
      await screen.findByRole('button', { name: 'New challenge' })
    );
    fireEvent.click(screen.getByRole('radio', { name: /Race to 100k steps/ }));
    expect(screen.getByLabelText('Name')).toHaveValue('Race to 100k steps');
    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));

    const today = todayInZone('UTC');
    await waitFor(() => expect(api.createChallenge).toHaveBeenCalled());
    const body = api.createChallenge.mock.calls[0]?.[0];
    expect(body).toMatchObject({
      name: 'Race to 100k steps',
      preset: 'race_to_100k_steps',
      start_date: today,
      end_date: addDays(today, 29),
      time_zone: 'UTC',
      display_name: 'Test',
      rules: { metric: 'steps', format: 'race', target: 100000 },
    });
  });

  it('sends a host setting changed in the form', async () => {
    api.createChallenge.mockResolvedValue(challenge());
    renderAt('/challenges');
    fireEvent.click(
      await screen.findByRole('button', { name: 'New challenge' })
    );
    // All-Rounder is weekly with the best 5 days; count every day instead.
    fireEvent.click(screen.getByRole('button', { name: 'Days and times' }));
    fireEvent.click(
      screen.getByRole('switch', {
        name: 'Only the best days of each week count',
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
    await waitFor(() => expect(api.createChallenge).toHaveBeenCalled());
    expect(api.createChallenge.mock.calls[0]?.[0]).toMatchObject({
      preset: 'all_rounder',
      rules: { metric: 'points', bestDaysPerWeek: null },
    });
  });
});

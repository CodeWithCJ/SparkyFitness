import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  Link,
  MemoryRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import {
  addDays,
  challengePreset,
  todayInZone,
  weekStartOf,
} from '@workspace/shared';
import { HttpApiError } from '@/api/api';
import { toast } from '@/hooks/use-toast';
import * as challengesApi from '@/api/Challenges/challengesApi';
import Challenges from '@/pages/Challenges/Challenges';
import ChallengeJoinLink from '@/pages/Challenges/ChallengeJoinLink';
import { useInviteAcrossSignIn } from '@/hooks/Challenges/useInviteAcrossSignIn';
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
    // A running period has a leader (rank 1) but no winner yet.
    expect(screen.getByText('Leads')).toBeInTheDocument();
    expect(screen.queryByLabelText('Winner')).not.toBeInTheDocument();
    // The caller's row is the one the server marks with `me`.
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Test A/ }).closest('tr')
    ).toHaveClass('bg-accent/50');

    const final = standings({
      period_start: '2026-11-02',
      period_end: '2026-11-08',
      final: true,
    });
    final.rows[0] = { ...final.rows[0]!, winner: true };
    api.getChallengeStandings.mockResolvedValue(final);
    fireEvent.click(screen.getByRole('button', { name: 'Previous period' }));
    await waitFor(() =>
      expect(api.getChallengeStandings).toHaveBeenCalledWith(
        CHALLENGE_ID,
        '2026-11-08'
      )
    );
    expect(await screen.findByText('Final')).toBeInTheDocument();
    expect(screen.getByLabelText('Winner')).toBeInTheDocument();
    expect(screen.queryByText('Leads')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Current' }));
    expect(await screen.findByText('Nov 9 – Nov 15')).toBeInTheDocument();
  });

  it('puts the places with points on a podium, with each row bar against the top total', async () => {
    renderAt(`/challenges/${CHALLENGE_ID}`);
    const podium = await screen.findByTestId('challenge-podium');
    // Hidden from screen readers: the table carries the same names.
    expect(podium).toHaveAttribute('aria-hidden', 'true');
    expect(within(podium).getByText('Test B')).toBeInTheDocument();
    expect(within(podium).getByText('Test A')).toBeInTheDocument();
    // Plain leaderboard: the leader fills the bar, the rest are a share of it.
    expect(
      screen.getByRole('progressbar', { name: '100% of the top total' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: '75% of the top total' })
    ).toBeInTheDocument();
    // No find box for two members.
    expect(screen.queryByLabelText('Find a member')).not.toBeInTheDocument();
  });

  it('leaves the podium empty while everyone is on 0', async () => {
    const zero = standings();
    zero.rows = zero.rows.map((row) => ({ ...row, rank: 1, total: 0 }));
    api.getChallengeStandings.mockResolvedValue(zero);
    renderAt(`/challenges/${CHALLENGE_ID}`);
    expect(
      await screen.findByTestId('challenge-leaderboard')
    ).toBeInTheDocument();
    await screen.findAllByText('0 pts');
    expect(screen.queryByTestId('challenge-podium')).not.toBeInTheDocument();
  });

  it('finds a member in a long table', async () => {
    const many = standings();
    many.rows = ['Ana', 'Ben', 'Cy', 'Dee', 'Eve', 'José'].map((name, i) => ({
      user_id: `u-${i}`,
      display_name: name,
      rank: i + 1,
      total: 60 - i * 10,
      minutes: 10,
      winner: false,
      reached_on: null,
    }));
    api.getChallengeStandings.mockResolvedValue(many);
    renderAt(`/challenges/${CHALLENGE_ID}`);
    fireEvent.change(await screen.findByLabelText('Find a member'), {
      target: { value: 'ev' },
    });
    expect(screen.getByRole('button', { name: /Eve/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ana/ })).toBeNull();
    // Accents do not matter.
    fireEvent.change(screen.getByLabelText('Find a member'), {
      target: { value: 'jose' },
    });
    expect(screen.getByRole('button', { name: /José/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Find a member'), {
      target: { value: 'zz' },
    });
    expect(screen.getByText('No member matches.')).toBeInTheDocument();
    // Another period starts with the whole table again.
    fireEvent.click(screen.getByRole('button', { name: 'Previous period' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Find a member')).toHaveValue('')
    );
    expect(await screen.findByRole('button', { name: /Ana/ })).toBeVisible();
  });

  it('has no podium or row bars for a group goal', async () => {
    const group = standings({
      rules: {
        ...challengePreset('all_rounder').rules,
        format: 'group_goal',
        target: 500,
      },
    });
    api.getChallengeStandings.mockResolvedValue(group);
    renderAt(`/challenges/${CHALLENGE_ID}`);
    expect(await screen.findByText(/Together:/)).toBeInTheDocument();
    expect(screen.queryByTestId('challenge-podium')).not.toBeInTheDocument();
    expect(screen.queryByText('Progress')).not.toBeInTheDocument();
  });

  it('labels a daily goal bar by the days the goal was hit', async () => {
    const daily = standings({
      rules: {
        ...challengePreset('all_rounder').rules,
        format: 'hit_goal',
        target: 50,
        targetPer: 'day',
      },
    });
    daily.rows = daily.rows.map((row) => ({
      ...row,
      days_hit: 1,
      days_eligible: 4,
    }));
    api.getChallengeStandings.mockResolvedValue(daily);
    renderAt(`/challenges/${CHALLENGE_ID}`);
    expect(
      await screen.findAllByRole('progressbar', {
        name: 'Goal hit on 25% of days',
      })
    ).toHaveLength(2);
  });

  it('says how many days a challenge has left, or until it starts', async () => {
    const today = todayInZone('UTC');
    api.getChallenge.mockResolvedValue(
      challenge({ start_date: addDays(today, -3), end_date: addDays(today, 9) })
    );
    renderAt(`/challenges/${CHALLENGE_ID}`);
    expect(await screen.findByTestId('challenge-state')).toHaveTextContent(
      '10 days left'
    );
  });

  it('says Active while a challenge has no end date', async () => {
    renderAt(`/challenges/${CHALLENGE_ID}`);
    expect(await screen.findByTestId('challenge-state')).toHaveTextContent(
      'Active'
    );
  });

  it('says Ended once the server closed the challenge', async () => {
    api.getChallenge.mockResolvedValue(
      challenge({ ended_at: '2026-11-16T05:00:00.000Z' })
    );
    renderAt(`/challenges/${CHALLENGE_ID}`);
    expect(await screen.findByTestId('challenge-state')).toHaveTextContent(
      'Ended'
    );
  });

  it('says Last day on a challenge ending today', async () => {
    const today = todayInZone('UTC');
    api.getChallenge.mockResolvedValue(
      challenge({ start_date: addDays(today, -3), end_date: today })
    );
    renderAt(`/challenges/${CHALLENGE_ID}`);
    expect(await screen.findByTestId('challenge-state')).toHaveTextContent(
      'Last day'
    );
  });

  it('says when an upcoming challenge starts', async () => {
    const today = todayInZone('UTC');
    api.getChallenge.mockResolvedValue(
      challenge({ start_date: addDays(today, 1), end_date: addDays(today, 30) })
    );
    renderAt(`/challenges/${CHALLENGE_ID}`);
    expect(await screen.findByTestId('challenge-state')).toHaveTextContent(
      'Starts tomorrow'
    );
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

  it('says once, in its own words, why an invite could not be made', async () => {
    api.createChallengeInvite.mockRejectedValue(
      new HttpApiError('This challenge has ended', 409, 'CHALLENGE_ENDED')
    );
    renderAt(`/challenges/${CHALLENGE_ID}`);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Members' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Make an invite code' })
    );
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'This challenge has ended.' })
    );
  });

  it('shows a code made while another tab was open', async () => {
    let finish: (value: { code: string; expires_at: string }) => void = () =>
      undefined;
    api.createChallengeInvite.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      })
    );
    renderAt(`/challenges/${CHALLENGE_ID}`);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Members' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Make an invite code' })
    );
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Standings' }));
    await waitFor(() =>
      expect(screen.queryByTestId('invite-panel')).not.toBeInTheDocument()
    );
    finish({ code: INVITE_CODE, expires_at: '2026-11-21T00:00:00.000Z' });
    await waitFor(() =>
      expect(api.createChallengeInvite).toHaveBeenCalledTimes(1)
    );
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Members' }));
    expect(await screen.findByDisplayValue(INVITE_CODE)).toBeInTheDocument();
  });

  it('after a leave, Back asks again and shows the challenge is gone', async () => {
    api.leaveChallenge.mockResolvedValue(undefined as never);
    const Back = () => {
      const navigate = useNavigate();
      return <button onClick={() => navigate(-1)}>Back</button>;
    };
    const { Wrapper } = wrapper();
    render(
      <Wrapper>
        <MemoryRouter
          initialEntries={['/challenges', `/challenges/${CHALLENGE_ID}`]}
          initialIndex={1}
        >
          <Back />
          <Routes>
            <Route path="/challenges" element={<Challenges />} />
            <Route path="/challenges/:challengeId" element={<Challenges />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    const dialog = await screen.findByRole('dialog');
    api.listChallenges.mockResolvedValue([]);
    api.getChallenge.mockRejectedValue(
      new HttpApiError('Challenge not found', 404, 'CHALLENGE_NOT_FOUND')
    );
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave' }));
    expect(await screen.findByText(/No challenges yet/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(
      await screen.findByText(/not found, or you are not a member/)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Leave' })
    ).not.toBeInTheDocument();
  });

  it('keeps the shown invite code when the host switches tabs and back', async () => {
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
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Standings' }));
    await waitFor(() =>
      expect(screen.queryByDisplayValue(INVITE_CODE)).not.toBeInTheDocument()
    );
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Members' }));
    expect(await screen.findByDisplayValue(INVITE_CODE)).toBeInTheDocument();
    expect(api.createChallengeInvite).toHaveBeenCalledTimes(1);
  });

  it('leaves without asking again for the challenge it left', async () => {
    api.leaveChallenge.mockResolvedValue(undefined as never);
    // From the list, so the list is cached when the leave happens.
    renderAt('/challenges');
    fireEvent.click(await screen.findByRole('link', { name: /Office cup/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }));
    const dialog = await screen.findByRole('dialog');
    const reads = () =>
      api.getChallenge.mock.calls.length +
      api.getChallengeStandings.mock.calls.length +
      api.getChallengeRuleChanges.mock.calls.length;
    // The server no longer lists it.
    api.listChallenges.mockResolvedValue([]);
    const before = reads();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave' }));
    await waitFor(() =>
      expect(api.leaveChallenge).toHaveBeenCalledWith(CHALLENGE_ID)
    );
    // Back on the list: it is gone at once, and nothing reads it again.
    await waitFor(() => expect(api.listChallenges).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('standings-preview')).not.toBeInTheDocument();
    expect(reads()).toBe(before);
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

  it('a join from an invite link replaces it, so Back skips the used code', async () => {
    api.joinChallenge.mockResolvedValue(challenge({ is_host: false }));
    const Back = () => {
      const navigate = useNavigate();
      return <button onClick={() => navigate(-1)}>Back</button>;
    };
    const { Wrapper } = wrapper();
    render(
      <Wrapper>
        <MemoryRouter
          initialEntries={['/before', `/challenges/join#${INVITE_CODE}`]}
          initialIndex={1}
        >
          <Back />
          <Routes>
            <Route path="/before" element={<p>Before</p>} />
            <Route path="/challenges" element={<Challenges />} />
            <Route path="/challenges/join" element={<ChallengeJoinLink />} />
            <Route path="/challenges/:challengeId" element={<Challenges />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Join' }));
    expect(
      await screen.findByTestId('challenge-leaderboard')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Before')).toBeInTheDocument();
  });

  it('says the list failed to load, with a retry, rather than that it is empty', async () => {
    api.listChallenges.mockRejectedValue(new Error('down'));
    renderAt('/challenges');
    expect(
      await screen.findByText('Could not load your challenges.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/No challenges yet/)).not.toBeInTheDocument();
    api.listChallenges.mockResolvedValue([challenge()]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('challenge-list')).toBeInTheDocument();
  });

  it('says standings failed to load rather than that nobody scored', async () => {
    api.getChallengeStandings.mockRejectedValue(new Error('down'));
    renderAt(`/challenges/${CHALLENGE_ID}`);
    expect(
      await screen.findByText('Could not load the standings.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/No scores yet/)).not.toBeInTheDocument();
  });

  it('tells a failed load of one challenge from one that is not there', async () => {
    api.getChallenge.mockRejectedValue(new HttpApiError('boom', 500));
    renderAt(`/challenges/${CHALLENGE_ID}`);
    expect(
      await screen.findByText('Could not load this challenge.')
    ).toBeInTheDocument();
    api.getChallenge.mockRejectedValue(
      new HttpApiError('Challenge not found', 404, 'CHALLENGE_NOT_FOUND')
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByText(/not found, or you are not a member/)
    ).toBeInTheDocument();
  });

  it('moves a preset end with the start, so the preset keeps its length', async () => {
    api.createChallenge.mockResolvedValue(challenge());
    renderAt('/challenges');
    fireEvent.click(
      await screen.findByRole('button', { name: 'New challenge' })
    );
    fireEvent.click(screen.getByRole('radio', { name: /Race to 100k steps/ }));
    const start = addDays(todayInZone('UTC'), 3);
    fireEvent.change(screen.getByLabelText('Starts'), {
      target: { value: start },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
    await waitFor(() => expect(api.createChallenge).toHaveBeenCalled());
    expect(api.createChallenge.mock.calls[0]?.[0]).toMatchObject({
      start_date: start,
      end_date: addDays(start, 29),
    });
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

  it('a weekend preset started on Monday runs to that Sunday', async () => {
    api.createChallenge.mockResolvedValue(challenge());
    renderAt('/challenges');
    fireEvent.click(
      await screen.findByRole('button', { name: 'New challenge' })
    );
    fireEvent.click(screen.getByRole('radio', { name: /Weekend Warrior/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));

    const monday = weekStartOf(todayInZone('UTC'), 1);
    await waitFor(() => expect(api.createChallenge).toHaveBeenCalled());
    expect(api.createChallenge.mock.calls[0]?.[0]).toMatchObject({
      preset: 'weekend_warrior',
      start_date: monday,
      end_date: addDays(monday, 6),
    });
  });

  it('limits the start date and explains a refused one', async () => {
    api.createChallenge.mockRejectedValue(
      new HttpApiError(
        'start_date must be within 31 days before and 365 days after today',
        400,
        'CHALLENGE_INVALID_DATES'
      )
    );
    renderAt('/challenges');
    fireEvent.click(
      await screen.findByRole('button', { name: 'New challenge' })
    );
    const today = todayInZone('UTC');
    const start = screen.getByLabelText('Starts');
    expect(start).toHaveAttribute('min', addDays(today, -31));
    expect(start).toHaveAttribute('max', addDays(today, 365));

    // Typed past the limit: the form says so and will not send it.
    fireEvent.change(start, { target: { value: addDays(today, -40) } });
    expect(screen.getByRole('alert')).toHaveTextContent(
      /The start must be between/
    );
    expect(
      screen.getByRole('button', { name: 'Create challenge' })
    ).toBeDisabled();

    // Inside the limit, but the server still refuses (its today differs).
    fireEvent.change(start, { target: { value: today } });
    fireEvent.click(screen.getByRole('button', { name: 'Create challenge' }));
    expect(
      await screen.findByText(/can start at most 31 days ago/)
    ).toBeInTheDocument();
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

  it('says why Create is off, and keeps a typed number editable', async () => {
    renderAt('/challenges');
    fireEvent.click(
      await screen.findByRole('button', { name: 'New challenge' })
    );
    fireEvent.change(screen.getByLabelText('Most members'), {
      target: { value: '1' },
    });
    expect(
      screen.getByText('Most members must be between 2 and 200.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create challenge' })
    ).toBeDisabled();

    // A cleared rules field stays empty while typing, then takes the new value.
    fireEvent.click(screen.getByRole('button', { name: 'Days and times' }));
    const best = screen.getByLabelText('Best days a week');
    fireEvent.change(best, { target: { value: '' } });
    expect(best).toHaveValue(null);
    fireEvent.change(best, { target: { value: '3' } });
    fireEvent.blur(best);
    expect(best).toHaveValue(3);

    // A number the rules refuse is flagged, not shown as if it were kept.
    fireEvent.change(best, { target: { value: '9' } });
    expect(best).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByText('Not allowed here. It stays 3.')
    ).toBeInTheDocument();
    fireEvent.blur(best);
    expect(best).toHaveValue(3);
  });

  it('explains the rules scoring today, and a pending change from its first day, without the rule log', async () => {
    const later = { ...challengePreset('all_rounder').rules, dailyCap: 1 };
    api.getChallenge.mockResolvedValue(
      challenge({
        pending_rules: { rules: later, effective_from: '2026-11-16' },
      })
    );
    renderAt(`/challenges/${CHALLENGE_ID}`);
    fireEvent.mouseDown(
      await screen.findByRole('tab', { name: 'How points work' })
    );
    expect(await screen.findByText('From Nov 16, 2026:')).toBeInTheDocument();
    const how = screen.getAllByTestId('how-points-work');
    expect(how).toHaveLength(2);
    expect(how[0]).not.toHaveTextContent('daily cap');
    expect(how[1]).toHaveTextContent('held to the daily cap of 1.');
    expect(api.getChallengeRuleChanges).not.toHaveBeenCalled();
  });

  it('the host edits from the change still waiting, not the rules scoring today', async () => {
    const later = { ...challengePreset('all_rounder').rules, dailyCap: 1 };
    api.getChallenge.mockResolvedValue(
      challenge({
        pending_rules: { rules: later, effective_from: '2026-11-16' },
      })
    );
    renderAt(`/challenges/${CHALLENGE_ID}`);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Change the rules' })
    );
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Days and times' })
    );
    expect(
      within(dialog).getByRole('switch', { name: 'Cap what one day can add' })
    ).toBeChecked();
  });

  it('holds the example day to a daily cap', async () => {
    const capped = { ...challengePreset('all_rounder').rules, dailyCap: 1 };
    api.getChallenge.mockResolvedValue(challenge({ rules: capped }));
    renderAt(`/challenges/${CHALLENGE_ID}`);
    fireEvent.mouseDown(
      await screen.findByRole('tab', { name: 'How points work' })
    );
    expect(await screen.findByTestId('how-points-work')).toHaveTextContent(
      'and 8,000 steps add 8: 98 points, held to the daily cap of 1.'
    );
  });

  it('starts afresh when moving between cached challenges', async () => {
    const OTHER = '22222222-2222-4222-8222-222222222222';
    api.getChallenge.mockImplementation(async (id: string) =>
      id === OTHER ? challenge({ id: OTHER, name: 'Family cup' }) : challenge()
    );
    api.createChallengeInvite.mockResolvedValue({
      code: INVITE_CODE,
      expires_at: '2026-11-21T00:00:00.000Z',
    });
    const { Wrapper } = wrapper();
    render(
      <Wrapper>
        <MemoryRouter initialEntries={[`/challenges/${OTHER}`]}>
          <Link to={`/challenges/${CHALLENGE_ID}`}>to first</Link>
          <Link to={`/challenges/${OTHER}`}>to other</Link>
          <Routes>
            <Route path="/challenges/:challengeId" element={<Challenges />} />
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );
    // Both details cached, so the move below shows no loading state.
    expect(await screen.findByText(/Family cup/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'to first' }));
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Members' }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Make an invite code' })
    );
    expect(await screen.findByDisplayValue(INVITE_CODE)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'to other' }));
    expect(await screen.findByText(/Family cup/)).toBeInTheDocument();
    expect(screen.queryByDisplayValue(INVITE_CODE)).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Standings' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('keeps invite create and revoke from running together', async () => {
    api.getChallenge.mockResolvedValue(
      challenge({
        invite_active: true,
        invite_expires_at: '2026-11-21T00:00:00.000Z',
      })
    );
    let finishCreate: (v: { code: string; expires_at: string }) => void = () =>
      undefined;
    api.createChallengeInvite.mockReturnValue(
      new Promise((resolve) => {
        finishCreate = resolve;
      })
    );
    renderAt(`/challenges/${CHALLENGE_ID}`);
    fireEvent.mouseDown(await screen.findByRole('tab', { name: 'Members' }));
    const create = await screen.findByRole('button', {
      name: 'Make a new code',
    });
    const revoke = screen.getByRole('button', { name: 'Turn off the code' });
    fireEvent.click(create);
    await waitFor(() => expect(revoke).toBeDisabled());
    expect(create).toBeDisabled();
    finishCreate({ code: INVITE_CODE, expires_at: '2026-11-21T00:00:00.000Z' });
    await waitFor(() => expect(revoke).toBeEnabled());

    let finishRevoke: () => void = () => undefined;
    api.revokeChallengeInvite.mockReturnValue(
      new Promise<void>((resolve) => {
        finishRevoke = resolve;
      }) as never
    );
    fireEvent.click(revoke);
    await waitFor(() => expect(create).toBeDisabled());
    expect(revoke).toBeDisabled();
    finishRevoke();
    await waitFor(() => expect(create).toBeEnabled());
  });

  it("shows each of a member's periods in the units of the rules that scored it, without the rule log", async () => {
    // The oldest week was scored by steps; the server says so with its standings
    api.getChallengeStandings.mockImplementation(async (_id, day) =>
      day === '2026-10-19'
        ? standings({
            period_start: '2026-10-19',
            period_end: '2026-10-25',
            rules: {
              ...challengePreset('all_rounder').rules,
              metric: 'steps',
              points: null,
            },
          })
        : standings()
    );
    renderAt(`/challenges/${CHALLENGE_ID}`);
    const callsBefore = api.getChallengeRuleChanges.mock.calls.length;
    fireEvent.click(await screen.findByRole('button', { name: /Test B/ }));
    const list = await screen.findByTestId('member-periods');
    expect(await within(list).findByText(/121 steps/)).toBeInTheDocument();
    expect(within(list).getAllByText(/120\.5 pts/).length).toBeGreaterThan(0);
    expect(api.getChallengeRuleChanges.mock.calls.length).toBe(callsBefore);
  });

  it('says a period failed to load rather than that it has no score', async () => {
    renderAt(`/challenges/${CHALLENGE_ID}`);
    const member = await screen.findByRole('button', { name: /Test B/ });
    api.getChallengeStandings.mockImplementation(async (_id, day) => {
      if (day === '2026-10-19') throw new Error('down');
      return standings();
    });
    fireEvent.click(member);
    const list = await screen.findByTestId('member-periods');
    const failed = await within(list).findByRole('alert');
    expect(failed).toHaveTextContent('Could not load the standings.');
    expect(within(list).queryByText('No score')).not.toBeInTheDocument();
    api.getChallengeStandings.mockResolvedValue(standings());
    fireEvent.click(within(failed).getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(within(list).queryByRole('alert')).not.toBeInTheDocument()
    );
  });

  it('says the rule log failed to load, with a retry', async () => {
    api.getChallengeRuleChanges.mockRejectedValue(new Error('down'));
    renderAt(`/challenges/${CHALLENGE_ID}`);
    fireEvent.mouseDown(
      await screen.findByRole('tab', { name: 'Rule changes' })
    );
    expect(
      await screen.findByText('Could not load the rule changes.')
    ).toBeInTheDocument();
    expect(screen.queryByText('No rule changes.')).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('rule-change-log')).toBeInTheDocument();
  });

  it('resumes an invite link opened while signed out after sign-in', async () => {
    let signedIn = false;
    const Guard = () => {
      useInviteAcrossSignIn(signedIn, false);
      return signedIn ? <Outlet /> : <Navigate to="/login" />;
    };
    const Login = () => {
      const navigate = useNavigate();
      return (
        <button
          onClick={() => {
            signedIn = true;
            // Where Auth sends everyone after sign-in.
            navigate('/');
          }}
        >
          Sign in
        </button>
      );
    };
    sessionStorage.clear();
    const { Wrapper } = wrapper();
    render(
      <Wrapper>
        <MemoryRouter initialEntries={[`/challenges/join#${INVITE_CODE}`]}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Guard />}>
              <Route index element={<p>Diary</p>} />
              <Route path="challenges" element={<Challenges />} />
              <Route path="challenges/join" element={<ChallengeJoinLink />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </Wrapper>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByLabelText('Invite link or code')).toHaveValue(
      INVITE_CODE
    );
    // Used once: a later visit does not open it again.
    expect(sessionStorage.length).toBe(0);
  });
});

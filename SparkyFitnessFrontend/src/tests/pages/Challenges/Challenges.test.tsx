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
import { addDays, challengePreset, todayInZone } from '@workspace/shared';
import { HttpApiError } from '@/api/api';
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

  it('holds the example day to a daily cap', async () => {
    const capped = { ...challengePreset('all_rounder').rules, dailyCap: 1 };
    api.getChallenge.mockResolvedValue(challenge({ rules: capped }));
    api.getChallengeRuleChanges.mockResolvedValue([
      {
        id: 'c1',
        changed_by_display_name: 'Test A',
        effective_from: '2026-10-19',
        rules: capped,
        previous_rules: null,
        created_at: '2026-10-18T10:00:00.000Z',
      },
    ]);
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

  it("waits for the rule history before showing a member's totals", async () => {
    let finishLog: (v: never[]) => void = () => undefined;
    api.getChallengeRuleChanges.mockReturnValue(
      new Promise((resolve) => {
        finishLog = resolve;
      })
    );
    renderAt(`/challenges/${CHALLENGE_ID}`);
    fireEvent.click(await screen.findByRole('button', { name: /Test B/ }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(api.getChallengeStandings).toHaveBeenCalledWith(
        CHALLENGE_ID,
        '2026-10-19'
      )
    );
    // Standings are in, the rules that scored them are not: no totals yet.
    expect(within(dialog).queryByTestId('member-periods')).toBeNull();
    finishLog([]);
    expect(await within(dialog).findByTestId('member-periods')).toBeTruthy();
  });

  it('says the rule history failed in the member dialog, with a retry', async () => {
    api.getChallengeRuleChanges.mockRejectedValue(new Error('down'));
    renderAt(`/challenges/${CHALLENGE_ID}`);
    fireEvent.click(await screen.findByRole('button', { name: /Test B/ }));
    const dialog = await screen.findByRole('dialog');
    expect(
      await within(dialog).findByText('Could not load the rule changes.')
    ).toBeInTheDocument();
    expect(within(dialog).queryByTestId('member-periods')).toBeNull();
    api.getChallengeRuleChanges.mockResolvedValue([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Try again' }));
    expect(await within(dialog).findByTestId('member-periods')).toBeTruthy();
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

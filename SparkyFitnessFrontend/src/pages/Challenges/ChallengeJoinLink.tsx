import { Navigate, useLocation } from 'react-router-dom';
import { inviteCodeFrom } from './challengeLinks';

/**
 * `/challenges/join#<code>`, the invite link. Hands the code to the
 * Challenges page in route state and replaces the address, so the code is
 * not left in the address bar or in history.
 */
const ChallengeJoinLink = () => {
  const { hash } = useLocation();
  return (
    <Navigate
      to="/challenges"
      replace
      state={{ joinCode: inviteCodeFrom(hash) ?? '' }}
    />
  );
};

export default ChallengeJoinLink;

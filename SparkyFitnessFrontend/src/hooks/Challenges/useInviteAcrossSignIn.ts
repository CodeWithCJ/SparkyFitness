import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CHALLENGE_JOIN_PATH,
  rememberPendingInvite,
  takePendingInvite,
} from '@/pages/Challenges/challengeLinks';

/**
 * Carries an invite link across sign-in. Signed out on `/challenges/join#<code>`,
 * the code is kept in session storage before the redirect to `/login`; once
 * signed in, the join dialog opens with it, wherever sign-in lands.
 */
export const useInviteAcrossSignIn = (signedIn: boolean, loading: boolean) => {
  const { pathname, hash } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!signedIn) {
      if (pathname === CHALLENGE_JOIN_PATH) rememberPendingInvite(hash);
      return;
    }
    const code = takePendingInvite();
    // An invite link opened while signed in hands its own code over.
    if (code && pathname !== CHALLENGE_JOIN_PATH) {
      navigate('/challenges', { replace: true, state: { joinCode: code } });
    }
  }, [signedIn, loading, pathname, hash, navigate]);
};

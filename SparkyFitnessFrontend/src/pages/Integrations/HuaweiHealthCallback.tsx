import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  CheckCircle2,
  HeartPulse,
  LoaderCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCompleteHuaweiHealthAuthorizationMutation } from '@/hooks/Integrations/useHuaweiHealth';

type CallbackState =
  | 'processing'
  | 'success'
  | 'cancelled'
  | 'invalid'
  | 'failed';

function parseCallback(
  search: string
):
  | { state: Exclude<CallbackState, 'processing' | 'success'> }
  | { payload: { code: string; state: string } } {
  const params = new URLSearchParams(search);
  const providerError = params.get('error');
  if (providerError) {
    return {
      state: providerError === 'access_denied' ? 'cancelled' : 'failed',
    };
  }

  const code = params.get('code');
  const oauthState = params.get('state');
  if (!code || !oauthState || !/^[0-9a-f]{64}$/.test(oauthState)) {
    return { state: 'invalid' };
  }
  return { payload: { code, state: oauthState } };
}

const HuaweiHealthCallback = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { mutateAsync: completeAuthorization } =
    useCompleteHuaweiHealthAuthorizationMutation();
  const callback = useMemo(
    () => parseCallback(location.search),
    [location.search]
  );
  const [exchangeState, setExchangeState] =
    useState<CallbackState>('processing');
  const exchangeRef = useRef<{
    key: string;
    promise: Promise<{ connected: true }>;
  } | null>(null);
  const state = 'state' in callback ? callback.state : exchangeState;

  useEffect(() => {
    if (!location.search) return;
    window.history.replaceState(
      window.history.state,
      '',
      `${location.pathname}${location.hash}`
    );
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    let redirectTimer: ReturnType<typeof setTimeout> | undefined;
    let active = true;
    if (!('payload' in callback)) return;

    const exchangeKey = `${callback.payload.state}.${callback.payload.code}`;
    if (exchangeRef.current?.key !== exchangeKey) {
      exchangeRef.current = {
        key: exchangeKey,
        promise: completeAuthorization(callback.payload),
      };
    }

    exchangeRef.current.promise
      .then(() => {
        if (!active) return;
        setExchangeState('success');
        redirectTimer = setTimeout(
          () => navigate('/settings', { replace: true }),
          1800
        );
      })
      .catch(() => {
        if (active) setExchangeState('failed');
      });

    return () => {
      active = false;
      if (redirectTimer) clearTimeout(redirectTimer);
    };
  }, [callback, completeAuthorization, navigate]);

  const content = {
    processing: {
      icon: <LoaderCircle className="h-10 w-10 animate-spin text-red-500" />,
      title: t(
        'huaweiHealth.callback.processing',
        'Confirming authorization and saving the connection securely...'
      ),
      description: '',
    },
    success: {
      icon: <CheckCircle2 className="h-10 w-10 text-emerald-600" />,
      title: t(
        'huaweiHealth.callback.success',
        'Connected — everything is ready'
      ),
      description: t(
        'huaweiHealth.callback.successDescription',
        'Returning you to settings so you can start the first sync.'
      ),
    },
    cancelled: {
      icon: <AlertTriangle className="h-10 w-10 text-amber-600" />,
      title: t('huaweiHealth.callback.cancelled', 'Authorization cancelled'),
      description: t(
        'huaweiHealth.callback.cancelledDescription',
        'The account was not linked and no access tokens were stored.'
      ),
    },
    invalid: {
      icon: <AlertTriangle className="h-10 w-10 text-destructive" />,
      title: t(
        'huaweiHealth.callback.invalid',
        'The link request is invalid or expired'
      ),
      description: t(
        'huaweiHealth.callback.invalidDescription',
        'Return to settings and start again. No credentials were stored.'
      ),
    },
    failed: {
      icon: <AlertTriangle className="h-10 w-10 text-destructive" />,
      title: t(
        'huaweiHealth.callback.failed',
        'The connection could not be completed'
      ),
      description: t(
        'huaweiHealth.callback.failedDescription',
        'The connection was not saved. Return to settings and try again.'
      ),
    },
  }[state];

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg border-red-500/20 shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 rounded-2xl bg-red-500/10 p-3 text-red-600">
            <HeartPulse className="h-7 w-7" aria-hidden="true" />
          </div>
          <CardTitle>
            {t('huaweiHealth.callback.title', 'Connect')}{' '}
            <bdi dir="ltr">HUAWEI Health</bdi>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 text-center" aria-live="polite">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            {content.icon}
          </div>
          <div className="space-y-2">
            <h1 className="text-lg font-semibold">{content.title}</h1>
            {content.description && (
              <p className="text-sm text-muted-foreground">
                {content.description}
              </p>
            )}
          </div>
          {state !== 'processing' && state !== 'success' && (
            <Button onClick={() => navigate('/settings', { replace: true })}>
              {t('huaweiHealth.callback.backToSettings', 'Back to settings')}
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
};

export default HuaweiHealthCallback;

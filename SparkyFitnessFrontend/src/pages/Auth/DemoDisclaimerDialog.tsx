import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Sparkles,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  Lock,
  Scale,
  Loader2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface DemoDisclaimerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  loading: boolean;
}

export const DemoDisclaimerDialog: React.FC<DemoDisclaimerDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  loading,
}) => {
  const { t } = useTranslation();
  const [hasAgreed, setHasAgreed] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <Card className="w-full max-w-lg shadow-2xl border-primary/20 bg-card/95 backdrop-blur">
        <CardHeader className="space-y-1">
          <div className="flex items-center space-x-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">
              {t('auth.demoSandbox', 'Public Demo Sandbox')}
            </span>
          </div>
          <CardTitle className="text-xl font-bold">
            {t('auth.demoWelcomeTitle', 'Welcome to SparkyFitness Demo')}
          </CardTitle>
          <CardDescription>
            {t(
              'auth.demoWelcomeSubtitle',
              'Please review and acknowledge the demo terms before entering.'
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 text-sm text-muted-foreground max-h-[60vh] overflow-y-auto pr-2">
          <div className="flex items-start space-x-3 p-3 rounded-lg bg-muted/50 border border-border/50">
            <Scale className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">
                {t('auth.demoLicenseTitle', 'Non-Commercial License & Terms')}
              </p>
              <p className="text-xs">
                {t(
                  'auth.demoLicenseDesc',
                  'SparkyFitness is provided for non-commercial evaluation and personal use under its project license. Unauthorized commercial exploitation or redistribution is strictly prohibited.'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-3 rounded-lg bg-muted/50 border border-border/50">
            <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">
                {t(
                  'auth.demoTermsTitle',
                  'Acceptable Use & Anti-Misuse Policy'
                )}
              </p>
              <p className="text-xs">
                {t(
                  'auth.demoTermsDesc',
                  'This sandbox is strictly for software evaluation. Security probing, automated scraping/bots, DDoS, vulnerability exploitation, and malicious activity are strictly prohibited.'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-3 rounded-lg bg-muted/50 border border-border/50">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">
                {t('auth.demoPrivacyTitle', 'Public Sandbox Notice')}
              </p>
              <p className="text-xs">
                {t(
                  'auth.demoPrivacyDesc',
                  'This is a shared public demonstration instance. Do NOT enter real medical records, passwords, or confidential personal data.'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-3 rounded-lg bg-muted/50 border border-border/50">
            <RefreshCw className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">
                {t('auth.demoResetTitle', 'Daily Auto-Reset (00:00 UTC)')}
              </p>
              <p className="text-xs">
                {t(
                  'auth.demoResetDesc',
                  'All food diary entries, workouts, and measurements automatically reset every 24 hours to keep the sample dataset fresh.'
                )}
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3 p-3 rounded-lg bg-muted/50 border border-border/50">
            <Lock className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-foreground">
                {t('auth.demoLockedTitle', 'Protected Settings')}
              </p>
              <p className="text-xs">
                {t(
                  'auth.demoLockedDesc',
                  'Credential modifications, MFA / passkey setups, and external device OAuth integrations are disabled on the shared demo account for stability.'
                )}
              </p>
            </div>
          </div>

          <label className="flex items-center space-x-2.5 pt-2 cursor-pointer select-none">
            <input
              type="checkbox"
              id="demo-terms-checkbox"
              checked={hasAgreed}
              onChange={(e) => setHasAgreed(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <span className="text-xs font-medium text-foreground">
              {t(
                'auth.demoAgreeCheckbox',
                'I accept the License terms and agree not to misuse this evaluation sandbox.'
              )}
            </span>
          </label>
        </CardContent>

        <CardFooter className="flex justify-end space-x-3 pt-4 border-t border-border/40">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={loading}
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={!hasAgreed || loading}
            className="gap-2 font-medium"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('auth.enteringDemo', 'Entering Demo...')}
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {t('auth.agreeAndEnter', 'I Agree & Enter Demo')}
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

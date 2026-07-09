import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExternalLink } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCreateExternalProviderMutation } from '@/hooks/Settings/useExternalProviderSettings';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from 'react-i18next';

interface FoodSourcesStepProps {
  onContinue: () => void;
}

export const FoodSourcesStep = ({ onContinue }: FoodSourcesStepProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { mutateAsync: createExternalProvider, isPending } =
    useCreateExternalProviderMutation();

  const [usdaKey, setUsdaKey] = useState('');
  const [fatsecretAppId, setFatsecretAppId] = useState('');
  const [fatsecretAppKey, setFatsecretAppKey] = useState('');
  const hasProviderCredentials = Boolean(
    usdaKey.trim() || fatsecretAppId.trim() || fatsecretAppKey.trim()
  );
  // Track providers already persisted this session so a partial failure
  // (e.g. USDA saved, FatSecret rejected) doesn't re-POST the saved one on retry.
  const savedProviderTypesRef = useRef(new Set<string>());

  const handleContinue = async () => {
    const trimmedUsda = usdaKey.trim();
    const trimmedFsId = fatsecretAppId.trim();
    const trimmedFsKey = fatsecretAppKey.trim();

    if ((trimmedFsId && !trimmedFsKey) || (!trimmedFsId && trimmedFsKey)) {
      toast({
        title: t(
          'onboarding.foodSourcesFatSecretMissingTitle',
          'FatSecret details are incomplete'
        ),
        description: t(
          'onboarding.foodSourcesFatSecretMissingDescription',
          'Enter both the App ID and App Key, or leave both empty to skip.'
        ),
        variant: 'destructive',
      });
      return;
    }

    if (!trimmedUsda && !trimmedFsId && !trimmedFsKey) {
      onContinue();
      return;
    }

    if (!user) {
      toast({
        title: t('onboarding.foodSourcesSignedOutTitle', 'Sign in required'),
        description: t(
          'onboarding.foodSourcesSignedOutDescription',
          'Sign in again before saving a food provider.'
        ),
        variant: 'destructive',
      });
      return;
    }

    try {
      if (trimmedUsda && !savedProviderTypesRef.current.has('usda')) {
        await createExternalProvider({
          user_id: user.id,
          provider_name: 'USDA',
          provider_type: 'usda',
          app_id: null,
          app_key: trimmedUsda,
          is_active: true,
        });
        savedProviderTypesRef.current.add('usda');
      }

      if (
        trimmedFsId &&
        trimmedFsKey &&
        !savedProviderTypesRef.current.has('fatsecret')
      ) {
        await createExternalProvider({
          user_id: user.id,
          provider_name: 'FatSecret',
          provider_type: 'fatsecret',
          app_id: trimmedFsId,
          app_key: trimmedFsKey,
          is_active: true,
        });
        savedProviderTypesRef.current.add('fatsecret');
      }

      onContinue();
    } catch {
      // Error toast is surfaced by the mutation's meta handler.
    }
  };

  return (
    <>
      <h1 className="text-3xl font-bold text-foreground mb-2">
        {t('onboarding.foodSourcesTitle', 'Improve food search (optional)')}
      </h1>
      <p className="text-muted-foreground mb-8">
        {t(
          'onboarding.foodSourcesDescription',
          'SparkyFitness works without these providers. If you have API credentials, you can add them now or later in Settings.'
        )}
      </p>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Label
              htmlFor="onboarding-usda-key"
              className="text-base font-semibold"
            >
              USDA FoodData Central
            </Label>
            <a
              href="https://fdc.nal.usda.gov/api-key-signup.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-green-600 hover:text-green-700 inline-flex items-center gap-1"
            >
              {t('onboarding.foodSourcesGetUsdaKey', 'Get a free API key')}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <Input
            id="onboarding-usda-key"
            type="password"
            value={usdaKey}
            onChange={(e) => setUsdaKey(e.target.value)}
            placeholder={t(
              'onboarding.foodSourcesUsdaKeyPlaceholder',
              'USDA API key'
            )}
            autoComplete="off"
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-base font-semibold">FatSecret</span>
            <a
              href="https://platform.fatsecret.com/my-account/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-green-600 hover:text-green-700 inline-flex items-center gap-1"
            >
              {t(
                'onboarding.foodSourcesGetFatSecretCredentials',
                'Open provider dashboard'
              )}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <Label htmlFor="onboarding-fatsecret-app-id">
            {t('onboarding.foodSourcesFatSecretAppId', 'FatSecret App ID')}
          </Label>
          <Input
            id="onboarding-fatsecret-app-id"
            type="text"
            value={fatsecretAppId}
            onChange={(e) => setFatsecretAppId(e.target.value)}
            placeholder={t(
              'onboarding.foodSourcesFatSecretAppIdPlaceholder',
              'Enter the App ID'
            )}
            autoComplete="off"
          />
          <Label htmlFor="onboarding-fatsecret-app-key">
            {t('onboarding.foodSourcesFatSecretAppKey', 'FatSecret App Key')}
          </Label>
          <Input
            id="onboarding-fatsecret-app-key"
            type="password"
            value={fatsecretAppKey}
            onChange={(e) => setFatsecretAppKey(e.target.value)}
            placeholder={t(
              'onboarding.foodSourcesFatSecretAppKeyPlaceholder',
              'Enter the App Key'
            )}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            {t(
              'onboarding.foodSourcesFatSecretIpNote',
              'FatSecret requires your public IP in its developer dashboard. Changes may take up to 24 hours.'
            )}
          </p>
        </div>
      </div>

      <Button
        onClick={handleContinue}
        disabled={isPending}
        className="w-full mt-12 h-14 text-lg rounded-full"
      >
        {isPending
          ? t('common.saving', 'Saving…')
          : hasProviderCredentials
            ? t('onboarding.foodSourcesSaveContinue', 'Save and continue')
            : t('onboarding.foodSourcesSkip', 'Skip for now')}
      </Button>
    </>
  );
};

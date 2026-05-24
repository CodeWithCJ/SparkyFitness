import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExternalLink } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useCreateExternalProviderMutation } from '@/hooks/Settings/useExternalProviderSettings';
import { useToast } from '@/hooks/use-toast';

interface FoodSourcesStepProps {
  onContinue: () => void;
}

export const FoodSourcesStep = ({ onContinue }: FoodSourcesStepProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { mutateAsync: createExternalProvider, isPending } =
    useCreateExternalProviderMutation();

  const [usdaKey, setUsdaKey] = useState('');
  const [fatsecretAppId, setFatsecretAppId] = useState('');
  const [fatsecretAppKey, setFatsecretAppKey] = useState('');

  const handleContinue = async () => {
    const trimmedUsda = usdaKey.trim();
    const trimmedFsId = fatsecretAppId.trim();
    const trimmedFsKey = fatsecretAppKey.trim();

    if ((trimmedFsId && !trimmedFsKey) || (!trimmedFsId && trimmedFsKey)) {
      toast({
        title: 'Missing FatSecret field',
        description:
          'Enter both the FatSecret App ID and App Key, or leave both blank to skip.',
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
        title: 'Not signed in',
        description: 'Please sign in again to save food sources.',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (trimmedUsda) {
        await createExternalProvider({
          user_id: user.id,
          provider_name: 'USDA',
          provider_type: 'usda',
          app_id: null,
          app_key: trimmedUsda,
          is_active: true,
        });
      }

      if (trimmedFsId && trimmedFsKey) {
        await createExternalProvider({
          user_id: user.id,
          provider_name: 'FatSecret',
          provider_type: 'fatsecret',
          app_id: trimmedFsId,
          app_key: trimmedFsKey,
          is_active: true,
        });
      }

      onContinue();
    } catch {
      // Error toast is surfaced by the mutation's meta handler.
    }
  };

  return (
    <>
      <h1 className="text-3xl font-bold text-foreground mb-2">
        Connect food databases
      </h1>
      <p className="text-muted-foreground mb-8">
        Optional, but adding USDA and FatSecret to your searches gives
        dramatically better results than the default Open Food Facts. You can
        always add or change these later in Settings.
      </p>

      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
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
              Get a free API key
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <Input
            id="onboarding-usda-key"
            type="password"
            value={usdaKey}
            onChange={(e) => setUsdaKey(e.target.value)}
            placeholder="USDA API Key"
            autoComplete="off"
          />
        </div>

        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-semibold">FatSecret</Label>
            <a
              href="https://platform.fatsecret.com/my-account/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-green-600 hover:text-green-700 inline-flex items-center gap-1"
            >
              Get API credentials
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <Input
            id="onboarding-fatsecret-app-id"
            type="text"
            value={fatsecretAppId}
            onChange={(e) => setFatsecretAppId(e.target.value)}
            placeholder="FatSecret App ID"
            autoComplete="off"
          />
          <Input
            id="onboarding-fatsecret-app-key"
            type="password"
            value={fatsecretAppKey}
            onChange={(e) => setFatsecretAppKey(e.target.value)}
            placeholder="FatSecret App Key"
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            FatSecret also requires you to whitelist your public IP in its
            developer dashboard. This can take up to 24 hours to take effect.
          </p>
        </div>
      </div>

      <Button
        onClick={handleContinue}
        disabled={isPending}
        className="w-full mt-12 h-14 text-lg rounded-full"
      >
        {isPending ? 'Saving...' : 'Continue'}
      </Button>
    </>
  );
};

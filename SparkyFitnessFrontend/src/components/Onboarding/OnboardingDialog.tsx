import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import { toast } from '@/hooks/use-toast';
import { useCreatePresetMutation } from '@/hooks/Goals/useGoals';
import { ExpandedGoals } from '@/types/goals';

export interface OnboardingDialogProps {
  isSavePresetOpen: boolean;
  presetName: string;
  handleSubmit: () => Promise<void>;
  editedPlan: ExpandedGoals | null;
  setIsSavePresetOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setPresetName: React.Dispatch<React.SetStateAction<string>>;
}

export const OnboardingDialog = ({
  isSavePresetOpen,
  presetName,
  setIsSavePresetOpen,
  setPresetName,
  editedPlan,
  handleSubmit,
}: OnboardingDialogProps) => {
  const { t } = useTranslation();

  const { mutateAsync: createGoalPreset, isPending: isSavingPreset } =
    useCreatePresetMutation();
  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      toast({
        title: t('onboarding.personalPlanSaveDialogErrorTitle'),
        description: t('onboarding.personalPlanSaveDialogNameRequired'),
        variant: 'destructive',
      });
      return;
    }

    if (!editedPlan) return;

    try {
      // Create the preset
      await createGoalPreset({
        ...editedPlan,
        preset_name: presetName.trim(),
      });

      toast({
        title: t('onboarding.personalPlanSaveDialogSuccessTitle'),
        description: t('onboarding.personalPlanSaveDialogSuccessDescription'),
      });

      // After saving preset, proceed to submit the plan as the active goal (finish onboarding)
      await handleSubmit();
    } catch (error) {
      console.error('Error saving preset:', error);
      toast({
        title: t('onboarding.personalPlanSaveDialogErrorTitle'),
        description: t('onboarding.personalPlanSaveDialogErrorDescription'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={isSavePresetOpen} onOpenChange={setIsSavePresetOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('onboarding.personalPlanSaveDialogTitle')}
          </DialogTitle>
          <DialogDescription>
            {t('onboarding.personalPlanSaveDialogDescription')}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSavePreset();
          }}
        >
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="onboarding-plan-name">
                {t('onboarding.personalPlanSaveDialogName')}
              </Label>
              <Input
                id="onboarding-plan-name"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                placeholder={t('onboarding.personalPlanSaveDialogPlaceholder')}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsSavePresetOpen(false)}
            >
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              disabled={isSavingPreset}
              aria-busy={isSavingPreset}
            >
              {isSavingPreset
                ? t('common.saving')
                : t('onboarding.personalPlanSaveDialogConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

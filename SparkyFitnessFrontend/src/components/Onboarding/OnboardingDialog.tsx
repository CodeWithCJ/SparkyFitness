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
        title: t('common.error', 'Error'),
        description: t(
          'goals.presetNameRequired',
          'Please enter a name for your preset.'
        ),
        variant: 'destructive',
      });
      return;
    }

    if (!editedPlan) return;

    try {
      // Create the preset
      await createGoalPreset({
        ...editedPlan,
        preset_name: presetName,
      });

      toast({
        title: t('common.success', 'Success'),
        description: t(
          'goals.presetCreatedSuccess',
          'Goal preset created successfully!'
        ),
      });

      // After saving preset, proceed to submit the plan as the active goal (finish onboarding)
      handleSubmit();
    } catch (error) {
      console.error('Error saving preset:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('goals.errorSavingPreset', 'Failed to save preset.'),
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={isSavePresetOpen} onOpenChange={setIsSavePresetOpen}>
      <DialogContent className="bg-[#1c1c1e] text-white border-gray-800">
        <DialogHeader>
          <DialogTitle>
            {t('goals.saveAsPreset', 'Save as Goal Preset')}
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {t(
              'goals.savePresetDescription',
              'Give your goal preset a name. This will save your current configuration for future use and apply it as your plan starting today.'
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name" className="text-gray-300">
              {t('goals.presetName', 'Preset Name')}
            </Label>
            <Input
              id="name"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              className="bg-[#2c2c2e] border-gray-700 text-white"
              placeholder={t(
                'goals.presetNamePlaceholder',
                'e.g., Cutting Phase 1'
              )}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setIsSavePresetOpen(false)}
            className="text-gray-400 hover:text-white hover:bg-white/10"
          >
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            onClick={handleSavePreset}
            disabled={isSavingPreset}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSavingPreset
              ? t('common.saving', 'Saving...')
              : t('goals.saveAndStart', 'Save & Start Plan')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

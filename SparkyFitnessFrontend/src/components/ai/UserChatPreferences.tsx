import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Bot, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useActiveAIService,
  useUpdateUserAIPreferences,
} from '@/hooks/AI/useAIServiceSettings';
import { useUserAiConfigAllowed } from '@/hooks/AI/useUserAiConfigAllowed';
import { useState } from 'react';
import { UserPreferencesChat } from '@/types/settings';
import { usePreferences } from '@/contexts/PreferencesContext';

interface UserChatPreferencesProps {
  loading?: boolean;
  defaultPreferences: UserPreferencesChat;
}

export const UserChatPreferences = ({
  loading = false,
  defaultPreferences,
}: UserChatPreferencesProps) => {
  const { t } = useTranslation();
  const { mutateAsync: updatePreferences } = useUpdateUserAIPreferences();
  const [preferences, setPreferences] =
    useState<UserPreferencesChat>(defaultPreferences);

  // AI Assisted Unit Conversions is in the main user_preferences table, not
  // the chat-only preference set above. Bind it to the main PreferencesContext
  // and persist via saveAllPreferences so it round-trips through PUT
  // /api/user-preferences alongside other user prefs.
  const {
    aiAssistedConversions,
    setAiAssistedConversions,
    saveAllPreferences,
  } = usePreferences();

  // Gate the toggle row on AI being usable. The outer page already checks
  // useUserAiConfigAllowed, but we also need an active AI service for the
  // feature to do anything — if none, hide the row to avoid a misleading toggle.
  const { data: userAiConfigAllowed } = useUserAiConfigAllowed();
  const { data: activeAiService } = useActiveAIService(
    userAiConfigAllowed === true
  );
  const showAiAssistedConversionsRow =
    userAiConfigAllowed === true && !!activeAiService;

  const onSave = async () => {
    try {
      await updatePreferences(preferences);
      // Success toast is handled by the mutation meta
    } catch (error) {
      // Error toast is handled by the mutation meta
      console.error('Error updating preferences:', error);
    }
  };

  const handleAiAssistedConversionsToggle = async (enabled: boolean) => {
    setAiAssistedConversions(enabled);
    try {
      await saveAllPreferences({ aiAssistedConversions: enabled });
    } catch (err) {
      // Revert local state on failure; user retoggles to retry.
      setAiAssistedConversions(!enabled);
      console.error('Error saving AI Assisted Conversions preference:', err);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          {t('settings.aiService.userSettings.chatPreferences')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="auto_clear_history">
            {t('settings.aiService.userSettings.autoClearHistory')}
          </Label>
          <Select
            value={preferences.auto_clear_history}
            onValueChange={(value) =>
              setPreferences({
                ...preferences,
                auto_clear_history: value,
              })
            }
          >
            <SelectTrigger id="auto_clear_history">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="never">
                {t('settings.aiService.userSettings.neverClear')}
              </SelectItem>
              <SelectItem value="session">
                {t('settings.aiService.userSettings.clearEachSession')}
              </SelectItem>
              <SelectItem value="7days">
                {t('settings.aiService.userSettings.clearAfter7Days')}
              </SelectItem>
              <SelectItem value="all">
                {t('settings.aiService.userSettings.clearAllHistory')}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">
            {t('settings.aiService.userSettings.autoClearHistoryDescription')}
          </p>
        </div>

        <Button onClick={onSave} disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          {t('settings.aiService.userSettings.saveChatPreferences')}
        </Button>

        {showAiAssistedConversionsRow && (
          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div className="space-y-1">
              <Label
                htmlFor="ai_assisted_conversions"
                className="text-sm font-medium"
              >
                AI Assisted Unit Conversions
              </Label>
              <p className="text-xs text-muted-foreground">
                When ON, you can ask the AI to estimate cross-category food unit
                conversions (e.g. cup → g) inside the unit picker.
              </p>
            </div>
            <Switch
              id="ai_assisted_conversions"
              checked={aiAssistedConversions}
              onCheckedChange={handleAiAssistedConversionsToggle}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
};

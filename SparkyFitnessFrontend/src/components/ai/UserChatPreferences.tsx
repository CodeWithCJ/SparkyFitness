import { Card, CardContent } from '@/components/ui/card';
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
import { useChatbotVisibility } from '@/contexts/ChatbotVisibilityContext';

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

  // "AI Assisted Unit Conversions" toggle. Lives in user_preferences (not the
  // chat-only set above) so it's bound to PreferencesContext and saved via
  // saveAllPreferences. Renders above the chat-prefs controls in the same
  // card — the page's overall heading already provides the "AI settings"
  // context, no sub-title needed here. Hidden when AI is unusable (admin
  // disallow OR no active service) so non-AI users don't see a dead toggle.
  const {
    aiAssistedConversions,
    setAiAssistedConversions,
    saveAllPreferences,
  } = usePreferences();
  const { data: userAiConfigAllowed } = useUserAiConfigAllowed();
  const { data: activeAiService } = useActiveAIService(
    userAiConfigAllowed === true
  );
  const showAiAssistedConversionsRow =
    userAiConfigAllowed === true && !!activeAiService;

  // Pure-local advanced toggle for the in-chat token-usage displays. Persisted
  // to localStorage via the context, so it saves immediately without the chat
  // preferences Save button below.
  const { showTokenStats, setShowTokenStats } = useChatbotVisibility();

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
    // Optimistic update; revert on failure so the user can re-toggle.
    setAiAssistedConversions(enabled);
    try {
      await saveAllPreferences({ aiAssistedConversions: enabled });
    } catch (err) {
      setAiAssistedConversions(!enabled);
      console.error('Error saving AI Assisted Conversions preference:', err);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {showAiAssistedConversionsRow && (
          <div className="flex items-start justify-between gap-4 rounded-md border p-3">
            <div className="space-y-1">
              <Label
                htmlFor="ai_assisted_conversions"
                className="text-sm font-medium"
              >
                {t('settings.aiService.userSettings.aiAssistedConversions')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  'settings.aiService.userSettings.aiAssistedConversionsDescription'
                )}
              </p>
            </div>
            <Switch
              id="ai_assisted_conversions"
              checked={aiAssistedConversions}
              onCheckedChange={handleAiAssistedConversionsToggle}
            />
          </div>
        )}

        <div className="flex items-start justify-between gap-4 rounded-md border p-3">
          <div className="space-y-1">
            <Label htmlFor="show_token_stats" className="text-sm font-medium">
              {t('settings.aiService.userSettings.showTokenStats')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t('settings.aiService.userSettings.showTokenStatsDescription')}
            </p>
          </div>
          <Switch
            id="show_token_stats"
            checked={showTokenStats}
            onCheckedChange={setShowTokenStats}
          />
        </div>

        <h3 className="flex items-center gap-2 text-base font-semibold pt-2">
          <Bot className="h-5 w-5" />
          {t('settings.aiService.userSettings.chatPreferences')}
        </h3>

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
      </CardContent>
    </Card>
  );
};

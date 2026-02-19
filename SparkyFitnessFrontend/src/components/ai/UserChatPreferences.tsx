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
import { Bot, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { UserPreferences } from '@/services/aiServiceSettingsService';

interface UserChatPreferencesProps {
  preferences: UserPreferences;
  onPreferencesChange: (preferences: UserPreferences) => void;
  onSave: () => void;
  loading?: boolean;
}

export const UserChatPreferences = ({
  preferences,
  onPreferencesChange,
  onSave,
  loading = false,
}: UserChatPreferencesProps) => {
  const { t } = useTranslation();

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
              onPreferencesChange({
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

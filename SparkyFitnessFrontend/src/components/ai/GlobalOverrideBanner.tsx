import { Button } from '@/components/ui/button';
import { AIService } from '@/types/settings';
import { Globe, User, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface GlobalOverrideBannerProps {
  activeGlobalSetting: AIService | undefined;
  hasUserOverride: boolean;
  onOverride: () => void;
  onRevert: () => void;
  loading?: boolean;
  isUserConfigAllowed: boolean;
}

export const GlobalOverrideBanner = ({
  activeGlobalSetting,
  hasUserOverride,
  onOverride,
  onRevert,
  loading = false,
  isUserConfigAllowed,
}: GlobalOverrideBannerProps) => {
  const { t } = useTranslation();

  if (!isUserConfigAllowed) {
    return (
      <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
            {t('settings.aiService.userSettings.perUserDisabled')}
          </span>
        </div>
        <p className="text-xs text-amber-700 dark:text-amber-300 mt-2">
          {t('settings.aiService.userSettings.perUserDisabledDescription')}
        </p>
      </div>
    );
  }

  if (!activeGlobalSetting) {
    return null;
  }

  return (
    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
            {t('settings.aiService.userSettings.usingGlobalSetting')}{' '}
            {activeGlobalSetting.service_name}
          </span>
        </div>
        {!hasUserOverride && (
          <Button
            onClick={onOverride}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <User className="h-4 w-4 mr-2" />
            {t('settings.aiService.userSettings.overrideGlobalSettings')}
          </Button>
        )}
        {hasUserOverride && (
          <Button
            onClick={onRevert}
            variant="outline"
            size="sm"
            disabled={loading}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            {t('settings.aiService.userSettings.useGlobalSettings')}
          </Button>
        )}
      </div>
      <p className="text-xs text-blue-700 dark:text-blue-300 mt-2">
        {hasUserOverride
          ? t('settings.aiService.userSettings.overrideDescription')
          : t('settings.aiService.userSettings.globalDescription')}
      </p>
    </div>
  );
};

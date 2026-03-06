import type React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth';
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@/components/ui/accordion';
import { Shield, Loader2 } from 'lucide-react';
import { debug } from '../../utils/logging';
import {
  useBackupSettings,
  useUpdateBackupSettings,
  useTriggerManualBackup,
  useRestoreBackup,
} from '@/hooks/Admin/useBackups';
import { BackupSettingsForm } from './BackupSettingsForm';
import { usePreferences } from '@/contexts/PreferencesContext';

const BackupSettings: React.FC = () => {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const { loggingLevel } = usePreferences();
  const { data: settings, isLoading } = useBackupSettings();
  const { mutate: saveSettings, isPending: isSaving } =
    useUpdateBackupSettings();
  const { mutate: runManualBackup, isPending: isRunningBackup } =
    useTriggerManualBackup();
  const { mutate: restoreBackup, isPending: isRestoring } = useRestoreBackup();

  const handleRestore = (file: File) => {
    if (
      !window.confirm(
        t('admin.backupSettings.restoreConfirm', 'Confirm Restore?')
      )
    )
      return;

    const formData = new FormData();
    formData.append('backupFile', file);

    debug(loggingLevel, 'Restoring...');

    restoreBackup(formData, {
      onSuccess: async () => {
        await signOut();
      },
    });
  };

  return (
    <Accordion type="multiple" className="w-full">
      <AccordionItem value="backup-settings" className="border rounded-lg">
        <AccordionTrigger
          className="flex items-center gap-2 p-4 hover:no-underline"
          description={t(
            'admin.backupSettings.description',
            'Configure scheduled backups'
          )}
        >
          <Shield className="h-5 w-5" />
          {t('admin.backupSettings.title', 'Backup Settings')}
        </AccordionTrigger>
        <AccordionContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : settings ? (
            <BackupSettingsForm
              initialSettings={settings}
              onSave={saveSettings}
              onManualBackup={runManualBackup}
              onRestore={handleRestore}
              isSaving={isSaving}
              isRunningBackup={isRunningBackup}
              isRestoring={isRestoring}
              backupLocation={'/app/SparkyFitnessServer/backup'}
            />
          ) : (
            <div className="p-4 text-red-500">Failed to load settings.</div>
          )}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default BackupSettings;

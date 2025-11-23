import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../services/api'; // Assuming an API service exists
import { useAuth } from '../../hooks/useAuth'; // Import useAuth hook
import { usePreferences } from '../../contexts/PreferencesContext'; // Assuming a preferences context for admin settings
import { useToast } from '@/hooks/use-toast'; // Import the custom useToast hook
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion"; // Import Accordion components
import { Shield } from "lucide-react"; // Import an icon for the trigger

const BackupSettings: React.FC = () => {
  const { t } = useTranslation();
  const { toast } = useToast(); // Initialize the custom toast hook
  const { signOut } = useAuth(); // Use the signOut function from useAuth
  const [backupEnabled, setBackupEnabled] = useState<boolean>(false);
  const [backupDays, setBackupDays] = useState<string[]>([]);
  const [backupTime, setBackupTime] = useState<string>('02:00');
  const [retentionDays, setRetentionDays] = useState<number>(7);
  const [lastBackupStatus, setLastBackupStatus] = useState('');
  const [backupLocation, setBackupLocation] = useState('/app/SparkyFitnessServer/backup'); // Default from backend

  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // Fetch current backup settings and status from backend
  const fetchBackupSettings = async () => {
    try {
      const response = await api.get('/admin/backup/settings');
      const data = response || {}; // Ensure data is an object even if response is null/undefined
      setBackupEnabled(data.backupEnabled ?? false);
      setBackupDays(data.backupDays || []);
      
      // Convert UTC backupTime to local time for display
      if (data.backupTime) {
        const [hours, minutes] = data.backupTime.split(':').map(Number);
        const utcDate = new Date();
        utcDate.setUTCHours(hours, minutes, 0, 0);
        setBackupTime(utcDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }));
      } else {
        setBackupTime('02:00');
      }

      setRetentionDays(data.retentionDays ?? 7); // Use ?? for numbers
      if (data.lastBackupStatus && data.lastBackupTimestamp) {
        const date = new Date(data.lastBackupTimestamp);
        setLastBackupStatus(`${data.lastBackupStatus} on ${date.toLocaleString()}`);
      } else {
        setLastBackupStatus(data.lastBackupStatus || 'N/A');
      }
      setBackupLocation(data.backupLocation || '/app/SparkyFitnessServer/backup'); // Use fetched or default
    } catch (error) {
      toast({
        title: t('admin.backupSettings.error', 'Error'),
        description: t('admin.backupSettings.failedToFetchSettings', 'Failed to fetch backup settings.'),
        variant: 'destructive',
      });
      console.error('Error fetching backup settings:', error);
    }
  };

  useEffect(() => {
    fetchBackupSettings();
  }, [t]);

  const handleDayChange = (day: string) => {
    const updatedDays = backupDays.includes(day)
      ? backupDays.filter(d => d !== day)
      : [...backupDays, day];
    setBackupDays(updatedDays);
  };

  const handleSaveSettings = async () => {
    try {
      // Convert local backupTime to UTC for backend storage
      const [hours, minutes] = backupTime.split(':').map(Number);
      const localDate = new Date();
      localDate.setHours(hours, minutes, 0, 0);
      const utcTime = localDate.toISOString().substring(11, 16); // Get HH:MM in UTC

      await api.post('/admin/backup/settings', {
        body: {
          backupEnabled,
          backupDays,
          backupTime: utcTime,
          retentionDays,
        },
      });
      toast({
        title: t('success', 'Success'),
        description: t('admin.backupSettings.backupSettingsSaved', 'Backup settings saved successfully.'),
      });
    } catch (error) {
      toast({
        title: t('admin.backupSettings.error', 'Error'),
        description: t('admin.backupSettings.failedToSaveSettings', 'Failed to save backup settings.'),
        variant: 'destructive',
      });
      console.error('Error saving backup settings:', error);
    }
  };

  const handleManualBackup = async () => {
    try {
      const response = await api.post('/admin/backup/manual');
      console.log('API response for manual backup:', response); // Log the full response
      const message = response?.message || response?.data?.message || 'Backup completed successfully.';
      console.log('Backup success message:', message);
      toast({
        title: t('success', 'Success'),
        description: message,
      });
      // Re-fetch settings to get the most up-to-date status from the backend
      await fetchBackupSettings();
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || t('admin.backupSettings.backupFailed', 'Manual backup failed.');
      console.error('Backup error message:', errorMessage); // Added for debugging
      toast({
        title: t('admin.backupSettings.error', 'Error'),
        description: errorMessage,
        variant: 'destructive',
      });
      console.error('Error during manual backup:', error);
      setLastBackupStatus(`${t('failedOn', 'Failed on')} ${new Date().toLocaleString()}`); // Keep local update for immediate feedback on failure
    }
  };

  const handleRestoreBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0) {
      return;
    }

    const file = event.target.files[0];
    const formData = new FormData();
    formData.append('backupFile', file);

    if (!window.confirm(t('admin.backupSettings.restoreConfirm', 'WARNING: Restoring a backup will wipe all current data and replace it with the backup content. Are you absolutely sure you want to proceed?'))) {
      return;
    }

    try {
      console.log('Initiating backup restore...'); // Added for debugging
      toast({
        title: t('info', 'Info'),
        description: t('admin.backupSettings.restoringBackup', 'Restoring backup... This may take a while.'),
      });
      await api.post('/admin/backup/restore', {
        body: formData,
        isFormData: true,
      });
      console.log('Backup restore successful.'); // Added for debugging
      toast({
        title: t('success', 'Success'),
        description: t('admin.backupSettings.restoreSuccess', 'Backup restored successfully! Logging out...'),
      });
      await signOut(); // Log out the user after successful restore
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || t('admin.backupSettings.restoreFailed', 'Backup restore failed.');
      console.error('Backup restore error message:', errorMessage); // Added for debugging
      toast({
        title: t('admin.backupSettings.error', 'Error'),
        description: errorMessage,
        variant: 'destructive',
      });
      console.error('Error during backup restore:', error);
    } finally {
      event.target.value = ''; // Clear the file input
    }
  };

  return (
    <Accordion type="multiple" className="w-full">
      <AccordionItem value="backup-settings" className="border rounded-lg mb-4">
        <AccordionTrigger
          className="flex items-center gap-2 p-4 hover:no-underline"
          description={t('admin.backupSettings.description', 'Configure scheduled backups and restore options')}
        >
          <Shield className="h-5 w-5" />
          {t('admin.backupSettings.title', 'Backup Settings')}
        </AccordionTrigger>
        <AccordionContent className="p-4 pt-0 space-y-6">
          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              {t('admin.backupSettings.enableScheduledBackups', 'Enable Scheduled Backups:')}
            </label>
            <input
              type="checkbox"
              checked={backupEnabled}
              onChange={(e) => setBackupEnabled(e.target.checked)}
              className="form-checkbox h-5 w-5 text-blue-600"
            />
          </div>

          {backupEnabled && (
            <>
              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2">
                  {t('admin.backupSettings.backupDays', 'Backup Days:')}
                </label>
                <div className="flex flex-wrap gap-2">
                  {daysOfWeek.map(day => (
                    <label key={day} className="inline-flex items-center">
                      <input
                        type="checkbox"
                        checked={backupDays.includes(day)}
                        onChange={() => handleDayChange(day)}
                        className="form-checkbox h-4 w-4 text-blue-600"
                      />
                      <span className="ml-2 text-gray-700">{t(`common.${day.toLowerCase()}`, day)}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="backupTime">
                  {t('admin.backupSettings.backupTime', { timezone: new Date().toLocaleTimeString('en-us', { timeZoneName: 'short' }).split(' ')[2], defaultValue: `Backup Time (${new Date().toLocaleTimeString('en-us', { timeZoneName: 'short' }).split(' ')[2]}):` })}
                </label>
                <input
                  type="time"
                  id="backupTime"
                  value={backupTime}
                  onChange={(e) => setBackupTime(e.target.value)}
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                />
              </div>

              <div className="mb-4">
                <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="retentionDays">
                  {t('admin.backupSettings.retentionDays', 'Keep backups for (days):')}
                </label>
                <input
                  type="number"
                  id="retentionDays"
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(parseInt(e.target.value))}
                  min="1"
                  className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                />
              </div>
            </>
          )}

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              {t('admin.backupSettings.backupLocation', 'Backup Location:')}
            </label>
            <p className="text-gray-900">{backupLocation}</p>
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              {t('admin.backupSettings.lastBackupStatus', 'Last Backup Status:')}
            </label>
            <p className="text-gray-900">{lastBackupStatus || t('common.notApplicable', 'N/A')}</p>
          </div>

          <div className="flex gap-4 mb-6">
            <button
              onClick={handleSaveSettings}
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            >
              {t('admin.backupSettings.saveSettings', 'Save Settings')}
            </button>
            <button
              onClick={handleManualBackup}
              className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
            >
              {t('admin.backupSettings.runManualBackup', 'Run Manual Backup Now')}
            </button>
          </div>

          <div className="mb-4">
            <h3 className="text-xl font-bold mb-2">{t('admin.backupSettings.restoreBackup', 'Restore Backup')}</h3>
            <p className="text-orange-500 mb-2">
              <strong>{t('admin.backupSettings.restoreWarningImportant', 'Important Note:')}</strong> {t('admin.backupSettings.restoreWarningImportantText', 'This backup functionality is new and should be used with caution. While it creates a backup, it\'s highly recommended to create additional backups independently of this application. Always follow the 3-2-1 backup strategy (3 copies of your data, on 2 different media, with 1 copy offsite) to ensure data safety. The functionality of restore may not work properly in all scenarios, so do not rely solely on this in-app backup.')}
            </p>
            <p className="text-red-600 mb-2">
              {t('admin.backupSettings.restoreWarningCaution', 'WARNING:')} {t('admin.backupSettings.restoreWarningCautionText', 'Restoring a backup will wipe all current data and replace it with the backup content. Proceed with extreme caution. Restart the server manually after restoring.')}
            </p>
            <input
              type="file"
              accept=".tar.gz"
              onChange={handleRestoreBackup}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-full file:border-0
                file:text-sm file:font-semibold
                file:bg-violet-50 file:text-violet-700
                hover:file:bg-violet-100"
            />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default BackupSettings;
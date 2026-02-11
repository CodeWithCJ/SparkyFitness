import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Save, Play, Upload } from 'lucide-react';
import { BackupSettingsResponse } from '@/api/Admin/backup';

interface BackupSettingsFormProps {
  initialSettings: BackupSettingsResponse;
  onSave: (settings: any) => void;
  onManualBackup: () => void;
  onRestore: (file: File) => void;
  isSaving: boolean;
  isRunningBackup: boolean;
  isRestoring: boolean;
  backupLocation: string;
}

export const BackupSettingsForm: React.FC<BackupSettingsFormProps> = ({
  initialSettings,
  onSave,
  onManualBackup,
  onRestore,
  isSaving,
  isRunningBackup,
  isRestoring,
  backupLocation,
}) => {
  const { t } = useTranslation();

  const getLocalTimeString = (utcTimeStr?: string) => {
    if (!utcTimeStr) return '02:00';
    const [hours, minutes] = utcTimeStr.split(':').map(Number);
    const date = new Date();
    date.setUTCHours(hours, minutes, 0, 0);
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
  };

  const getStatusText = (status?: string, timestamp?: string) => {
    if (status && timestamp) {
      return `${status} on ${new Date(timestamp).toLocaleString()}`;
    }
    return status || 'N/A';
  };

  const [backupEnabled, setBackupEnabled] = useState(
    initialSettings.backupEnabled ?? false
  );
  const [backupDays, setBackupDays] = useState<string[]>(
    initialSettings.backupDays || []
  );
  const [backupTime, setBackupTime] = useState(
    getLocalTimeString(initialSettings.backupTime)
  );
  const [retentionDays, setRetentionDays] = useState(
    initialSettings.retentionDays ?? 7
  );

  const daysOfWeek = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
  ];

  const handleDayChange = (day: string) => {
    setBackupDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSubmit = () => {
    const [hours, minutes] = backupTime.split(':').map(Number);
    const localDate = new Date();
    localDate.setHours(hours, minutes, 0, 0);
    const utcTime = localDate.toISOString().substring(11, 16);

    onSave({
      backupEnabled,
      backupDays,
      backupTime: utcTime,
      retentionDays,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      onRestore(e.target.files[0]);
      e.target.value = '';
    }
  };

  return (
    <div className="p-4 pt-0 space-y-6">
      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-bold mb-2">
          {t(
            'admin.backupSettings.enableScheduledBackups',
            'Enable Scheduled Backups:'
          )}
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
              {daysOfWeek.map((day) => (
                <label key={day} className="inline-flex items-center">
                  <input
                    type="checkbox"
                    checked={backupDays.includes(day)}
                    onChange={() => handleDayChange(day)}
                    className="form-checkbox h-4 w-4 text-blue-600"
                  />
                  <span className="ml-2 text-gray-700">
                    {t(`common.${day.toLowerCase()}`, day)}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              {t('admin.backupSettings.backupTime', 'Backup Time:')}
            </label>
            <input
              type="time"
              value={backupTime}
              onChange={(e) => setBackupTime(e.target.value)}
              className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 text-sm font-bold mb-2">
              {t(
                'admin.backupSettings.retentionDays',
                'Keep backups for (days):'
              )}
            </label>
            <input
              type="number"
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
        <p className="text-gray-900 break-all">{backupLocation}</p>
      </div>

      <div className="mb-4">
        <label className="block text-gray-700 text-sm font-bold mb-2">
          {t('admin.backupSettings.lastBackupStatus', 'Last Backup Status:')}
        </label>
        <p className="text-gray-900">
          {getStatusText(
            initialSettings.lastBackupStatus,
            initialSettings.lastBackupTimestamp
          )}
        </p>
      </div>

      <div className="flex gap-4 mb-6 flex-wrap">
        <button
          onClick={handleSubmit}
          disabled={isSaving}
          className="bg-blue-500 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline flex items-center gap-2"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {t('admin.backupSettings.saveSettings', 'Save Settings')}
        </button>
        <button
          onClick={onManualBackup}
          disabled={isRunningBackup}
          className="bg-green-500 hover:bg-green-700 disabled:opacity-50 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline flex items-center gap-2"
        >
          {isRunningBackup ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {t('admin.backupSettings.runManualBackup', 'Run Manual Backup Now')}
        </button>
      </div>

      {/* Restore Section */}
      <div className="mb-4 border-t pt-6 mt-6">
        <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
          <Upload className="h-5 w-5" />
          {t('admin.backupSettings.restoreBackup', 'Restore Backup')}
        </h3>
        {/* ... Warntexte ... */}
        <p className="text-red-600 mb-4 text-sm font-semibold">
          {t(
            'admin.backupSettings.restoreWarningCaution',
            'WARNING: Restoring wipes data.'
          )}
        </p>

        <div className="relative">
          {isRestoring && (
            <div className="absolute inset-0 bg-white/50 z-10 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          )}
          <input
            type="file"
            accept=".tar.gz"
            disabled={isRestoring}
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-violet-50 file:text-violet-700 hover:file:bg-violet-100 disabled:opacity-50"
          />
        </div>
      </div>
    </div>
  );
};

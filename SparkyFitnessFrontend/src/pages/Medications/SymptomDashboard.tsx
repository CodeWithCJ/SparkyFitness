import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { addDays } from '@workspace/shared';
import {
  useSymptomEntries,
  useDeleteSymptomEntryMutation,
} from '@/hooks/useSymptoms';
import type { MedicationDetail, MedicationEntry } from '@/types/medications';
import SymptomLogForm from './SymptomLogForm';
import SymptomHistoryCalendar from './SymptomHistoryCalendar';
import SymptomHistoryList from './SymptomHistoryList';

interface SymptomDashboardProps {
  selectedDate: string;
  today: string;
  meds: MedicationDetail[];
  recentEntries: MedicationEntry[];
}

export default function SymptomDashboard({
  selectedDate,
  today,
  meds,
  recentEntries,
}: SymptomDashboardProps) {
  const [, setSearchParams] = useSearchParams();
  const thirtyDaysAgo = useMemo(
    () => addDays(selectedDate, -30),
    [selectedDate]
  );

  const { data: symptomLogs = [], isLoading: loadingSymptoms } =
    useSymptomEntries({
      fromDate: thirtyDaysAgo,
      toDate: selectedDate,
    });

  const deleteSymptomEntryMutation = useDeleteSymptomEntryMutation();

  const handleDeleteLog = (logId: string) => {
    deleteSymptomEntryMutation.mutate(logId);
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-[400px_1fr]">
        <div className="space-y-6">
          <SymptomLogForm
            selectedDate={selectedDate}
            today={today}
            meds={meds}
          />
        </div>
        <div className="space-y-6">
          <SymptomHistoryCalendar
            selectedDate={selectedDate}
            symptomLogs={symptomLogs}
            recentEntries={recentEntries}
            onDateChange={(d) => setSearchParams({ date: d })}
          />
          <SymptomHistoryList
            symptomLogs={symptomLogs}
            loadingSymptoms={loadingSymptoms}
            onDeleteLog={handleDeleteLog}
            isPending={deleteSymptomEntryMutation.isPending}
          />
        </div>
      </div>
    </div>
  );
}

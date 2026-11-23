import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useMedications } from '@/hooks/useMedications';
import { useWebFeatures } from '@/hooks/Settings/useWebFeatures';
import type { MedicationDetail } from '@/types/medications';
import SymptomsHub from './SymptomsHub';

interface SymptomsPanelProps {
  selectedDate: string;
  onDateChange: (day: string) => void;
}

const NO_MEDS: MedicationDetail[] = [];

/**
 * The symptom tracker for pages that do not already load medications (Check-in
 * and the standalone Symptoms page). Medications are only requested when the
 * viewer may read them, so a delegate with just the symptoms permission does not
 * hit a forbidden request, and while Medications is on (Settings > Features):
 * without them the form offers no medication to link, and an entry being
 * edited keeps the one it has.
 */
export default function SymptomsPanel({
  selectedDate,
  onDateChange,
}: SymptomsPanelProps) {
  const { hasPermission } = useActiveUser();
  const { isShown } = useWebFeatures();
  const showMeds =
    hasPermission('can_manage_medications') && isShown('medications');
  const { data: meds = NO_MEDS } = useMedications(
    { activeOnly: true },
    { enabled: showMeds }
  );
  return (
    <SymptomsHub
      selectedDate={selectedDate}
      onDateChange={onDateChange}
      meds={showMeds ? (meds as MedicationDetail[]) : NO_MEDS}
    />
  );
}

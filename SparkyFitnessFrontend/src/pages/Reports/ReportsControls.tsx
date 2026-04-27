import { DateRangePickerWithPresets } from '@/components/ui/DateRangeWithPresets';

interface ReportsControlsProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

const ReportsControls = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: ReportsControlsProps) => (
  <div className="flex justify-center">
    <DateRangePickerWithPresets
      startDate={startDate}
      endDate={endDate}
      onStartDateChange={onStartDateChange}
      onEndDateChange={onEndDateChange}
    />
  </div>
);

export default ReportsControls;

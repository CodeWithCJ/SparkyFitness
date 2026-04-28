import { useTranslation } from 'react-i18next';
import { DateRangePickerWithPresets } from '@/components/ui/DateRangeWithPresets';
import { Button } from '@/components/ui/button';
import {
  BarChart3,
  TrendingUp,
  Dumbbell,
  BedDouble,
  Activity,
  Table as TableIcon,
} from 'lucide-react';

interface ReportsControlsProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const ReportsControls = ({
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
  activeTab,
  onTabChange,
}: ReportsControlsProps) => {
  const { t } = useTranslation();

  const reportTypes = [
    {
      id: 'charts',
      label: t('reports.nutrientsTab', 'Nutrients'),
      icon: BarChart3,
    },
    {
      id: 'measurements',
      label: t('reports.measurementsTab', 'Measurements'),
      icon: Activity,
    },
    {
      id: 'fasting',
      label: t('reports.fasting.insightsTab', 'Fasting'),
      icon: TrendingUp,
    },
    {
      id: 'exercise-charts',
      label: t('reports.exerciseProgressTab', 'Exercise'),
      icon: Dumbbell,
    },
    {
      id: 'sleep-analytics',
      label: t('reports.sleepTab', 'Sleep'),
      icon: BedDouble,
    },
    {
      id: 'stress-analytics',
      label: t('reports.stressTab', 'Stress'),
      icon: Activity,
    },
    {
      id: 'table',
      label: t('reports.tableTab', 'Table'),
      icon: TableIcon,
    },
  ];

  return (
    <div className="w-full flex flex-col lg:flex-row items-center gap-4 lg:gap-6">
      {/* Navigation Pills */}
      <div className="flex flex-wrap items-center justify-center lg:justify-start gap-1 flex-1">
        {reportTypes.map((type) => {
          const Icon = type.icon;
          const isActive = activeTab === type.id;
          return (
            <Button
              key={type.id}
              variant={isActive ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => onTabChange(type.id)}
              className={`rounded-full px-4 h-9 gap-2 transition-all ${
                isActive
                  ? 'bg-slate-200/60 dark:bg-muted shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-xs font-semibold">{type.label}</span>
            </Button>
          );
        })}
      </div>

      {/* Vertical Divider (Desktop Only) */}
      <div className="hidden lg:block w-px h-6 bg-border" />

      {/* Secondary Filter: Date Picker */}
      <div className="shrink-0">
        <DateRangePickerWithPresets
          startDate={startDate}
          endDate={endDate}
          onStartDateChange={onStartDateChange}
          onEndDateChange={onEndDateChange}
        />
      </div>
    </div>
  );
};

export default ReportsControls;

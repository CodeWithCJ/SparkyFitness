import React from 'react';
import { useTranslation } from 'react-i18next';

export interface WorkoutZoneTier {
  name: string;
  pct: number;
  mins: number;
  color: string;
}

interface WorkoutZoneSummaryProps {
  zones: WorkoutZoneTier[];
}

const WorkoutZoneSummary: React.FC<WorkoutZoneSummaryProps> = ({ zones }) => {
  const { t } = useTranslation();

  return (
    <>
      {zones.length > 0 && (
        <div className="pt-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
              {t('heartRate.timeInEachZone', 'Time in each zone')}
            </h4>
          </div>
          <div className="space-y-2.5 pt-1">
            {zones.map((z) => (
              <div key={z.name} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-foreground/80">
                    {z.name}
                  </span>
                  <span className="text-muted-foreground">
                    {z.pct}% • {z.mins}m
                  </span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(2, z.pct)}%`,
                      backgroundColor: z.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default WorkoutZoneSummary;

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Droplet,
  ChevronLeft,
  ChevronRight,
  Star,
  Plus,
  Minus,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePreferences } from '@/contexts/PreferencesContext';
import { convertMlToSelectedUnit } from '@/utils/nutritionCalculations';
import { useWaterContainer } from '@/contexts/WaterContainerContext';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import {
  useWaterGoalQuery,
  useWaterIntakeQuery,
  useUpdateWaterIntakeMutation,
} from '@/hooks/Diary/useWaterIntake';

interface WaterIntakeProps {
  selectedDate: string;
}

const WaterIntake = ({ selectedDate }: WaterIntakeProps) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeUserId } = useActiveUser(); // Get activeUserId
  const { activeContainer, containers } = useWaterContainer(); // Use activeContainer and containers from context
  const { water_display_unit } = usePreferences();
  const userId = activeUserId || user?.id;
  const { data: waterGoalMl = 1920 } = useWaterGoalQuery(selectedDate, userId);
  const { data: waterMl = 0 } = useWaterIntakeQuery(selectedDate, userId);
  const { mutate: updateWaterIntake, isPending: loading } =
    useUpdateWaterIntakeMutation();

  // Local state for the selected container in the diary
  const [selectedContainerId, setSelectedContainerId] = useState<number | null>(
    () => activeContainer?.id ?? null
  );

  // Derived selected container
  const currentContainer =
    containers.find((c) => c.id === selectedContainerId) || activeContainer;

  const cycleContainer = (direction: 'next' | 'prev') => {
    if (containers.length <= 1) return;

    const currentIndex = containers.findIndex(
      (c) => c.id === currentContainer?.id
    );
    let nextIndex;

    if (direction === 'next') {
      nextIndex = (currentIndex + 1) % containers.length;
    } else {
      nextIndex = (currentIndex - 1 + containers.length) % containers.length;
    }

    const nextContainer = containers[nextIndex];
    if (nextContainer) {
      setSelectedContainerId(nextContainer.id);
    }
  };
  const saveWaterIntake = (
    changeDrinks: number,
    containerId: number | null
  ) => {
    if (!userId) {
      return;
    }
    updateWaterIntake({
      user_id: userId,
      entry_date: selectedDate,
      change_drinks: changeDrinks,
      container_id: containerId,
    });
  };

  const adjustWater = (changeDrinks: number) => {
    saveWaterIntake(changeDrinks, currentContainer?.id || null);
  };

  const getVolumeDisplay = () => {
    if (currentContainer) {
      const servings = Math.max(
        1,
        currentContainer.servings_per_container || 1
      );
      const volumePerDrink = currentContainer.volume / servings;
      const displayVolume = convertMlToSelectedUnit(
        volumePerDrink,
        currentContainer.unit
      ).toFixed(currentContainer.unit === 'ml' ? 0 : 2);

      return t('foodDiary.waterIntake.perDrink', {
        volume: displayVolume,
        unit: currentContainer.unit,
      });
    }

    const displayVolume = convertMlToSelectedUnit(
      250,
      water_display_unit
    ).toFixed(water_display_unit === 'ml' ? 0 : 2);
    return t('foodDiary.waterIntake.defaultPerDrink', {
      volume: displayVolume,
      unit: water_display_unit,
    });
  };

  if (!user) {
    return null;
  }

  const fillPercentage = Math.min((waterMl / waterGoalMl) * 100, 100);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center text-base dark:text-slate-300">
          <Droplet className="w-4 h-4 mr-2" />
          {t('foodDiary.waterIntake.title', 'Water Intake')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col justify-between p-3 dark:text-slate-300">
        {/* Water count display */}
        <div className="text-center mb-3">
          <div className="text-xl font-bold">
            {convertMlToSelectedUnit(
              waterMl,
              currentContainer?.unit || water_display_unit
            ).toFixed(currentContainer?.unit === 'ml' ? 0 : 2)}{' '}
            /{' '}
            {convertMlToSelectedUnit(
              waterGoalMl,
              currentContainer?.unit || water_display_unit
            ).toFixed(currentContainer?.unit === 'ml' ? 0 : 2)}
          </div>
          <div className="text-gray-500 text-xs">
            {currentContainer?.unit || water_display_unit}
          </div>
        </div>

        {/* Water Bottle Visualization - takes up most space */}
        <div className="flex-1 flex flex-col items-center justify-center mb-3">
          <div className="relative flex flex-col items-center">
            {/* Bottle Cap */}
            <div className="w-5 h-1.5 bg-blue-400 rounded-t-sm mb-0.5"></div>

            {/* Bottle Neck */}
            <div className="w-7 h-5 bg-gray-100 dark:bg-slate-200 border-2 border-blue-400 rounded-sm mb-0.5"></div>

            {/* Main Bottle Body */}
            <div className="relative w-16 h-32 border-3 dark:bg-slate-300 border-blue-400 rounded-xl bg-gray-50 overflow-hidden">
              {/* Water Fill */}
              <div
                className="absolute bottom-0 w-full bg-gradient-to-t from-blue-500 via-blue-400 to-blue-300 transition-all duration-700 ease-out rounded-b-xl"
                style={{ height: `${fillPercentage}%` }}
              >
                {/* Water Surface Ripple Effect */}
                {fillPercentage > 0 && (
                  <div className="absolute top-0 w-full h-0.5 bg-blue-200 opacity-60 animate-pulse"></div>
                )}
              </div>

              {/* Bottle Highlight */}
              <div className="absolute top-3 left-2 w-2.5 h-10 bg-white opacity-30 rounded-full"></div>

              {/* Water Level Lines */}
              <div className="absolute inset-0 flex flex-col justify-between p-0.5">
                {[...Array(4)].map((_, i) => (
                  <div
                    key={i}
                    className="w-full h-px bg-blue-200 opacity-40"
                  ></div>
                ))}
              </div>
            </div>

            {/* Progress Percentage */}
            <div className="text-xs text-gray-600 mt-1.5 font-medium">
              {Math.round(fillPercentage)}%
            </div>
          </div>
        </div>

        {/* Intuitive Water Controls: [ - ] VOLUME [ + ] */}
        <div className="flex items-center justify-center space-x-3">
          <Button
            variant="outline"
            onClick={() => adjustWater(-1)}
            disabled={waterMl === 0 || loading}
            size="icon"
            className="h-8 w-8 rounded-full"
          >
            <Minus className="h-4 w-4" />
          </Button>

          <div className="text-center min-w-[70px]">
            <div className="text-sm font-bold text-blue-600 dark:text-blue-400">
              {getVolumeDisplay()}
            </div>
          </div>

          <Button
            onClick={() => adjustWater(1)}
            disabled={loading}
            size="icon"
            className="h-8 w-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Container Toggle (Source) */}
        <div className="flex items-center justify-center mt-3 pt-2 border-t border-gray-100 dark:border-slate-800 space-x-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => cycleContainer('prev')}
            disabled={containers.length <= 1}
            className="h-6 w-6 text-gray-400 hover:text-gray-600"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center justify-center space-x-1 px-1">
            <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest truncate max-w-[110px]">
              {currentContainer?.name ||
                t('foodDiary.waterIntake.defaultContainer', 'Container')}
            </div>
            {currentContainer?.is_primary && (
              <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500" />
            )}
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => cycleContainer('next')}
            disabled={containers.length <= 1}
            className="h-6 w-6 text-gray-400 hover:text-gray-600"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default WaterIntake;

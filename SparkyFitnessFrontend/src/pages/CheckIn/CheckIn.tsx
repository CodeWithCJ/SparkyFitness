import { useAuth } from '@/hooks/useAuth';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import SleepEntrySection from './SleepEntrySection';
import DayNavigator from '@/components/DayNavigator';
import { CheckInForm } from './CheckInForm';
import { RecentActivity } from './RecentActivity';
import { CheckInTopRow } from './CheckInTopRow';
import { useCheckInLogic } from '@/hooks/CheckIn/useCheckInLogic';
import { useSearchParams } from 'react-router-dom';
import { CheckInPhotos } from './CheckInPhotos';
import { useCheckInPhotoDates } from '@/hooks/CheckIn/useCheckInPhotos';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import HealthDataImportCSV from './HealthDataImportCSV';

const CheckIn = () => {
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const { convertWeight, convertMeasurement } = usePreferences();

  const currentUserId = activeUserId || user?.id;

  const {
    bodyFatPercentage,
    customCategories,
    customNotes,
    customValues,
    handleCalculateBodyFat,
    handleDeleteMeasurementClick,
    handleSubmit,
    height,
    hips,
    loading,
    mood,
    moodNotes,
    moodTags,
    neck,
    placeholders,
    recentMeasurements,
    selectedDate,
    setBodyFatPercentage,
    setCustomNotes,
    setCustomValues,
    setHeight,
    setHips,
    setMood,
    setMoodNotes,
    setMoodTags,
    setNeck,
    setSelectedDate,
    setSteps,
    setUseMostRecentForCalculation,
    setWaist,
    setWeight,
    shouldConvertCustomMeasurement,
    steps,
    useMostRecentForCalculation,
    waist,
    weight,
  } = useCheckInLogic(currentUserId);

  const [, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const [importOpen, setImportOpen] = useState(false);
  const photoDates = useCheckInPhotoDates();

  return (
    <div className="container mx-auto space-y-6">
      <div className="flex items-center justify-between gap-2">
        <DayNavigator
          selectedDate={selectedDate}
          onDateChange={(dateString) => {
            setSelectedDate(dateString);
            setSearchParams({ date: dateString });
          }}
          markedDates={photoDates}
          markedDatesLabel={t(
            'checkIn.photos.calendarLegend',
            'Progress photos'
          )}
        />
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2">
              <Upload size={16} />
              {t('healthDataImport.importCSV', 'Import CSV')}
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] max-w-[1400px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {t('healthDataImport.title', 'Import Health Data')}
              </DialogTitle>
            </DialogHeader>
            <HealthDataImportCSV />
          </DialogContent>
        </Dialog>
      </div>

      <CheckInTopRow
        mood={mood}
        moodNotes={moodNotes}
        moodTags={moodTags}
        setMood={setMood}
        setMoodNotes={setMoodNotes}
        setMoodTags={setMoodTags}
      />

      <SleepEntrySection key={selectedDate} selectedDate={selectedDate} />

      <CheckInForm
        bodyFatPercentage={bodyFatPercentage}
        customCategories={customCategories}
        customNotes={customNotes}
        customValues={customValues}
        handleCalculateBodyFat={handleCalculateBodyFat}
        handleSubmit={handleSubmit}
        height={height}
        hips={hips}
        loading={loading}
        neck={neck}
        placeholders={placeholders}
        setBodyFatPercentage={setBodyFatPercentage}
        setCustomNotes={setCustomNotes}
        setCustomValues={setCustomValues}
        setHeight={setHeight}
        setHips={setHips}
        setNeck={setNeck}
        setSteps={setSteps}
        setUseMostRecentForCalculation={setUseMostRecentForCalculation}
        setWaist={setWaist}
        setWeight={setWeight}
        shouldConvertCustomMeasurement={shouldConvertCustomMeasurement}
        steps={steps}
        useMostRecentForCalculation={useMostRecentForCalculation}
        waist={waist}
        weight={weight}
      />

      <CheckInPhotos selectedDate={selectedDate} />

      <RecentActivity
        convertMeasurement={convertMeasurement}
        convertWeight={convertWeight}
        handleDeleteMeasurementClick={handleDeleteMeasurementClick}
        recentMeasurements={recentMeasurements}
        shouldConvertCustomMeasurement={shouldConvertCustomMeasurement}
      />
    </div>
  );
};

export default CheckIn;

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
import { EditFastDialog } from '../Fasting/EditFastDialog';
import { useUpdateFastMutation } from '@/hooks/Fasting/useFasting';
import { FastingLog } from '@/types/fasting';
import { CombinedMeasurement } from '@/types/checkin';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Upload, Timer, Activity, Moon, Camera } from 'lucide-react';
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
    handleSaveMood,
    isSavingMood,
  } = useCheckInLogic(currentUserId);

  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const [importOpen, setImportOpen] = useState(false);
  const photoDates = useCheckInPhotoDates();

  const [editingFast, setEditingFast] = useState<FastingLog | null>(null);
  const [isEditFastOpen, setIsEditFastOpen] = useState(false);
  const { mutateAsync: updateFast } = useUpdateFastMutation();

  const handleEditFastClick = (measurement: CombinedMeasurement) => {
    if (measurement.originalFast) {
      setEditingFast(measurement.originalFast);
      setIsEditFastOpen(true);
    }
  };

  const activeTab = searchParams.get('tab') || 'measurements';

  const handleTabChange = (value: string) => {
    setSearchParams((prev) => {
      prev.set('tab', value);
      return prev;
    });
  };

  return (
    <div className="space-y-6">
      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-2 border-b">
          {/* Tab Selector on the Left */}
          <div className="flex flex-wrap items-center justify-center lg:justify-start gap-1">
            {[
              {
                id: 'measurements',
                label: t('checkIn.tabs.measurements', 'Measurements'),
                icon: Activity,
              },
              {
                id: 'fasting',
                label: t('checkIn.tabs.fasting', 'Fasting & Mood'),
                icon: Timer,
              },
              {
                id: 'sleep',
                label: t('checkIn.tabs.sleep', 'Sleep'),
                icon: Moon,
              },
              {
                id: 'photos',
                label: t('checkIn.tabs.photos', 'Photos'),
                icon: Camera,
              },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <Button
                  key={tab.id}
                  variant={isActive ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => handleTabChange(tab.id)}
                  className={`rounded-full px-4 h-9 gap-2 transition-all ${
                    isActive
                      ? 'bg-slate-200/60 dark:bg-muted shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <Icon className="w-4.5 h-4.5" />
                  <span className="text-xs font-semibold">{tab.label}</span>
                </Button>
              );
            })}
          </div>

          {/* Date Filter & CSV Import on the Right */}
          <div className="flex flex-col sm:flex-row items-center gap-2 w-full lg:w-auto lg:justify-end">
            <DayNavigator
              selectedDate={selectedDate}
              onDateChange={(dateString) => {
                setSelectedDate(dateString);
                setSearchParams((prev) => {
                  prev.set('date', dateString);
                  return prev;
                });
              }}
              markedDates={photoDates}
              markedDatesLabel={t(
                'checkIn.photos.calendarLegend',
                'Progress photos'
              )}
              className="grid-cols-none flex mb-0 items-center gap-2"
            />

            <Dialog open={importOpen} onOpenChange={setImportOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="flex items-center gap-2 h-9"
                >
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
        </div>

        <TabsContent
          value="fasting"
          className="focus-visible:outline-none space-y-6"
        >
          <CheckInTopRow
            mood={mood}
            moodNotes={moodNotes}
            moodTags={moodTags}
            setMood={setMood}
            setMoodNotes={setMoodNotes}
            setMoodTags={setMoodTags}
            onSaveMood={handleSaveMood}
            isSavingMood={isSavingMood}
          />
          <RecentActivity
            convertMeasurement={convertMeasurement}
            convertWeight={convertWeight}
            handleDeleteMeasurementClick={handleDeleteMeasurementClick}
            recentMeasurements={recentMeasurements.filter(
              (m) => m.type === 'fasting'
            )}
            shouldConvertCustomMeasurement={shouldConvertCustomMeasurement}
            handleEditFastClick={handleEditFastClick}
            title={t('checkIn.recentFasts', 'Recent Fasts')}
            description={t(
              'checkIn.recentFastsDescription',
              'Your latest fasting logs and status.'
            )}
          />
        </TabsContent>

        <TabsContent
          value="measurements"
          className="focus-visible:outline-none space-y-6"
        >
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
          <RecentActivity
            convertMeasurement={convertMeasurement}
            convertWeight={convertWeight}
            handleDeleteMeasurementClick={handleDeleteMeasurementClick}
            recentMeasurements={recentMeasurements.filter(
              (m) => m.type === 'standard' || m.type === 'custom'
            )}
            shouldConvertCustomMeasurement={shouldConvertCustomMeasurement}
            title={t('checkIn.recentMeasurements', 'Recent Measurements')}
            description={t(
              'checkIn.recentMeasurementsDescription',
              'Your latest logged weight, body metrics, and custom categories.'
            )}
          />
        </TabsContent>

        <TabsContent value="sleep" className="focus-visible:outline-none">
          <SleepEntrySection key={selectedDate} selectedDate={selectedDate} />
        </TabsContent>

        <TabsContent value="photos" className="focus-visible:outline-none">
          <CheckInPhotos selectedDate={selectedDate} />
        </TabsContent>
      </Tabs>

      <EditFastDialog
        isOpen={isEditFastOpen}
        onClose={() => setIsEditFastOpen(false)}
        fast={editingFast}
        onSave={updateFast}
      />
    </div>
  );
};

export default CheckIn;

import { useAuth } from '@/hooks/useAuth';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import CheckInPreferences from './CheckInPreferences';
import { usePreferences } from '@/contexts/PreferencesContext';
import SleepEntrySection from './SleepEntrySection';
import { CheckInForm } from './CheckInForm';
import { RecentActivity } from './RecentActivity';
import { CheckInTopRow } from './CheckInTopRow';
import { useCheckInLogic } from '@/hooks/CheckIn/useCheckInLogic';

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
    neck,
    recentMeasurements,
    selectedDate,
    setBodyFatPercentage,
    setCustomNotes,
    setCustomValues,
    setHeight,
    setHips,
    setMood,
    setMoodNotes,
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

  return (
    <div className="container mx-auto p-6 space-y-6">
      <CheckInPreferences
        selectedDate={selectedDate}
        onDateChange={(dateString) => {
          setSelectedDate(dateString);
        }}
      />

      <CheckInTopRow
        mood={mood}
        moodNotes={moodNotes}
        setMood={setMood}
        setMoodNotes={setMoodNotes}
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
        recentMeasurements={recentMeasurements}
        shouldConvertCustomMeasurement={shouldConvertCustomMeasurement}
      />
    </div>
  );
};

export default CheckIn;

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { toast } from "@/hooks/use-toast";
import CheckInPreferences from "./CheckInPreferences";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import MoodMeter from "./MoodMeter"; // Import MoodMeter component
import { usePreferences } from "@/contexts/PreferencesContext";
import { Trash2 } from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { debug, info, warn, error } from '@/utils/logging'; // Import logging utility
import { format } from 'date-fns'; // Import format from date-fns
import {
  loadCustomCategories as loadCustomCategoriesService,
  fetchRecentCustomMeasurements,
  fetchRecentStandardMeasurements,
  deleteCustomMeasurement,
  updateCheckInMeasurementField,
  loadExistingCheckInMeasurements,
  loadExistingCustomMeasurements,
  getMostRecentMeasurement,
  saveCheckInMeasurements,
  saveCustomMeasurement,
  CustomCategory,
  CustomMeasurement,
  CheckInMeasurement,
  CombinedMeasurement,
} from '@/services/checkInService';
import { saveMoodEntry, getMoodEntryByDate } from '@/services/moodService'; // Import mood service
import { calculateBodyFatBmi, calculateBodyFatNavy } from '@/services/bodyCompositionService';
import { getUserPreferences } from '@/services/preferenceService';
import { userManagementService } from "@/services/userManagementService";
import { api } from '@/services/api'; // Import the API service
import SleepEntrySection from './SleepEntrySection'; // Import SleepEntrySection

const CheckIn = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const {
    weightUnit: defaultWeightUnit, // Default from preferences
    measurementUnit: defaultMeasurementUnit, // Default from preferences
    loadPreferences,
    formatDateInUserTimezone,
    parseDateInUserTimezone,
    loggingLevel,
    convertWeight,
    convertMeasurement,
  } = usePreferences();

  const [selectedDate, setSelectedDate] = useState(formatDateInUserTimezone(new Date(), 'yyyy-MM-dd'));
  const [weight, setWeight] = useState("");
  const [neck, setNeck] = useState("");
  const [waist, setWaist] = useState("");
  const [hips, setHips] = useState("");
  const [steps, setSteps] = useState("");
  const [height, setHeight] = useState("");
  const [bodyFatPercentage, setBodyFatPercentage] = useState("");
  const [mood, setMood] = useState<number | null>(50); // Initialize mood to 50
  const [moodNotes, setMoodNotes] = useState<string>(""); // New state for mood notes
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [customValues, setCustomValues] = useState<{[key: string]: string}>({});
  const [customNotes, setCustomNotes] = useState<{[key: string]: string}>({});
  const [useMostRecentForCalculation, setUseMostRecentForCalculation] = useState(false); // New state for checkbox
  const [loading, setLoading] = useState(false);
  const [recentMeasurements, setRecentMeasurements] = useState<CombinedMeasurement[]>([]);
 
  const currentUserId = activeUserId || user?.id;
  debug(loggingLevel, "Current user ID:", currentUserId);

  // Helper to determine if a custom measurement type should be converted
  const shouldConvertCustomMeasurement = (unit: string) => {
    const convertibleUnits = ['kg', 'lbs', 'cm', 'inches'];
    return convertibleUnits.includes(unit.toLowerCase());
  };

  useEffect(() => {
    if (currentUserId) {
      loadPreferences(); // Load user's default preferences
      loadCustomCategories();
      loadExistingData(); // Load initial data when user is available
      fetchAllRecentMeasurements(); // Fetch recent measurements initially
    }

    const handleRefresh = () => {
      info(loggingLevel, "CheckIn: Received measurementsRefresh event, triggering data reload.");
      loadExistingData();
      fetchAllRecentMeasurements();
    };

    window.addEventListener('measurementsRefresh', handleRefresh);

    return () => {
      window.removeEventListener('measurementsRefresh', handleRefresh);
      };
    }, [currentUserId, loadPreferences]);
  

  useEffect(() => {
    info(loggingLevel, `CheckIn: useEffect for selectedDate triggered. currentUserId: ${currentUserId}, customCategories.length: ${customCategories.length}, selectedDate: ${selectedDate}`);
    if (currentUserId) { // Removed customCategories.length > 0 condition
      loadExistingData();
      fetchAllRecentMeasurements();
    }
  }, [currentUserId, selectedDate, customCategories, convertWeight, convertMeasurement, defaultWeightUnit, defaultMeasurementUnit, formatDateInUserTimezone, parseDateInUserTimezone]);
  
    const loadCustomCategories = async () => {
    if (!currentUserId) {
      warn(loggingLevel, "CheckIn: loadCustomCategories called with no current user ID.");
      return;
    }

    try {
      const data = await loadCustomCategoriesService();
      info(loggingLevel, "Custom categories loaded successfully:", data);
      setCustomCategories(data || []);
    } catch (err) {
      error(loggingLevel, 'Error loading custom categories:', err);
    }
  };

  const fetchAllRecentMeasurements = async () => {
    if (!currentUserId) {
      warn(loggingLevel, "CheckIn: fetchAllRecentMeasurements called with no current user ID.");
      return;
    }

    try {
      info(loggingLevel, "CheckIn: Calling fetchRecentCustomMeasurements...");
      const custom = await fetchRecentCustomMeasurements();
      info(loggingLevel, "CheckIn: fetchRecentCustomMeasurements returned:", custom);

      // For standard measurements, fetch for a range (e.g., last 30 days)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 30); // Fetch last 30 days
      const formattedStartDate = format(startDate, 'yyyy-MM-dd');
      const formattedEndDate = format(endDate, 'yyyy-MM-dd');
      info(loggingLevel, `CheckIn: Calling fetchRecentStandardMeasurements for range ${formattedStartDate} to ${formattedEndDate}...`);
      const standard = await fetchRecentStandardMeasurements(formattedStartDate, formattedEndDate);
      info(loggingLevel, "CheckIn: fetchRecentStandardMeasurements returned:", standard);

      const combined: CombinedMeasurement[] = [];

      // Add custom measurements
      custom.forEach(m => {
        const customMeasurement: CombinedMeasurement = {
          id: m.id,
          entry_date: m.entry_date,
          entry_hour: m.entry_hour,
          entry_timestamp: m.entry_timestamp,
          value: m.value,
          type: 'custom',
          display_name: m.custom_categories.display_name || m.custom_categories.name,
          display_unit: m.custom_categories.measurement_type,
          custom_categories: m.custom_categories, // Keep original custom_categories for conversion logic
        };
        combined.push(customMeasurement);
        debug(loggingLevel, `CheckIn: Custom Measurement - Raw entry_date: ${m.entry_date}, entry_timestamp: ${m.entry_timestamp}, Formatted for display: ${formatDateInUserTimezone(m.entry_date, 'PPP')}`);
      });

      // Add standard measurements
      standard.forEach(s => {
        if (s.weight !== null) combined.push({ id: s.id, entry_date: s.entry_date, value: s.weight, type: 'standard', display_name: 'Weight', display_unit: defaultWeightUnit, entry_hour: null, entry_timestamp: s.updated_at });
        if (s.neck !== null) combined.push({ id: s.id, entry_date: s.entry_date, value: s.neck, type: 'standard', display_name: 'Neck', display_unit: defaultMeasurementUnit, entry_hour: null, entry_timestamp: s.updated_at });
        if (s.waist !== null) combined.push({ id: s.id, entry_date: s.entry_date, value: s.waist, type: 'standard', display_name: 'Waist', display_unit: defaultMeasurementUnit, entry_hour: null, entry_timestamp: s.updated_at });
        if (s.hips !== null) combined.push({ id: s.id, entry_date: s.entry_date, value: s.hips, type: 'standard', display_name: 'Hips', display_unit: defaultMeasurementUnit, entry_hour: null, entry_timestamp: s.updated_at });
        if (s.steps !== null) combined.push({ id: s.id, entry_date: s.entry_date, value: s.steps, type: 'standard', display_name: 'Steps', display_unit: 'steps', entry_hour: null, entry_timestamp: s.updated_at });
        if (s.height !== null) combined.push({ id: s.id, entry_date: s.entry_date, value: s.height, type: 'standard', display_name: 'Height', display_unit: defaultMeasurementUnit, entry_hour: null, entry_timestamp: s.updated_at });
        if (s.body_fat_percentage !== null) combined.push({ id: s.id, entry_date: s.entry_date, value: s.body_fat_percentage, type: 'standard', display_name: 'Body Fat %', display_unit: '%', entry_hour: null, entry_timestamp: s.updated_at });
      });

      // Sort by entry_timestamp (or entry_date if timestamp is null) in descending order
      combined.sort((a, b) => {
        const dateA = new Date(a.entry_timestamp || a.entry_date).getTime();
        const dateB = new Date(b.entry_timestamp || b.entry_date).getTime();
        return dateB - dateA;
      });

      // Take top 20
      setRecentMeasurements(combined.slice(0, 20));
      info(loggingLevel, "All recent measurements fetched successfully:", combined.slice(0, 20));
    } catch (err) {
      error(loggingLevel, 'Error fetching all recent measurements:', err);
      sonnerToast.error(t('checkIn.failedToLoadRecentMeasurements', 'Failed to load recent measurements'));
    }
  };

  const handleDeleteMeasurementClick = async (measurement: CombinedMeasurement) => {
    if (!currentUserId) {
      warn(loggingLevel, "CheckIn: handleDeleteMeasurementClick called with no current user ID.");
      return;
    }

    try {
      if (measurement.type === 'custom') {
        await deleteCustomMeasurement(measurement.id);
      } else if (measurement.type === 'standard') {
        // For standard measurements, we set the specific field to null
        // The 'id' of a standard measurement in the frontend is the ID of the check_in_measurements row
        // The 'display_name' is used to determine which field to nullify
        let fieldToNull: string;
        switch (measurement.display_name) {
          case 'Weight': fieldToNull = 'weight'; break;
          case 'Neck': fieldToNull = 'neck'; break;
          case 'Waist': fieldToNull = 'waist'; break;
          case 'Hips': fieldToNull = 'hips'; break;
          case 'Steps': fieldToNull = 'steps'; break;
          case 'Height': fieldToNull = 'height'; break;
          case 'Body Fat %': fieldToNull = 'body_fat_percentage'; break;
          default:
            warn(loggingLevel, `CheckIn: Unknown standard measurement type for deletion: ${measurement.display_name}`);
            return;
        }
        info(loggingLevel, `CheckIn: Updating check-in measurement field ${fieldToNull} to null for ID: ${measurement.id}`);
        await updateCheckInMeasurementField({
          id: measurement.id,
          field: fieldToNull,
          value: null,
          entry_date: measurement.entry_date,
        });
      }
      info(loggingLevel, 'CheckIn: Measurement deleted successfully:', measurement.id);
      sonnerToast.success(t('checkIn.measurementDeletedSuccessfully', 'Measurement deleted successfully'));
      fetchAllRecentMeasurements();
      loadExistingData(); // Reload today's values
    } catch (err) {
      error(loggingLevel, 'CheckIn: Error deleting measurement:', err);
      sonnerToast.error(t('checkIn.failedToDeleteMeasurement', 'Failed to delete measurement'));
    }
  };

  const loadExistingData = async () => {
    info(loggingLevel, `CheckIn: loadExistingData called for date: ${selectedDate}`);
    try {
      // Load check-in measurements
      info(loggingLevel, `CheckIn: Calling loadExistingCheckInMeasurements for date: ${selectedDate}`);
      const data = await loadExistingCheckInMeasurements(selectedDate);
      if (data) {
        info(loggingLevel, "CheckIn: Existing check-in data loaded:", data);
        // Set internal state in canonical units (kg, cm)
        // Values are loaded in canonical units, then converted for display
        const convertedWeight = data.weight !== undefined && data.weight !== null ? convertWeight(data.weight, 'kg', defaultWeightUnit) : NaN;
        setWeight(typeof convertedWeight === 'number' && !isNaN(convertedWeight) ? convertedWeight.toFixed(1) : "");

        const convertedNeck = data.neck !== undefined && data.neck !== null ? convertMeasurement(data.neck, 'cm', defaultMeasurementUnit) : NaN;
        setNeck(typeof convertedNeck === 'number' && !isNaN(convertedNeck) ? convertedNeck.toFixed(1) : "");

        const convertedWaist = data.waist !== undefined && data.waist !== null ? convertMeasurement(data.waist, 'cm', defaultMeasurementUnit) : NaN;
        setWaist(typeof convertedWaist === 'number' && !isNaN(convertedWaist) ? convertedWaist.toFixed(1) : "");

        const convertedHips = data.hips !== undefined && data.hips !== null ? convertMeasurement(data.hips, 'cm', defaultMeasurementUnit) : NaN;
        setHips(typeof convertedHips === 'number' && !isNaN(convertedHips) ? convertedHips.toFixed(1) : "");
        
        const convertedHeight = data.height !== undefined && data.height !== null ? convertMeasurement(data.height, 'cm', defaultMeasurementUnit) : NaN;
        setHeight(typeof convertedHeight === 'number' && !isNaN(convertedHeight) ? convertedHeight.toFixed(1) : "");

        setBodyFatPercentage(data.body_fat_percentage?.toString() || "");
        setSteps(data.steps?.toString() || "");
      } else {
        info(loggingLevel, `CheckIn: No existing check-in data for date ${selectedDate}, clearing form.`);
        setWeight("");
        setNeck("");
        setWaist("");
        setHips("");
        setSteps("");
        setHeight("");
        setBodyFatPercentage("");
      }

      // Load mood entry for the selected date
      info(loggingLevel, "Fetching mood entry for selectedDate:", selectedDate, "and currentUserId:", currentUserId);
      const moodEntry = await getMoodEntryByDate(selectedDate);
      debug(loggingLevel, "CheckIn: Mood entry from getMoodEntryByDate:", moodEntry);
      if (moodEntry) {
        info(loggingLevel, "Existing mood entry loaded:", moodEntry);
        setMood(moodEntry.mood_value);
        setMoodNotes(moodEntry.notes || "");
      } else {
        info(loggingLevel, `CheckIn: No existing mood entry for date ${selectedDate}, setting to default.`);
        setMood(50); // Default mood value
        setMoodNotes(""); // Clear mood notes
      }

      info(loggingLevel, `CheckIn: Calling loadExistingCustomMeasurements for date: ${selectedDate}`);
      const customData = await loadExistingCustomMeasurements(selectedDate);
      info(loggingLevel, "CheckIn: Custom measurements loaded for date:", { selectedDate, customData });
      if (customData && customData.length > 0) {
        const newCustomValues: { [key: string]: string } = {};
        const newCustomNotes: { [key: string]: string } = {};
        customData.forEach((measurement) => {
          const category = customCategories.find(c => c.id === measurement.category_id);
          if (category) {
            // Only pre-fill input fields for 'Daily' or 'Hourly' frequencies
            // For 'Unlimited', the input field should remain empty for new entries
            if (category.frequency !== 'Unlimited') {
              const isConvertible = shouldConvertCustomMeasurement(category.measurement_type);
              if (category.data_type === 'numeric') {
                newCustomValues[measurement.category_id] = isConvertible
                  ? (() => {
                      const converted = convertMeasurement(measurement.value, 'cm', defaultMeasurementUnit);
                      return typeof converted === 'number' && !isNaN(converted) ? converted.toFixed(1) : "";
                    })()
                  : (measurement.value !== null && measurement.value !== undefined ? measurement.value.toString() : '');
              } else {
                newCustomValues[measurement.category_id] = measurement.value || '';
              }
              newCustomNotes[measurement.category_id] = measurement.notes || '';
            }
          }
        });
        setCustomValues(newCustomValues);
        setCustomNotes(newCustomNotes);
      } else {
        info(loggingLevel, `CheckIn: No existing custom measurements for date ${selectedDate}, clearing form.`);
        setCustomValues({});
        setCustomNotes({});
      }
    } catch (err) {
      error(loggingLevel, 'CheckIn: Error loading existing data:', err);
    }
  };


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Always attempt to save the mood entry.
    // The mood state is initialized to 50, so it will always have a value.
    try {
      const moodToSend = mood ?? 50;
      info(loggingLevel, "Attempting to save mood entry with moodToSend:", moodToSend, "and moodNotes:", moodNotes, "and selectedDate:", selectedDate);
      await saveMoodEntry(moodToSend, moodNotes, selectedDate);
      info(loggingLevel, "Mood entry saved successfully.");
    } catch (err) {
      error(loggingLevel, 'Error saving mood entry:', err);
      toast({
        title: t('common.error', 'Error'),
        description: t('checkIn.failedToSaveMoodEntry', 'Failed to save mood entry'),
        variant: "destructive",
      });
    }

    if (!currentUserId) {
      warn(loggingLevel, "CheckIn: Submit called with no current user ID.");
      toast({
        title: t('common.error', 'Error'),
        description: t('checkIn.mustBeLoggedInToSave', 'You must be logged in to save check-in data'),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Save standard check-in measurements
      const measurementData: any = {
        entry_date: selectedDate, // Use selectedDate directly
      };

      // Convert values to canonical units (kg, cm) before saving
      if (weight) measurementData.weight = convertWeight(parseFloat(weight), defaultWeightUnit, 'kg');
      if (neck) measurementData.neck = convertMeasurement(parseFloat(neck), defaultMeasurementUnit, 'cm');
      if (waist) measurementData.waist = convertMeasurement(parseFloat(waist), defaultMeasurementUnit, 'cm');
      if (hips) measurementData.hips = convertMeasurement(parseFloat(hips), defaultMeasurementUnit, 'cm');
      if (steps) measurementData.steps = parseInt(steps);
      if (height) measurementData.height = convertMeasurement(parseFloat(height), defaultMeasurementUnit, 'cm');
      if (bodyFatPercentage) measurementData.body_fat_percentage = parseFloat(bodyFatPercentage);

      info(loggingLevel, "CheckIn: Saving standard check-in measurements:", measurementData);
      await saveCheckInMeasurements(measurementData);
      info(loggingLevel, "CheckIn: Standard check-in data saved successfully.");

      for (const [categoryId, inputValue] of Object.entries(customValues)) {
        const category = customCategories.find(c => c.id === categoryId);
        if (!category) {
          warn(loggingLevel, `CheckIn: Custom category not found for ID: ${categoryId}`);
          continue;
        }

        // Only save if there's an actual input value (numeric or text)
        if (!inputValue && !customNotes[categoryId]) {
          continue;
        }

        const isConvertible = shouldConvertCustomMeasurement(category.measurement_type);
        const currentTime = new Date();
        let entryHour: number | null = null;
        let entryTimestamp: string;

        if (category.frequency === 'Hourly') {
          entryHour = currentTime.getHours();
          const selectedDateTime = new Date();
          selectedDateTime.setHours(currentTime.getHours(), 0, 0, 0);
          entryTimestamp = selectedDateTime.toISOString();
        } else {
          entryTimestamp = currentTime.toISOString();
        }

        const customMeasurementData: any = {
          category_id: categoryId,
          notes: customNotes[categoryId] || '',
          entry_date: selectedDate,
          entry_hour: entryHour,
          entry_timestamp: entryTimestamp,
        };

        if (category.data_type === 'numeric') {
          const numericValue = parseFloat(inputValue);
          if (!isNaN(numericValue)) {
            customMeasurementData.value = isConvertible
              ? convertMeasurement(numericValue, defaultMeasurementUnit, 'cm')
              : numericValue;
          } else {
            // If numeric category and input is not a valid number, set value to null
            customMeasurementData.value = null;
          }
        } else {
          // For text categories, store the input value directly in 'value'
          customMeasurementData.value = inputValue;
        }

        info(loggingLevel, `CheckIn: Saving custom measurement for category ${category.name}:`, customMeasurementData);
        await saveCustomMeasurement(customMeasurementData);
        info(loggingLevel, `CheckIn: Custom measurement for category ${category.name} saved successfully.`);
      }

      info(loggingLevel, "CheckIn: Check-in data saved successfully!");
      toast({
        title: t('common.success', 'Success'),
        description: t('checkIn.checkInSavedSuccessfully', 'Check-in data saved successfully!'),
      });

      // Refresh recent measurements after saving
      fetchAllRecentMeasurements();
    } catch (err) {
      error(loggingLevel, 'CheckIn: Error saving check-in data:', err);
      toast({
        title: t('common.error', 'Error'),
        description: t('checkIn.failedToSaveCheckIn', 'Failed to save check-in data'),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCalculateBodyFat = async () => {
    if (!currentUserId) return;
    try {
      const prefs = await getUserPreferences(loggingLevel);
      const userProfile = await userManagementService.getUserProfile(currentUserId);

      if (!userProfile) {
        error(loggingLevel, "CheckIn: Error calculating body fat: userProfile is null or undefined.");
        toast({ title: t('common.error', 'Error'), description: t('checkIn.couldNotLoadUserProfile', 'Could not load user profile for calculation.') });
        return;
      }
      if (!prefs) {
        error(loggingLevel, "CheckIn: Error calculating body fat: preferences are null or undefined.");
        toast({ title: t('common.error', 'Error'), description: t('checkIn.couldNotLoadUserPreferences', 'Could not load user preferences for calculation.') });
        return;
      }

      const age = userProfile.date_of_birth ? new Date().getFullYear() - new Date(userProfile.date_of_birth).getFullYear() : 0;
      const gender = userProfile.gender;

      let weightKg, heightCm, waistCm, neckCm, hipsCm;

      if (useMostRecentForCalculation) {
        const recentWeight = await getMostRecentMeasurement('weight');
        const recentHeight = await getMostRecentMeasurement('height');
        const recentWaist = await getMostRecentMeasurement('waist');
        const recentNeck = await getMostRecentMeasurement('neck');
        const recentHips = await getMostRecentMeasurement('hips');

        weightKg = recentWeight?.weight ?? convertWeight(parseFloat(weight), defaultWeightUnit, 'kg');
        heightCm = recentHeight?.height ?? convertMeasurement(parseFloat(height), defaultMeasurementUnit, 'cm');
        waistCm = recentWaist?.waist ?? convertMeasurement(parseFloat(waist), defaultMeasurementUnit, 'cm');
        neckCm = recentNeck?.neck ?? convertMeasurement(parseFloat(neck), defaultMeasurementUnit, 'cm');
        hipsCm = recentHips?.hips ?? convertMeasurement(parseFloat(hips), defaultMeasurementUnit, 'cm');
      } else {
        weightKg = convertWeight(parseFloat(weight), defaultWeightUnit, 'kg');
        heightCm = convertMeasurement(parseFloat(height), defaultMeasurementUnit, 'cm');
        waistCm = convertMeasurement(parseFloat(waist), defaultMeasurementUnit, 'cm');
        neckCm = convertMeasurement(parseFloat(neck), defaultMeasurementUnit, 'cm');
        hipsCm = convertMeasurement(parseFloat(hips), defaultMeasurementUnit, 'cm');
      }

      debug(loggingLevel, "Body Fat Calculation Inputs:", {
        age,
        gender,
        weightKg,
        heightCm,
        waistCm,
        neckCm,
        hipsCm,
        bodyFatAlgorithm: prefs.body_fat_algorithm,
      });

      let bfp = 0;
      let errorMessage = "";
 
       if (prefs.body_fat_algorithm === 'BMI Method') {
         if (isNaN(weightKg) || isNaN(heightCm) || age === 0 || !gender) {
           errorMessage = t('checkIn.bmiMethodRequiredFields', "Weight, height, age, and gender are required for BMI Method.");
         } else {
           bfp = calculateBodyFatBmi(weightKg, heightCm, age, gender);
         }
       } else { // Default to U.S. Navy
         if (!gender || isNaN(heightCm) || isNaN(waistCm) || isNaN(neckCm) || (gender === 'female' && isNaN(hipsCm))) {
           errorMessage = t('checkIn.usNavyMethodRequiredFields', "Gender, height, waist, neck, and (if female) hips measurements are required for U.S. Navy Method.");
         } else {
           bfp = calculateBodyFatNavy(gender, heightCm, waistCm, neckCm, hipsCm);
         }
       }
 
       if (errorMessage) {
         error(loggingLevel, `CheckIn: Error calculating body fat: ${errorMessage}`);
         toast({ title: t('common.error', 'Error'), description: `${t('checkIn.failedToCalculateBodyFat', 'Failed to calculate body fat:')} ${errorMessage}`, variant: "destructive" });
       } else {
         setBodyFatPercentage(bfp.toFixed(2));
         toast({ title: t('common.success', 'Success'), description: t('checkIn.bodyFatCalculated', 'Body fat percentage calculated.') });
       }
     } catch (err: any) {
       error(loggingLevel, 'CheckIn: Error calculating body fat:', err);
       toast({ title: t('common.error', 'Error'), description: `${t('checkIn.failedToCalculateBodyFat', 'Failed to calculate body fat:')} ${err.message || t('checkIn.anUnknownErrorOccurred', "An unknown error occurred.")}`, variant: "destructive" });
     }
   };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Preferences Section */}
      <CheckInPreferences
        selectedDate={selectedDate}
        onDateChange={(dateString) => {
          setSelectedDate(dateString);
          // When date changes, reload existing data for the new date
          // This will be triggered by the useEffect hook
        }}
      />

      {/* Mood Meter Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('checkIn.howAreYouFeelingToday', 'How are you feeling today?')}</CardTitle>
        </CardHeader>
        <CardContent>
          <MoodMeter
            onMoodChange={(newMood, newNotes) => {
              setMood(newMood);
              setMoodNotes(newNotes);
            }}
            initialMood={mood}
            initialNotes={moodNotes}
          />
          <div className="mt-4">
            <Label htmlFor="mood-notes">{t('checkIn.notesOptional', 'Notes (optional)')}</Label>
            <Input
              id="mood-notes"
              type="text"
              value={moodNotes}
              onChange={(e) => setMoodNotes(e.target.value)}
              placeholder={t('checkIn.anyThoughtsOrFeelings', "Any thoughts or feelings you'd like to add?")}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sleep Entry Section */}
      <SleepEntrySection selectedDate={selectedDate} />

      {/* Check-In Form */}
      <Card>
        <CardHeader>
          <CardTitle>{t('checkIn.dailyCheckIn', 'Daily Check-In')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="weight">{t('checkIn.weight', 'Weight')} ({defaultWeightUnit})</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.1"
                  value={weight}
                  onChange={(e) => {
                    setWeight(e.target.value);
                  }}
                  placeholder={`${t('checkIn.enterWeight', 'Enter weight in')} ${defaultWeightUnit}`}
                />
              </div>

              <div>
                <Label htmlFor="steps">{t('checkIn.steps', 'Steps')}</Label>
                <Input
                  id="steps"
                  type="number"
                  value={steps}
                  onChange={(e) => {
                    setSteps(e.target.value);
                  }}
                  placeholder={t('checkIn.enterDailySteps', 'Enter daily steps')}
                />
              </div>

              <div>
                <Label htmlFor="neck">{t('checkIn.neck', 'Neck')} ({defaultMeasurementUnit})</Label>
                <Input
                  id="neck"
                  type="number"
                  step="0.1"
                  value={neck}
                  onChange={(e) => {
                    setNeck(e.target.value);
                  }}
                  placeholder={`${t('checkIn.enterNeckMeasurement', 'Enter neck measurement in')} ${defaultMeasurementUnit}`}
                />
              </div>

              <div>
                <Label htmlFor="waist">{t('checkIn.waist', 'Waist')} ({defaultMeasurementUnit})</Label>
                <Input
                  id="waist"
                  type="number"
                  step="0.1"
                  value={waist}
                  onChange={(e) => {
                    setWaist(e.target.value);
                  }}
                  placeholder={`${t('checkIn.enterWaistMeasurement', 'Enter waist measurement in')} ${defaultMeasurementUnit}`}
                />
              </div>

              <div>
                <Label htmlFor="hips">{t('checkIn.hips', 'Hips')} ({defaultMeasurementUnit})</Label>
                <Input
                  id="hips"
                  type="number"
                  step="0.1"
                  value={hips}
                  onChange={(e) => {
                    setHips(e.target.value);
                  }}
                  placeholder={`${t('checkIn.enterHipsMeasurement', 'Enter hips measurement in')} ${defaultMeasurementUnit}`}
                />
              </div>

              <div>
                <Label htmlFor="height">{t('checkIn.height', 'Height')} ({defaultMeasurementUnit})</Label>
                <Input
                  id="height"
                  type="number"
                  step="0.1"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder={`${t('checkIn.enterHeight', 'Enter height in')} ${defaultMeasurementUnit}`}
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="bodyFat">{t('checkIn.bodyFatPercentage', 'Body Fat %')}</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="use-most-recent-toggle"
                            checked={useMostRecentForCalculation}
                            onCheckedChange={setUseMostRecentForCalculation}
                          />
                          <Label htmlFor="use-most-recent-toggle">{t('checkIn.useRecent', 'Use Recent')}</Label>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t('checkIn.useMostRecentForCalculation', 'Use most recent Weight, Height, Waist, Neck, and Hips for body fat calculation')}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="flex items-center">
                  <Input
                    id="bodyFat"
                    type="number"
                    step="0.1"
                    value={bodyFatPercentage}
                    onChange={(e) => setBodyFatPercentage(e.target.value)}
                    placeholder={t('checkIn.enterBodyFatPercentage', 'Enter body fat percentage')}
                  />
                  <Button type="button" onClick={handleCalculateBodyFat} className="ml-2">{t('checkIn.calculate', 'Calculate')}</Button>
                </div>
              </div>
              {/* Custom Categories */}

              {/* Custom Categories */}
              {customCategories.map((category) => {
                const isConvertible = shouldConvertCustomMeasurement(category.measurement_type);
                return (
                  <div key={category.id}>
                    <Label htmlFor={`custom-${category.id}`}>
                      {category.display_name || category.name} ({isConvertible ? defaultMeasurementUnit : category.measurement_type})
                    </Label>
                    <Input
                      id={`custom-${category.id}`}
                      type={category.data_type === 'numeric' ? 'number' : 'text'}
                      step={category.data_type === 'numeric' ? "0.01" : undefined}
                      value={customValues[category.id] || ''}
                      onChange={(e) => {
                        setCustomValues(prev => ({
                          ...prev,
                          [category.id]: e.target.value
                        }));
                      }}
                      placeholder={t('checkIn.enterCustomCategory', { categoryName: (category.display_name || category.name).toLowerCase(), defaultValue: `Enter ${(category.display_name || category.name).toLowerCase()}` })}
                    />
                    <Input
                      id={`custom-notes-${category.id}`}
                      type="text"
                      value={customNotes[category.id] || ''}
                      onChange={(e) => {
                        setCustomNotes(prev => ({
                          ...prev,
                          [category.id]: e.target.value
                        }));
                      }}
                      placeholder={t('checkIn.notesOptional', 'Notes (optional)')}
                      className="mt-2"
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center">
              <Button type="submit" disabled={loading} size="sm">
                {loading ? t('checkIn.saving', 'Saving...') : t('checkIn.saveCheckIn', 'Save Check-In')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Recent Measurements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('checkIn.recentMeasurements', 'Recent Measurements (Last 20)')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentMeasurements.length === 0 ? (
              <p className="text-muted-foreground">{t('checkIn.noMeasurementsRecorded', 'No measurements recorded yet')}</p>
            ) : (
              recentMeasurements.map((measurement: CombinedMeasurement) => { // Explicitly cast here
                let displayValue = measurement.value;
                let displayUnit = measurement.display_unit;
                let measurementName = measurement.display_name;

                if (measurement.type === 'custom' && measurement.custom_categories) {
                  const isConvertible = shouldConvertCustomMeasurement(measurement.custom_categories.measurement_type);
                  displayValue = isConvertible
                    ? (typeof measurement.value === 'number' ? convertMeasurement(measurement.value, 'cm', defaultMeasurementUnit) : measurement.value)
                    : measurement.value;
                  displayUnit = isConvertible ? defaultMeasurementUnit : measurement.custom_categories.measurement_type;
                } else if (measurement.type === 'standard') {
                  // Apply unit conversion for standard measurements if applicable
                  if (measurement.display_name === 'Weight') {
                    displayValue = typeof measurement.value === 'number' ? convertWeight(measurement.value, 'kg', defaultWeightUnit) : measurement.value;
                    displayUnit = defaultWeightUnit;
                  } else if (['Neck', 'Waist', 'Hips'].includes(measurement.display_name)) {
                    displayValue = typeof measurement.value === 'number' ? convertMeasurement(measurement.value, 'cm', defaultMeasurementUnit) : measurement.value;
                    displayUnit = defaultMeasurementUnit;
                  } else if (measurement.display_name === 'Height') {
                    displayValue = typeof measurement.value === 'number' ? convertMeasurement(measurement.value, 'cm', defaultMeasurementUnit) : measurement.value;
                    displayUnit = defaultMeasurementUnit;
                  }
                }
                // Format displayValue to one decimal place if it's a number
                const formattedDisplayValue = typeof displayValue === 'number' ? displayValue.toFixed(1) : displayValue;

                return (
                  <div
                    key={`${measurement.id}-${measurement.display_name}`}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <div className="font-medium">
                        {measurementName}: {formattedDisplayValue} {displayUnit}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDateInUserTimezone(measurement.entry_date, 'PPP')}
                        {measurement.entry_hour !== null && (
                          <span> {t('checkIn.at', 'at')} {measurement.entry_hour.toString().padStart(2, '0')}:00</span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        handleDeleteMeasurementClick(measurement);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CheckIn;

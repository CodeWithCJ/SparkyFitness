import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { toast } from "@/hooks/use-toast";
import CheckInPreferences from "./CheckInPreferences";
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
  saveCheckInMeasurements,
  saveCustomMeasurement,
  CustomCategory,
  CustomMeasurement,
  CheckInMeasurement,
  CombinedMeasurement,
} from '@/services/checkInService';
import { saveMoodEntry, getMoodEntryByDate } from '@/services/moodService'; // Import mood service



const CheckIn = () => {
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
  const [mood, setMood] = useState<number | null>(50); // Initialize mood to 50
  const [moodNotes, setMoodNotes] = useState<string>(""); // New state for mood notes
  const [displayWeightUnit, setDisplayWeightUnit] = useState<'kg' | 'lbs'>(defaultWeightUnit);
  const [displayMeasurementUnit, setDisplayMeasurementUnit] = useState<'cm' | 'inches'>(defaultMeasurementUnit);
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([]);
  const [customValues, setCustomValues] = useState<{[key: string]: string}>({});
  const [customNotes, setCustomNotes] = useState<{[key: string]: string}>({});

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
      setDisplayWeightUnit(defaultWeightUnit);
      setDisplayMeasurementUnit(defaultMeasurementUnit);
      // Trigger data reload when default units change to ensure values are displayed in the new default unit
      loadExistingData();
    }, [defaultWeightUnit, defaultMeasurementUnit]);

  useEffect(() => {
    if (currentUserId && customCategories.length > 0) {
      loadExistingData();
      fetchAllRecentMeasurements();
    }
  }, [currentUserId, selectedDate, customCategories, convertWeight, convertMeasurement, defaultWeightUnit, defaultMeasurementUnit, formatDateInUserTimezone, parseDateInUserTimezone]);
  
    // Effect to re-convert displayed values when display units change
    useEffect(() => {
      // Only re-convert if there's a value to convert
      if (weight) {
        const converted = convertWeight(parseFloat(weight), displayWeightUnit === 'kg' ? 'lbs' : 'kg', displayWeightUnit);
        setWeight(typeof converted === 'number' && !isNaN(converted) ? converted.toFixed(1) : "");
      }
      if (neck) {
        const converted = convertMeasurement(parseFloat(neck), displayMeasurementUnit === 'cm' ? 'inches' : 'cm', displayMeasurementUnit);
        setNeck(typeof converted === 'number' && !isNaN(converted) ? converted.toFixed(1) : "");
      }
      if (waist) {
        const converted = convertMeasurement(parseFloat(waist), displayMeasurementUnit === 'cm' ? 'inches' : 'cm', displayMeasurementUnit);
        setWaist(typeof converted === 'number' && !isNaN(converted) ? converted.toFixed(1) : "");
      }
      if (hips) {
        const converted = convertMeasurement(parseFloat(hips), displayMeasurementUnit === 'cm' ? 'inches' : 'cm', displayMeasurementUnit);
        setHips(typeof converted === 'number' && !isNaN(converted) ? converted.toFixed(1) : "");
      }
      // Re-load custom values to ensure they are displayed in the correct unit
      loadExistingData();
    }, [displayWeightUnit, displayMeasurementUnit]);
  
  
    const loadCustomCategories = async () => {
    if (!currentUserId) {
      warn(loggingLevel, "loadCustomCategories called with no current user ID.");
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
      warn(loggingLevel, "fetchAllRecentMeasurements called with no current user ID.");
      return;
    }

    try {
      const custom = await fetchRecentCustomMeasurements();
      // For standard measurements, fetch for a range (e.g., last 30 days)
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 30); // Fetch last 30 days
      const standard = await fetchRecentStandardMeasurements(format(startDate, 'yyyy-MM-dd'), format(endDate, 'yyyy-MM-dd'));

      const combined: CombinedMeasurement[] = [];

      // Add custom measurements
      custom.forEach(m => {
        combined.push({
          id: m.id,
          entry_date: m.entry_date,
          entry_hour: m.entry_hour,
          entry_timestamp: m.entry_timestamp,
          value: m.value,
          type: 'custom',
          display_name: m.custom_categories.name,
          display_unit: m.custom_categories.measurement_type,
          custom_categories: m.custom_categories, // Keep original custom_categories for conversion logic
        });
      });

      // Add standard measurements
      standard.forEach(s => {
        if (s.weight !== null) combined.push({ id: s.id, entry_date: s.entry_date, value: s.weight, type: 'standard', display_name: 'Weight', display_unit: defaultWeightUnit, entry_hour: null, entry_timestamp: s.entry_date });
        if (s.neck !== null) combined.push({ id: s.id, entry_date: s.entry_date, value: s.neck, type: 'standard', display_name: 'Neck', display_unit: defaultMeasurementUnit, entry_hour: null, entry_timestamp: s.entry_date });
        if (s.waist !== null) combined.push({ id: s.id, entry_date: s.entry_date, value: s.waist, type: 'standard', display_name: 'Waist', display_unit: defaultMeasurementUnit, entry_hour: null, entry_timestamp: s.entry_date });
        if (s.hips !== null) combined.push({ id: s.id, entry_date: s.entry_date, value: s.hips, type: 'standard', display_name: 'Hips', display_unit: defaultMeasurementUnit, entry_hour: null, entry_timestamp: s.entry_date });
        if (s.steps !== null) combined.push({ id: s.id, entry_date: s.entry_date, value: s.steps, type: 'standard', display_name: 'Steps', display_unit: 'steps', entry_hour: null, entry_timestamp: s.entry_date });
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
      sonnerToast.error('Failed to load recent measurements');
    }
  };

  const handleDeleteMeasurementClick = async (measurement: CombinedMeasurement) => {
    if (!currentUserId) {
      warn(loggingLevel, "handleDeleteMeasurementClick called with no current user ID.");
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
          default:
            warn(loggingLevel, `Unknown standard measurement type for deletion: ${measurement.display_name}`);
            return;
        }
        await updateCheckInMeasurementField({
          id: measurement.id,
          field: fieldToNull,
          value: null,
          entry_date: measurement.entry_date,
        });
      }
      info(loggingLevel, 'Measurement deleted successfully:', measurement.id);
      sonnerToast.success('Measurement deleted successfully');
      fetchAllRecentMeasurements();
      loadExistingData(); // Reload today's values
    } catch (err) {
      error(loggingLevel, 'Error deleting measurement:', err);
      sonnerToast.error('Failed to delete measurement');
    }
  };

  const loadExistingData = async () => {
    try {
      // Load check-in measurements
      const data = await loadExistingCheckInMeasurements(selectedDate);
      if (data) {
        info(loggingLevel, "Existing check-in data loaded:", data);
        // Set internal state in canonical units (kg, cm)
        // Values are loaded in canonical units, then converted for display
        const convertedWeight = data.weight !== undefined && data.weight !== null ? convertWeight(data.weight, 'kg', displayWeightUnit) : NaN;
        setWeight(typeof convertedWeight === 'number' && !isNaN(convertedWeight) ? convertedWeight.toFixed(1) : "");

        const convertedNeck = data.neck !== undefined && data.neck !== null ? convertMeasurement(data.neck, 'cm', displayMeasurementUnit) : NaN;
        setNeck(typeof convertedNeck === 'number' && !isNaN(convertedNeck) ? convertedNeck.toFixed(1) : "");

        const convertedWaist = data.waist !== undefined && data.waist !== null ? convertMeasurement(data.waist, 'cm', displayMeasurementUnit) : NaN;
        setWaist(typeof convertedWaist === 'number' && !isNaN(convertedWaist) ? convertedWaist.toFixed(1) : "");

        const convertedHips = data.hips !== undefined && data.hips !== null ? convertMeasurement(data.hips, 'cm', displayMeasurementUnit) : NaN;
        setHips(typeof convertedHips === 'number' && !isNaN(convertedHips) ? convertedHips.toFixed(1) : "");
        setSteps(data.steps?.toString() || "");
      } else {
        info(loggingLevel, "No existing check-in data for this date, clearing form.");
        setWeight("");
        setNeck("");
        setWaist("");
        setHips("");
        setSteps("");
      }

      // Load mood entry for the selected date
      info(loggingLevel, "Fetching mood entry for selectedDate:", selectedDate, "and currentUserId:", currentUserId);
      const moodEntry = await getMoodEntryByDate(selectedDate);
      debug(loggingLevel, "CheckIn: Mood entry from getMoodEntryByDate:", moodEntry);
      if (moodEntry) {
        info(loggingLevel, "Existing mood entry loaded:", moodEntry);
        setMood(moodEntry.mood_value);
        setMoodNotes(moodEntry.notes);
      } else {
        info(loggingLevel, "No existing mood entry for this date, setting to default.");
        setMood(50); // Default mood value
        setMoodNotes(""); // Clear mood notes
      }

      const customData = await loadExistingCustomMeasurements(selectedDate);
      info(loggingLevel, "Custom measurements loaded for date:", { selectedDate, customData });
      if (customData && customData.length > 0) {
        const newCustomValues: { [key: string]: string } = {};
        const newCustomNotes: { [key: string]: string } = {};
        customData.forEach((measurement) => {
          const category = customCategories.find(c => c.id === measurement.category_id);
          if (category) {
            const isConvertible = shouldConvertCustomMeasurement(category.measurement_type);
            if (category.data_type === 'numeric') {
              newCustomValues[measurement.category_id] = isConvertible
                ? (() => {
                    const converted = convertMeasurement(measurement.value, 'cm', displayMeasurementUnit);
                    return typeof converted === 'number' && !isNaN(converted) ? converted.toFixed(1) : "";
                  })()
                : measurement.value.toString();
            } else {
              newCustomValues[measurement.category_id] = measurement.text_value || '';
            }
            newCustomNotes[measurement.category_id] = measurement.notes || '';
          }
        });
        setCustomValues(newCustomValues);
        setCustomNotes(newCustomNotes);
      } else {
        setCustomValues({});
        setCustomNotes({});
      }
    } catch (err) {
      error(loggingLevel, 'Error loading existing data:', err);
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
        title: "Error",
        description: "Failed to save mood entry",
        variant: "destructive",
      });
    }

    if (!currentUserId) {
      warn(loggingLevel, "Submit called with no current user ID.");
      toast({
        title: "Error",
        description: "You must be logged in to save check-in data",
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
      if (weight) measurementData.weight = convertWeight(parseFloat(weight), displayWeightUnit, 'kg');
      if (neck) measurementData.neck = convertMeasurement(parseFloat(neck), displayMeasurementUnit, 'cm');
      if (waist) measurementData.waist = convertMeasurement(parseFloat(waist), displayMeasurementUnit, 'cm');
      if (hips) measurementData.hips = convertMeasurement(parseFloat(hips), displayMeasurementUnit, 'cm');
      if (steps) measurementData.steps = parseInt(steps);

      await saveCheckInMeasurements(measurementData);
      info(loggingLevel, "Standard check-in data saved successfully.");

      for (const [categoryId, value] of Object.entries(customValues)) {
        if (value) {
          const category = customCategories.find(c => c.id === categoryId);
          if (category) {
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
              if (parseFloat(value) > 0) {
                customMeasurementData.value = isConvertible && !isNaN(parseFloat(value))
                  ? convertMeasurement(parseFloat(value), displayMeasurementUnit, 'cm')
                  : parseFloat(value);
              } else {
                continue;
              }
            } else {
              customMeasurementData.text_value = value;
            }

            await saveCustomMeasurement(customMeasurementData);
            info(loggingLevel, `Custom measurement for category ${category.name} saved successfully.`);
          } else {
            warn(loggingLevel, `Custom category not found for ID: ${categoryId}`);
          }
        }
      }

      info(loggingLevel, "Check-in data saved successfully!");
      toast({
        title: "Success",
        description: "Check-in data saved successfully!",
      });

      // Refresh recent measurements after saving
      fetchAllRecentMeasurements();
    } catch (err) {
      error(loggingLevel, 'Error saving check-in data:', err);
      toast({
        title: "Error",
        description: "Failed to save check-in data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Preferences Section */}
      <CheckInPreferences
        weightUnit={displayWeightUnit}
        measurementUnit={displayMeasurementUnit}
        setWeightUnit={setDisplayWeightUnit}
        setMeasurementUnit={setDisplayMeasurementUnit}
        selectedDate={selectedDate}
        onDateChange={(dateString) => {
          setSelectedDate(dateString);
          // When date changes, reload existing data for the new date
          // This will be triggered by the useEffect hook
        }}
      />

      {/* Mood Meter Section */}
      <MoodMeter
        onMoodChange={(newMood, newNotes) => {
          setMood(newMood);
          setMoodNotes(newNotes);
        }}
        initialMood={mood}
        initialNotes={moodNotes}
      />

      {/* Check-In Form */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Check-In</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="weight">Weight ({displayWeightUnit})</Label>
                <Input
                  id="weight"
                  type="number"
                  step="0.1"
                  value={weight}
                  onChange={(e) => {
                    setWeight(e.target.value);
                  }}
                  placeholder={`Enter weight in ${displayWeightUnit}`}
                />
              </div>

              <div>
                <Label htmlFor="steps">Steps</Label>
                <Input
                  id="steps"
                  type="number"
                  value={steps}
                  onChange={(e) => {
                    setSteps(e.target.value);
                  }}
                  placeholder="Enter daily steps"
                />
              </div>

              <div>
                <Label htmlFor="neck">Neck ({displayMeasurementUnit})</Label>
                <Input
                  id="neck"
                  type="number"
                  step="0.1"
                  value={neck}
                  onChange={(e) => {
                    setNeck(e.target.value);
                  }}
                  placeholder={`Enter neck measurement in ${displayMeasurementUnit}`}
                />
              </div>

              <div>
                <Label htmlFor="waist">Waist ({displayMeasurementUnit})</Label>
                <Input
                  id="waist"
                  type="number"
                  step="0.1"
                  value={waist}
                  onChange={(e) => {
                    setWaist(e.target.value);
                  }}
                  placeholder={`Enter waist measurement in ${displayMeasurementUnit}`}
                />
              </div>

              <div>
                <Label htmlFor="hips">Hips ({displayMeasurementUnit})</Label>
                <Input
                  id="hips"
                  type="number"
                  step="0.1"
                  value={hips}
                  onChange={(e) => {
                    setHips(e.target.value);
                  }}
                  placeholder={`Enter hips measurement in ${displayMeasurementUnit}`}
                />
              </div>

              {/* Custom Categories */}
              {customCategories.map((category) => {
                const isConvertible = shouldConvertCustomMeasurement(category.measurement_type);
                return (
                  <div key={category.id}>
                    <Label htmlFor={`custom-${category.id}`}>
                      {category.name} ({isConvertible ? displayMeasurementUnit : category.measurement_type})
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
                      placeholder={`Enter ${category.name.toLowerCase()}`}
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
                      placeholder="Notes (optional)"
                      className="mt-2"
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center">
              <Button type="submit" disabled={loading} size="sm">
                {loading ? 'Saving...' : 'Save Check-In'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Recent Measurements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Measurements (Last 20)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentMeasurements.length === 0 ? (
              <p className="text-muted-foreground">No measurements recorded yet</p>
            ) : (
              recentMeasurements.map((measurement: CombinedMeasurement) => { // Explicitly cast here
                let displayValue = measurement.value;
                let displayUnit = measurement.display_unit;
                let measurementName = measurement.display_name;

                if (measurement.type === 'custom' && measurement.custom_categories) {
                  const isConvertible = shouldConvertCustomMeasurement(measurement.custom_categories.measurement_type);
                  displayValue = isConvertible
                    ? convertMeasurement(measurement.value, 'cm', displayMeasurementUnit)
                    : measurement.value;
                  displayUnit = isConvertible ? displayMeasurementUnit : measurement.custom_categories.measurement_type;
                } else if (measurement.type === 'standard') {
                  // Apply unit conversion for standard measurements if applicable
                  if (measurement.display_name === 'Weight') {
                    displayValue = convertWeight(measurement.value, 'kg', displayWeightUnit);
                    displayUnit = displayWeightUnit;
                  } else if (['Neck', 'Waist', 'Hips'].includes(measurement.display_name)) {
                    displayValue = convertMeasurement(measurement.value, 'cm', displayMeasurementUnit);
                    displayUnit = displayMeasurementUnit;
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
                          <span> at {measurement.entry_hour.toString().padStart(2, '0')}:00</span>
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

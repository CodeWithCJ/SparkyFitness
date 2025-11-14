import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Save, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useActiveUser } from "@/contexts/ActiveUserContext";
import { toast } from "sonner";
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences
import { debug, info, warn, error } from '@/utils/logging'; // Import logging utility
import {
  getCustomCategories,
  getCustomMeasurements,
  getCustomMeasurementsForDate,
  saveCustomMeasurement,
  deleteCustomMeasurement,
  CustomCategory,
  CustomMeasurement,
} from "@/services/customMeasurementService";


interface MeasurementValues {
  [categoryId: string]: string;
}

interface NoteValues {
  [categoryId: string]: string;
}

const CustomMeasurements = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { activeUserId } = useActiveUser();
  const { formatDateInUserTimezone, loggingLevel } = usePreferences(); // Use preferences for timezone
  debug(loggingLevel, "CustomMeasurements component rendered.");

  const [categories, setCategories] = useState<CustomCategory[]>([]);
  const [measurements, setMeasurements] = useState<CustomMeasurement[]>([]);
  const [values, setValues] = useState<MeasurementValues>({});
  const [notes, setNotes] = useState<NoteValues>({});
  const [loadingStates, setLoadingStates] = useState<{[key: string]: boolean}>({});

  // Get current date and time in user's timezone
  const currentDate = formatDateInUserTimezone(new Date(), 'yyyy-MM-dd');
  const currentHour = new Date().getHours(); // This is already local hour, which is fine for entry_hour

  useEffect(() => {
    debug(loggingLevel, "User or activeUserId useEffect triggered.", { user, activeUserId });
    if (user && activeUserId) {
      fetchCategories();
      fetchMeasurements();
      loadTodayValues();
    }
  }, [user, activeUserId, formatDateInUserTimezone, loggingLevel, t]); // Add t to dependencies

  const fetchCategories = async () => {
    if (!activeUserId) return;


    try {
      const data = await getCustomCategories(activeUserId);
      setCategories(data || []);
    } catch (err: any) {
      console.error('Error fetching categories:', err);
      toast.error(err.message || t('customMeasurements.loadCategoriesErrorToast', 'Failed to load categories'));
    }
  };

  const fetchMeasurements = async () => {
    if (!activeUserId) return;


    try {
      const data = await getCustomMeasurements(activeUserId);
      setMeasurements(data || []);
    } catch (err: any) {
      console.error('Error fetching measurements:', err);
      toast.error(err.message || t('customMeasurements.loadMeasurementsErrorToast', 'Failed to load measurements'));
    }
  };

  const loadTodayValues = async () => {
    if (!activeUserId) return;

    // Load existing values for today
    try {
      const data = await getCustomMeasurementsForDate(activeUserId, currentDate);
      const newValues: MeasurementValues = {};
      if (data) {
        data.forEach((measurement) => {
          newValues[measurement.category_id] = measurement.value.toString();
          if (measurement.notes) {
            setNotes(prev => ({ ...prev, [measurement.category_id]: measurement.notes }));
          }
        });
      }
      setValues(newValues);
    } catch (err: any) {
      console.error('Error loading today values:', err);
      toast.error(err.message || t('customMeasurements.loadTodayMeasurementsErrorToast', 'Failed to load today\'s measurements'));
    }
  };

  const handleSave = async (categoryId: string) => {
    if (!activeUserId || !values[categoryId]) {
      toast.error(t('customMeasurements.enterValueToastError', 'Please enter a value'));
      return;
    }

    const category = categories.find(c => c.id === categoryId);
    if (!category) {
      toast.error(t('customMeasurements.invalidCategoryToastError', 'Invalid category'));
      return;
    }

    let valueToSave: string | number = values[categoryId];
    if (category.data_type === 'numeric') {
      const numericValue = parseFloat(values[categoryId]);
      if (isNaN(numericValue) || numericValue <= 0) {
        toast.error(t('customMeasurements.invalidPositiveNumberToastError', 'Please enter a valid positive number'));
        return;
      }
      valueToSave = numericValue;
    }


    setLoadingStates(prev => ({ ...prev, [categoryId]: true }));

    try {
      const currentTime = new Date();
      let entryHour: number | null = null;
      let entryTimestamp: string;

      if (category.frequency === 'Hourly') {
        entryHour = currentHour;
        const selectedDateTime = new Date();
        selectedDateTime.setHours(currentHour, 0, 0, 0);
        entryTimestamp = selectedDateTime.toISOString();
      } else {
        entryTimestamp = currentTime.toISOString();
      }

      const measurementData = {
        user_id: activeUserId,
        category_id: categoryId,
        value: valueToSave,
        entry_date: currentDate,
        entry_hour: entryHour,
        entry_timestamp: entryTimestamp,
        notes: notes[categoryId] || null,
      };

      await saveCustomMeasurement(measurementData);
      toast.success(t('customMeasurements.saveSuccessToast', 'Measurement saved successfully'));
      fetchMeasurements();
      // Clear the input after successful save for 'All' frequency
      if (category.frequency === 'All') {
        setValues(prev => ({ ...prev, [categoryId]: '' }));
        setNotes(prev => ({ ...prev, [categoryId]: '' }));
      }
    } catch (error) {
      console.error('Error saving measurement:', error);
      toast.error(t('customMeasurements.saveErrorToast', 'Failed to save measurement'));
    } finally {
      setLoadingStates(prev => ({ ...prev, [categoryId]: false }));
    }
  };

  const handleDelete = async (measurementId: string) => {
    if (!activeUserId) return;

    try {
      await deleteCustomMeasurement(measurementId);
      toast.success(t('customMeasurements.deleteSuccessToast', 'Measurement deleted successfully'));
      fetchMeasurements();
      loadTodayValues();
    } catch (err: any) {
      console.error('Error deleting measurement:', err);
      toast.error(err.message || t('customMeasurements.deleteErrorToast', 'Failed to delete measurement'));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('customMeasurements.title', 'Custom Measurements - {{date}}', { date: new Date().toLocaleDateString() })}</CardTitle>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              {t('customMeasurements.noCategoriesAvailable', 'No custom categories available. Add some categories first to start tracking measurements.')}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {categories.map((category) => {
                const isLoading = loadingStates[category.id] || false;
                const hasValue = values[category.id] && parseFloat(values[category.id]) > 0;

                return (
                  <Card key={category.id} className="h-fit">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium">
                        {category.display_name || category.name}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        {category.measurement_type} • {category.frequency} • {category.data_type || 'numeric'}
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label htmlFor={`value-${category.id}`} className="text-xs">{t('customMeasurements.valueLabel', 'Value')}</Label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            id={`value-${category.id}`}
                            type={category.data_type === 'text' ? 'text' : 'number'}
                            step="0.01"
                            value={values[category.id] || ''}
                            onChange={(e) => setValues(prev => ({ ...prev, [category.id]: e.target.value }))}
                            placeholder={t('customMeasurements.enterValuePlaceholder', 'Enter value')}
                            className="h-8 text-sm flex-1"
                          />
                          <Button
                            onClick={() => handleSave(category.id)}
                            disabled={isLoading || !values[category.id]}
                            size="sm"
                            variant="default"
                            className="h-8 text-xs px-3 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground"
                          >
                            <Save className="mr-1 h-3 w-3" />
                            {isLoading ? t('customMeasurements.savingButton', 'Saving...') : t('customMeasurements.saveButton', 'Save')}
                          </Button>
                        </div>
                      </div>
                      <div>
                        <Label htmlFor={`notes-${category.id}`} className="text-xs">{t('customMeasurements.notesOptionalLabel', 'Notes (optional)')}</Label>
                        <Input
                          id={`notes-${category.id}`}
                          type="text"
                          value={notes[category.id] || ''}
                          onChange={(e) => setNotes(prev => ({ ...prev, [category.id]: e.target.value }))}
                          placeholder={t('customMeasurements.addNotePlaceholder', 'Add a note...')}
                          className="h-8 text-sm flex-1 mt-1"
                        />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Measurements */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('customMeasurements.recentMeasurementsTitle', 'Recent Measurements (Last 20)')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {measurements.length === 0 ? (
              <p className="text-muted-foreground">{t('customMeasurements.noMeasurementsRecorded', 'No measurements recorded yet')}</p>
            ) : (
              measurements.map((measurement) => (
                <div
                  key={measurement.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div>
                    <div className="font-medium">
                      {measurement.custom_categories.display_name || measurement.custom_categories.name}: {measurement.value} {measurement.custom_categories.measurement_type}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {new Date(measurement.entry_date).toLocaleDateString()}
                      {measurement.entry_hour !== null && (
                        <span> {t('customMeasurements.at', 'at')} {measurement.entry_hour.toString().padStart(2, '0')}:00</span>
                      )}
                    </div>
                    {measurement.notes && (
                      <div className="text-sm text-gray-500 mt-1">
                        <strong>{t('customMeasurements.notesLabel', 'Notes:')}</strong> {measurement.notes}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(measurement.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CustomMeasurements;

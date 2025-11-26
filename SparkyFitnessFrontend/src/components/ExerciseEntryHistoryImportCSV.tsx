import { useState, useRef, useEffect } from "react"; // Added useEffect
import { useTranslation } from "react-i18next";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiCall } from "@/services/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { Upload, Download, Loader2, Plus, Trash2, Copy } from "lucide-react"; // Added Plus, Trash2, and Copy
import { format, parse } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import { getUserPreferences } from "@/services/preferenceService";
import { UserPreferences } from "@/services/preferenceService";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Define the shape of a single row from the CSV
interface CsvRow {
  entry_date: string;
  exercise_name: string;
  preset_name?: string;
  entry_notes?: string;
  calories_burned?: string;
  distance?: string;
  avg_heart_rate?: string;
  set_number?: string;
  set_type?: string;
  reps?: string;
  weight?: string;
  duration_min?: string; // Changed from duration_sec to duration_min
  rest_time_sec?: string;
  set_notes?: string;
  // New Exercise Definition Fields
  exercise_category?: string;
  calories_per_hour?: string;
  exercise_description?: string;
  exercise_source?: string;
  exercise_force?: string;
  exercise_level?: string;
  exercise_mechanic?: string;
  exercise_equipment?: string; // Comma-separated
  primary_muscles?: string; // Comma-separated
  secondary_muscles?: string; // Comma-separated
  instructions?: string; // Newline-separated
  // Existing activity details
  activity_field_name?: string;
  activity_value?: string;
  [key: string]: string | undefined; // Allow for arbitrary additional columns
}

// Define the grouped structure for review
interface GroupedExerciseEntry {
  id: string; // Client-side unique ID for grouping
  entry_date: Date;
  exercise_name: string;
  preset_name?: string;
  entry_notes?: string;
  calories_burned?: number;
  distance?: number;
  avg_heart_rate?: number;
  // Exercise definition fields
  exercise_category?: string;
  calories_per_hour?: number;
  exercise_description?: string;
  exercise_source?: string;
  exercise_force?: string;
  exercise_level?: string;
  exercise_mechanic?: string;
  exercise_equipment?: string[];
  primary_muscles?: string[];
  secondary_muscles?: string[];
  instructions?: string[];
  sets: {
    set_number: number;
    set_type?: string;
    reps?: number;
    weight?: number;
    duration_min?: number;
    rest_time_sec?: number;
    notes?: string;
  }[];
  activity_details: {
    field_name: string;
    value: string | number;
  }[];
}


interface ExerciseEntryHistoryImportCSVProps {
  onImportComplete: () => void;
}

const dateFormats = [
  { value: "MM/dd/yyyy", label: "MM/dd/yyyy (e.g., 12/25/2024)" },
  { value: "dd/MM/yyyy", label: "dd/MM/yyyy (e.g., 25/12/2024)" },
  { value: "dd-MMM-yyyy", label: "dd-MMM-yyyy (e.g., 25-Dec-2024)" },
  { value: "yyyy-MM-dd", label: "yyyy-MM-dd (e.g., 2024-12-25)" },
  { value: "MMM dd, yyyy", label: "MMM dd, yyyy (e.g., Dec 25, 2024)" },
];

const ExerciseEntryHistoryImportCSV = ({ onImportComplete }: ExerciseEntryHistoryImportCSVProps) => {
  const { t } = useTranslation();
  const { user } = useAuth(); // Use useAuth hook
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [selectedDateFormat, setSelectedDateFormat] = useState<string>(dateFormats[0].value); // Explicitly type useState
  const [parsedData, setParsedData] = useState<CsvRow[]>([]);
  const [groupedEntries, setGroupedEntries] = useState<GroupedExerciseEntry[]>([]);
  const [userPreferences, setUserPreferences] = useState<UserPreferences | null>(null); // State for user preferences
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update selectedDateFormat when userPreferences change
  useEffect(() => {
    if (userPreferences?.date_format) {
      setSelectedDateFormat(userPreferences.date_format);
    }
  }, [userPreferences]);

  useEffect(() => {
    const fetchPreferences = async () => {
      if (user?.id) {
        try {
          const preferences = await getUserPreferences("INFO"); // Assuming "INFO" as a default logging level
          setUserPreferences(preferences);
        } catch (error) {
          console.error("Failed to fetch user preferences:", error);
          toast({
            title: t("common.error", "Error"),
            description: t("settings.preferences.fetchError", "Failed to load user preferences."),
            variant: "destructive",
          });
        }
      }
    };
    fetchPreferences();
  }, [user?.id, t]);

const dropdownFields = new Set(["exercise_force", "exercise_level", "exercise_mechanic"]);
const dropdownOptions: Record<string, string[]> = {
  exercise_level: ["beginner", "intermediate", "expert"],
  exercise_force: ["pull", "push", "static"],
  exercise_mechanic: ["isolation", "compound"],
};

  const requiredHeaders = [
    "entry_date",
    "exercise_name",
    ...Array.from(dropdownFields), // Include dropdown fields in required headers for display purposes
  ];

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setParsedData([]);
      setGroupedEntries([]);
    } else {
      setFile(null);
    }
  };

  const parseCsvFile = (csvFile: File) => {
    setLoading(true);
    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows: CsvRow[] = results.data as CsvRow[];

        if (results.errors.length > 0) {
          console.error("CSV parsing errors:", results.errors);
          toast({
            title: t("common.error", "Error"),
            description: t("exercise.importHistoryCSV.parseError", "Failed to parse CSV: {{error}}", { error: results.errors[0].message }),
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        // Basic header validation
        const missingHeaders = requiredHeaders.filter(header => !results.meta.fields?.includes(header));
        if (missingHeaders.length > 0) {
          toast({
            title: t("common.error", "Error"),
            description: t("exercise.importHistoryCSV.missingHeaders", "Missing required headers: {{headers}}", { headers: missingHeaders.join(", ") }),
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        setParsedData(rows);
        groupAndValidateData(rows);
        setLoading(false);
      },
      error: (error: any) => {
        console.error("CSV parsing error:", error);
        toast({
          title: t("common.error", "Error"),
          description: t("exercise.importHistoryCSV.parseError", "Failed to parse CSV: {{error}}", { error: error.message }),
          variant: "destructive",
        });
        setLoading(false);
      },
    });
  };

  const groupAndValidateData = (rows: CsvRow[]) => {
    const grouped: { [key: string]: GroupedExerciseEntry } = {};

    rows.forEach((row, index) => {
      const entryDateStr = row.entry_date;
      const exerciseName = row.exercise_name?.trim();
      const presetName = row.preset_name?.trim() || "Individual Entry"; // Default if not provided

      if (!entryDateStr || !exerciseName) {
        toast({
          title: t("common.error", "Error"),
          description: t("exercise.importHistoryCSV.validationError", "Row {{rowNum}}: Missing required 'entry_date' or 'exercise_name'. Skipping row.", { rowNum: index + 2 }),
          variant: "destructive",
        });
        return;
      }

      let parsedDate: Date;
      try {
        // Attempt to parse date based on selected format
        // This is a simplified parse, more robust parsing might be needed
        // For now, assuming date-fns parse function will be used in backend.
        // Frontend only validates if it's a 'valid' date with the format
        // More robust date parsing for various formats
        const parseDateString = (dateString: string, formatString: string): Date => {
          // date-fns parse is strict, so we rely on the exact format string.
          // No need for custom delimiter replacement here, as `parse` expects the format as given.
          const parsed = parse(dateString, formatString, new Date());
          return parsed;
        };

        // Use parseDateString for selectedDateFormat
        parsedDate = parseDateString(entryDateStr, selectedDateFormat);

        if (isNaN(parsedDate.getTime())) {
          throw new Error("Invalid date.");
        }
      } catch (e) {
        toast({
          title: t("common.error", "Error"),
          description: t("exercise.importHistoryCSV.invalidDate", "Row {{rowNum}}: Invalid date format for '{{date}}'. Expected {{format}}.", { rowNum: index + 2, date: entryDateStr, format: selectedDateFormat }),
          variant: "destructive",
        });
        return;
      }

      const key = `${format(parsedDate, "yyyy-MM-dd")}-${exerciseName}-${presetName}`;

      if (!grouped[key]) {
        grouped[key] = {
          id: key, // Use key as a unique ID for the frontend grouping
          entry_date: parsedDate,
          exercise_name: exerciseName,
          preset_name: presetName !== "Individual Entry" ? presetName : undefined,
          entry_notes: row.entry_notes?.trim(),
          calories_burned: row.calories_burned ? parseFloat(row.calories_burned) : undefined,
          distance: row.distance ? parseFloat(row.distance) : undefined,
          avg_heart_rate: row.avg_heart_rate ? parseFloat(row.avg_heart_rate) : undefined,
          // Exercise definition fields
          exercise_category: row.exercise_category?.trim(),
          calories_per_hour: row.calories_per_hour ? parseFloat(row.calories_per_hour) : undefined,
          exercise_description: row.exercise_description?.trim(),
          exercise_source: row.exercise_source?.trim(),
          exercise_force: dropdownFields.has("exercise_force") ? (dropdownOptions["exercise_force"].find(option => option === row.exercise_force?.trim()?.toLowerCase()) || row.exercise_force?.trim()) : row.exercise_force?.trim(),
          exercise_level: dropdownFields.has("exercise_level") ? (dropdownOptions["exercise_level"].find(option => option === row.exercise_level?.trim()?.toLowerCase()) || row.exercise_level?.trim()) : row.exercise_level?.trim(),
          exercise_mechanic: dropdownFields.has("exercise_mechanic") ? (dropdownOptions["exercise_mechanic"].find(option => option === row.exercise_mechanic?.trim()?.toLowerCase()) || row.exercise_mechanic?.trim()) : row.exercise_mechanic?.trim(),
          exercise_equipment: row.exercise_equipment ? row.exercise_equipment.split(',').map(s => s.trim()).filter(s => s) : undefined,
          primary_muscles: row.primary_muscles ? row.primary_muscles.split(',').map(s => s.trim()).filter(s => s) : undefined,
          secondary_muscles: row.secondary_muscles ? row.secondary_muscles.split(',').map(s => s.trim()).filter(s => s) : undefined,
          instructions: row.instructions ? row.instructions.split('\n').map(s => s.trim()).filter(s => s) : undefined,
          sets: [],
          activity_details: [],
        };
      }

      // Process set data
      if (row.set_number) {
        grouped[key].sets.push({
          set_number: parseInt(row.set_number),
          set_type: row.set_type?.trim(),
          reps: row.reps ? parseInt(row.reps) : undefined,
          weight: row.weight ? parseFloat(row.weight) : undefined,
          duration_min: row.duration_min ? parseInt(row.duration_min) : undefined,
          rest_time_sec: row.rest_time_sec ? parseInt(row.rest_time_sec) : undefined,
          notes: row.set_notes?.trim(),
        });
      }

      // Process activity details
      if (row.activity_field_name && row.activity_value) {
        grouped[key].activity_details.push({
          field_name: row.activity_field_name.trim(),
          value: isNaN(parseFloat(row.activity_value)) ? row.activity_value.trim() : parseFloat(row.activity_value),
        });
      }
    });

    // Sort sets within each grouped entry by set_number
    Object.values(grouped).forEach(entry => {
        entry.sets.sort((a, b) => (a.set_number || 0) - (b.set_number || 0));
    });

    setGroupedEntries(Object.values(grouped));
  };

  const handleProcessFile = () => {
    if (file) {
      parseCsvFile(file);
    } else {
      toast({
        title: t("common.error", "Error"),
        description: t("exercise.importHistoryCSV.noFile", "Please select a CSV file to import."),
        variant: "destructive",
      });
    }
  };

  const handleImportSubmit = async () => {
    if (groupedEntries.length === 0) {
      toast({
        title: t("common.error", "Error"),
        description: t("exercise.importHistoryCSV.noDataToImport", "No valid data to import."),
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await apiCall("/exercise-entries/import-history-csv", {
        method: "POST",
        body: JSON.stringify({
          entries: groupedEntries.map(entry => ({
            ...entry,
            entry_date: format(entry.entry_date, "yyyy-MM-dd") // Format date to YYYY-MM-DD
          }))
        }),
      });
      toast({
        title: t("common.success", "Success"),
        description: t("exercise.importHistoryCSV.importSuccess", "Historical exercise entries imported successfully."),
      });
      onImportComplete();
    } catch (error: any) {
      const errorMessage = error.details?.failedEntries ?
        t("exercise.importHistoryCSV.partialImportError", "Some entries failed to import: {{details}}", { details: error.details.failedEntries.map((e: any) => e.entry.exercise_name + " - " + e.reason).join(", ") }) :
        error.message || t("exercise.importHistoryCSV.importError", "Failed to import historical exercise entries. Please try again.");
      toast({
        title: t("common.error", "Error"),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClearData = () => {
    setFile(null);
    setParsedData([]);
    setGroupedEntries([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    toast({
      title: t("common.success", "Success"),
      description: t("exercise.importHistoryCSV.dataCleared", "All parsed data cleared."),
    });
  };

  const handleAddNewEntry = () => {
    const newEntryId = `manual_entry_${Date.now()}`;
    const newEmptyEntry: GroupedExerciseEntry = {
      id: newEntryId,
      entry_date: new Date(), // Default to current date
      exercise_name: "",
      sets: [],
      activity_details: [],
    };
    setGroupedEntries((prev) => [...prev, newEmptyEntry]);
    toast({
      title: t("common.success", "Success"),
      description: t("exercise.importHistoryCSV.emptyEntryAdded", "New empty entry added. Please fill in the details."),
    });
  };

  const handleDownloadTemplate = () => {
    const headers = [
      "entry_date", "exercise_name", "preset_name", "entry_notes", "calories_burned",
      "distance", "avg_heart_rate",
      "set_number", "set_type", "reps", "weight", "duration_min", "rest_time_sec", "set_notes",
      // Exercise definition fields
      "exercise_category", "calories_per_hour", "exercise_description", "exercise_source",
      "exercise_force", "exercise_level", "exercise_mechanic", "exercise_equipment",
      "primary_muscles", "secondary_muscles", "instructions",
      // Activity details fields
      "activity_field_name", "activity_value"
    ];
    const dummyData = [
      {
        entry_date: format(new Date(), "MM/dd/yyyy"),
        exercise_name: "Barbell Bench Press",
        preset_name: "Upper Body Strength",
        entry_notes: "Feeling strong today",
        calories_burned: "300",
        distance: "",
        avg_heart_rate: "",
        set_number: "1",
        set_type: "Working Set",
        reps: "10",
        weight: "60.0",
        duration_min: "1",
        rest_time_sec: "90",
        set_notes: "Controlled movement",
        // Exercise definition fields for new exercise (if 'Barbell Bench Press' doesn't exist)
        exercise_category: "strength",
        calories_per_hour: "400",
        exercise_description: "A compound exercise for chest, shoulders, and triceps.",
        exercise_source: "CSV_Import",
        exercise_force: "push",
        exercise_level: "intermediate",
        exercise_mechanic: "compound",
        exercise_equipment: "barbell,bench",
        primary_muscles: "chest,triceps",
        secondary_muscles: "shoulders",
        instructions: "Lie on bench.\nUnrack bar.\nLower to chest.\nPress up.",
        activity_field_name: "Mood",
        activity_value: "Energized"
      },
      {
        entry_date: format(new Date(), "MM/dd/yyyy"),
        exercise_name: "Barbell Bench Press",
        preset_name: "Upper Body Strength",
        entry_notes: "",
        calories_burned: "",
        distance: "",
        avg_heart_rate: "",
        set_number: "2",
        set_type: "Working Set",
        reps: "8",
        weight: "70.0",
        duration_min: "1",
        rest_time_sec: "120",
        set_notes: "Push harder",
        // No need for exercise definition fields on subsequent rows for the same exercise group
        activity_field_name: "RPE",
        activity_value: "8"
      },
      {
        entry_date: format(new Date(), "MM/dd/yyyy"),
        exercise_name: "Deadlift",
        preset_name: "Lower Body Strength",
        entry_notes: "New PR attempt",
        calories_burned: "400",
        distance: "",
        avg_heart_rate: "150",
        set_number: "1",
        set_type: "Warmup",
        reps: "5",
        weight: "80.0",
        duration_min: "1",
        rest_time_sec: "60",
        set_notes: "",
        // Exercise definition fields for new exercise
        exercise_category: "strength",
        calories_per_hour: "500",
        exercise_description: "A full-body strength exercise.",
        exercise_source: "CSV_Import",
        exercise_force: "pull",
        exercise_level: "expert",
        exercise_mechanic: "compound",
        exercise_equipment: "barbell",
        primary_muscles: "lower back,glutes,hamstrings",
        secondary_muscles: "quadriceps,traps",
        instructions: "Stand over bar.\nHinge at hips.\nLift with legs.",
        activity_field_name: "",
        activity_value: ""
      },
      {
        entry_date: format(new Date(), "MM/dd/yyyy"),
        exercise_name: "Deadlift",
        preset_name: "Lower Body Strength",
        entry_notes: "",
        calories_burned: "",
        distance: "",
        avg_heart_rate: "",
        set_number: "2",
        set_type: "Working Set",
        reps: "3",
        weight: "120.0",
        duration_min: "1",
        rest_time_sec: "180",
        set_notes: "Almost there",
        activity_field_name: "Form Rating",
        activity_value: "Good"
      },
      {
        entry_date: format(new Date(), "MM/dd/yyyy"),
        exercise_name: "Outdoor Run",
        preset_name: "",
        entry_notes: "Enjoyed the fresh air",
        calories_burned: "250",
        distance: "5.0",
        avg_heart_rate: "160",
        set_number: "",
        set_type: "",
        reps: "",
        weight: "",
        duration_min: "30",
        rest_time_sec: "",
        set_notes: "",
        // Exercise definition fields for new exercise
        exercise_category: "cardio",
        calories_per_hour: "350",
        exercise_description: "Running outdoors for cardiovascular fitness.",
        exercise_source: "CSV_Import",
        exercise_force: "",
        exercise_level: "beginner",
        exercise_mechanic: "",
        exercise_equipment: "",
        primary_muscles: "quadriceps,hamstrings,calves",
        secondary_muscles: "",
        instructions: "Run at a steady pace.",
        activity_field_name: "Route",
        activity_value: "Park Loop"
      },
    ];
    const csv = Papa.unparse({
      fields: headers,
      data: dummyData
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "historical_exercise_entries_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getSetDisplay = (sets: GroupedExerciseEntry['sets']) => {
    return sets.map(set => (
      `${set.set_number}: ${set.reps || '-'} reps @ ${set.weight || '-'}kg (${set.set_type})`
    )).join('; ');
  };

  const getActivityDetailsDisplay = (details: GroupedExerciseEntry['activity_details']) => {
    return details.map(detail => (
      `${detail.field_name}: ${detail.value}`
    )).join('; ');
  };


  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("exercise.importHistoryCSV.title", "Import Historical Exercise Entries")}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-4">{t("exercise.importHistoryCSV.description", "Upload a CSV file containing your historical exercise entries. The system will create new exercises or presets if they don't exist, and import your entries, sets, and activity details.")}</p>
        <p className="mb-4">{t("exercise.importHistoryCSV.customFieldsInfo", "Activity Field & Value are custom fields you can add to each exercise entry.")}</p>

        <div className="mb-6 p-4 border rounded-lg bg-muted/50">
          <h3 className="text-lg font-semibold mb-2">
            {t(
              "exercise.importHistoryCSV.standardValuesForDropdowns",
              "Standard Values for Exercise Definition Dropdowns"
            )}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t(
              "exercise.importHistoryCSV.standardValuesDescription",
              "When importing exercise definitions, ensure that values for 'Level', 'Force', and 'Mechanic' match these standard options."
            )}
          </p>
          <div className="grid grid-cols-1 gap-4">
            {Object.keys(dropdownOptions).map((field) => (
              <div key={field}>
                <h4 className="font-medium mb-1 capitalize">
                  {field.replace("exercise_", "").replace(/_/g, " ")}:
                </h4>
                <div className="flex flex-wrap gap-2">
                  {dropdownOptions[field].map((value) => (
                    <TooltipProvider key={value}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 flex items-center gap-1"
                            onClick={() => {
                              navigator.clipboard.writeText(value);
                              toast({
                                title: t(
                                  "exercise.importHistoryCSV.copied",
                                  "Copied!"
                                ),
                                description: t(
                                  "exercise.importHistoryCSV.copiedToClipboard",
                                  `'${value}' copied to clipboard.`,
                                  { value }
                                ),
                              });
                            }}
                          >
                            {value} <Copy className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {t(
                              "exercise.importHistoryCSV.copyTooltip",
                              "Copy '{{value}}'",
                              { value }
                            )}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {userPreferences ? (
          <p className="mb-4 text-sm text-muted-foreground">
            {t("exercise.importHistoryCSV.unitsHint", "Expected units in CSV: Weight: {{weightUnit}}; Distance: {{distanceUnit}}; Duration: Minutes; Rest Time: Seconds; Calories Burned: Calories", {
              weightUnit: userPreferences.weight_unit === 'lbs' ? 'Lbs' : 'Kg',
              distanceUnit: userPreferences.distance_unit === 'miles' ? 'Miles' : 'Km',
            })}
          </p>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">
            {t("exercise.importHistoryCSV.unitsHint", "Expected units in CSV: Weight: Kg/Lbs (based on preferences); Distance: Km/Miles (based on preferences); Duration: Minutes; Rest Time: Seconds; Calories Burned: Calories")}
          </p>
        )}
        
        <div className="flex flex-col space-y-4 mb-6">
          <div className="flex items-center space-x-2">
            <Input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="flex-grow"
            />
            <Select onValueChange={setSelectedDateFormat} value={selectedDateFormat}> {/* Use value instead of defaultValue for controlled component */}
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder={t("exercise.importHistoryCSV.selectDateFormat", "Select Date Format")} />
              </SelectTrigger>
              <SelectContent>
                {dateFormats.map((formatOption) => (
                  <SelectItem key={formatOption.value} value={formatOption.value}>
                    {formatOption.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleProcessFile} disabled={loading || !file} className="flex-grow">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {t("exercise.importHistoryCSV.processFile", "Process File")}
            </Button>
            <Button onClick={handleDownloadTemplate} variant="outline" className="flex-grow">
              <Download className="mr-2 h-4 w-4" />
              {t("exercise.importHistoryCSV.downloadTemplate", "Download Template")}
            </Button>
            {groupedEntries.length > 0 && (
              <Button type="button" onClick={handleClearData} variant="destructive" className="flex-grow">
                <Trash2 size={16} className="mr-2" />
                {t("exercise.importHistoryCSV.clearData", "Clear Data")}
              </Button>
            )}
            <Button type="button" onClick={handleAddNewEntry} variant="outline" className="flex-grow">
              <Plus size={16} className="mr-2" />
              {t("exercise.importHistoryCSV.addEmptyEntry", "Add Empty Entry")}
            </Button>
          </div>
        </div>

        {groupedEntries.length > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">{t("exercise.importHistoryCSV.preview", "Preview of Entries to Import")}</h3>
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("exercise.importHistoryCSV.table.date", "Date")}</TableHead>
                    <TableHead>{t("exercise.importHistoryCSV.table.exercise", "Exercise")}</TableHead>
                    <TableHead>{t("exercise.importHistoryCSV.table.preset", "Preset")}</TableHead>
                    <TableHead>{t("exercise.importHistoryCSV.table.sets", "Sets")}</TableHead>
                    <TableHead>{t("exercise.importHistoryCSV.table.activityDetails", "Activity Details")}</TableHead>
                    <TableHead>{t("exercise.importHistoryCSV.table.notes", "Notes")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{format(entry.entry_date, "yyyy-MM-dd")}</TableCell>
                      <TableCell>{entry.exercise_name}</TableCell>
                      <TableCell>{entry.preset_name || '-'}</TableCell>
                      <TableCell>{getSetDisplay(entry.sets)}</TableCell>
                      <TableCell>{getActivityDetailsDisplay(entry.activity_details)}</TableCell>
                      <TableCell>{entry.entry_notes || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button onClick={handleImportSubmit} disabled={loading} className="mt-4 w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              {t("exercise.importHistoryCSV.confirmImport", "Confirm and Import {{count}} Entries", { count: groupedEntries.length })}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ExerciseEntryHistoryImportCSV;
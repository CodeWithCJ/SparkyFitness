import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Download, Upload, Trash2, Copy } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { importExercisesFromCSV } from "@/services/exerciseService"; // Assuming this service function exists
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export interface ExerciseCSVData {
  id: string;
  [key: string]: string | number | boolean; // Allow for dynamic properties
}

interface ImportFromCSVProps {
  onSave: (exerciseData: Omit<ExerciseCSVData, "id">[]) => Promise<void>;
}

const generateUniqueId = () =>
  `temp_${Math.random().toString(36).substr(2, 9)}`;

const requiredHeaders = [
  "name",
  "category",
  "calories_per_hour",
  "description",
  "force",
  "level",
  "mechanic",
  "equipment",
  "primary_muscles",
  "secondary_muscles",
  "instructions",
  "images",
  "is_custom",
  "shared_with_public",
];

const textFields = new Set(["name", "category", "description", "force", "level", "mechanic"]);
const booleanFields = new Set(["is_custom", "shared_with_public"]);
const arrayFields = new Set(["equipment", "primary_muscles", "secondary_muscles", "instructions", "images"]);

const ImportFromCSV = ({ onSave }: ImportFromCSVProps) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [csvData, setCsvData] = useState<ExerciseCSVData[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseCSV = (text: string): ExerciseCSVData[] => {
    const lines = text.split("\n").filter((line) => line.trim() !== "");
    if (lines.length < 2) return [];

    // Regex to split CSV by commas, but not if the comma is inside double quotes.
    // It also handles escaped double quotes within a quoted field.
    const csvSplitRegex = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;

    const parsedHeaders = lines[0].split(csvSplitRegex).map((header) => header.trim().replace(/^"|"$/g, ''));
    const data: ExerciseCSVData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(csvSplitRegex).map((value) => {
        // Remove surrounding quotes and unescape internal quotes
        let trimmedValue = value.trim();
        if (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) {
          trimmedValue = trimmedValue.substring(1, trimmedValue.length - 1).replace(/""/g, '"');
        }
        return trimmedValue;
      });
      const row: Partial<ExerciseCSVData> = { id: generateUniqueId() };

      parsedHeaders.forEach((header, index) => {
        const value = values[index] || "";
        if (booleanFields.has(header)) {
          row[header as keyof ExerciseCSVData] = value.toLowerCase() === "true";
        } else if (arrayFields.has(header)) {
          row[header as keyof ExerciseCSVData] = value; // Keep as comma-separated string for editing
        } else if (
          !textFields.has(header) &&
          !isNaN(parseFloat(value))
        ) {
          row[header as keyof ExerciseCSVData] = parseFloat(value);
        } else {
          row[header as keyof ExerciseCSVData] = value;
        }
      });
      data.push(row as ExerciseCSVData);
    }
    return data;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;

      if (!text || text.trim() === "") {
        toast({
          title: t("exercise.exerciseImportCSV.importError", "Import Error"),
          description: t("exercise.exerciseImportCSV.emptyFile", "The selected file is empty."),
          variant: "destructive",
        });
        return;
      }

      const lines = text.split("\n");
      const fileHeaders = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ''));
      const areHeadersValid =
        requiredHeaders.length === fileHeaders.length &&
        requiredHeaders.every((value, index) => value === fileHeaders[index]);

      if (!areHeadersValid) {
        toast({
          title: t("exercise.exerciseImportCSV.invalidCSVFormat", "Invalid CSV Format"),
          description:
            t("exercise.exerciseImportCSV.invalidCSVFormatDescription", "The CSV headers do not match the required format or order. Please download the template."),
          variant: "destructive",
        });
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      const parsedData = parseCSV(text);
      if (parsedData.length > 0) {
        setHeaders(Object.keys(parsedData[0]).filter((key) => key !== "id"));
        setCsvData(parsedData);
      } else {
        toast({
          title: t("exercise.exerciseImportCSV.noDataFound", "No Data Found"),
          description: t("exercise.exerciseImportCSV.noDataFoundDescription", "The CSV file contains headers but no data rows."),
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = () => {
    const sampleData: Omit<ExerciseCSVData, "id">[] = [
      {
        name: "Push-ups",
        category: "Strength",
        calories_per_hour: 300,
        description: "Bodyweight exercise for chest, shoulders, and triceps.",
        force: "Push",
        level: "Beginner",
        mechanic: "Compound",
        equipment: "Bodyweight",
        primary_muscles: "Chest, Triceps",
        secondary_muscles: "Shoulders",
        instructions: "Start in plank position; Lower chest to floor; Push back up.",
        images: "https://example.com/pushup1.jpg,https://example.com/pushup2.jpg",
        is_custom: true,
        shared_with_public: false,
      },
    ];

    const headerString = requiredHeaders.map(h => `"${h}"`).join(",");
    const rowsString = sampleData
      .map((row) =>
        requiredHeaders
          .map((header) => {
            const value = row[header as keyof typeof row];
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(",")
      )
      .join("\n");
    const csvContent = `${headerString}\n${rowsString}`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "exercise_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleEditCell = (
    id: string,
    field: string,
    value: string | number | boolean
  ) => {
    setCsvData((prevData) =>
      prevData.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const handleDeleteRow = (id: string) => {
    setCsvData((prevData) => prevData.filter((row) => row.id !== id));
  };

  const handleAddNewRow = () => {
    const newRow: ExerciseCSVData = {
      id: generateUniqueId(),
      name: "",
      category: "",
      calories_per_hour: 0,
      description: "",
      force: "",
      level: "",
      mechanic: "",
      equipment: "",
      primary_muscles: "",
      secondary_muscles: "",
      instructions: "",
      images: "",
      is_custom: true,
      shared_with_public: false,
    };
    if (headers.length === 0) {
      setHeaders(requiredHeaders);
    }
    setCsvData((prev) => [...prev, newRow]);
  };

  const clearData = () => {
    setCsvData([]);
    setHeaders([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalidRow = csvData.find(
      (row) => !row.name || String(row.name).trim() === ""
    );
    if (invalidRow) {
      toast({
        title: t("exercise.exerciseImportCSV.validationError", "Validation Error"),
        description: t("exercise.exerciseImportCSV.nameEmptyError", "The 'name' field cannot be empty."),
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    const dataForBackend = csvData.map(({ id, ...rest }) => rest);
    try {
      await onSave(dataForBackend);
    } catch (error) {
      console.error(
        "An error occurred while the parent was handling the save operation:",
        error
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("exercise.exerciseImportCSV.importExerciseData", "Import Exercise Data")}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-6 p-4 border rounded-lg bg-muted/50">
          <h3 className="text-lg font-semibold mb-2">{t("exercise.exerciseImportCSV.standardValuesForDropdowns", "Standard Values for Dropdowns")}</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {t("exercise.exerciseImportCSV.standardValuesDescription", "When importing exercises, ensure that values for 'Level', 'Force', and 'Mechanic' match these standard options. You can click the copy icon to quickly copy the list of valid values for each field.")}
          </p>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <h4 className="font-medium mb-1">{t("exercise.exerciseImportCSV.levelLabel", "Level:")}</h4>
              <div className="flex flex-wrap gap-2">
                {["beginner", "intermediate", "expert"].map((value) => (
                  <TooltipProvider key={value}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 flex items-center gap-1"
                          onClick={() => {
                            navigator.clipboard.writeText(value);
                            toast({ title: t("exercise.exerciseImportCSV.copied", "Copied!"), description: t("exercise.exerciseImportCSV.copiedToClipboard", `'${value}' copied to clipboard.`, { value }) });
                          }}
                        >
                          {value} <Copy className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("exercise.exerciseImportCSV.copyTooltip", "Copy '{{value}}'", { value })}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-1">{t("exercise.exerciseImportCSV.forceLabel", "Force:")}</h4>
              <div className="flex flex-wrap gap-2">
                {["pull", "push", "static"].map((value) => (
                  <TooltipProvider key={value}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 flex items-center gap-1"
                          onClick={() => {
                            navigator.clipboard.writeText(value);
                            toast({ title: t("exercise.exerciseImportCSV.copied", "Copied!"), description: t("exercise.exerciseImportCSV.copiedToClipboard", `'${value}' copied to clipboard.`, { value }) });
                          }}
                        >
                          {value} <Copy className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("exercise.exerciseImportCSV.copyTooltip", "Copy '{{value}}'", { value })}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-1">{t("exercise.exerciseImportCSV.mechanicLabel", "Mechanic:")}</h4>
              <div className="flex flex-wrap gap-2">
                {["isolation", "compound"].map((value) => (
                  <TooltipProvider key={value}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 flex items-center gap-1"
                          onClick={() => {
                            navigator.clipboard.writeText(value);
                            toast({ title: t("exercise.exerciseImportCSV.copied", "Copied!"), description: t("exercise.exerciseImportCSV.copiedToClipboard", `'${value}' copied to clipboard.`, { value }) });
                          }}
                        >
                          {value} <Copy className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{t("exercise.exerciseImportCSV.copyTooltip", "Copy '{{value}}'", { value })}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                ))}
              </div>
            </div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleAddNewRow}
                variant="outline"
                className="flex items-center justify-center gap-2"
              >
                <Plus size={16} /> {t("exercise.exerciseImportCSV.addRow", "Add Row")}
              </Button>
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="flex items-center justify-center gap-2"
              >
                <Upload size={16} /> {t("exercise.exerciseImportCSV.uploadCSV", "Upload CSV")}
              </Button>
              <Button
                type="button"
                onClick={handleDownloadTemplate}
                variant="outline"
                className="flex items-center justify-center gap-2"
              >
                <Download size={16} /> {t("exercise.exerciseImportCSV.downloadTemplate", "Download Template")}
              </Button>
              {csvData.length > 0 && (
                <Button
                  type="button"
                  onClick={clearData}
                  variant="destructive"
                  className="flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} /> {t("exercise.exerciseImportCSV.clearData", "Clear Data")}
                </Button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
            />
            {csvData.length > 0 && (
              <div className="text-sm text-green-600">
                {t("exercise.exerciseImportCSV.loadedRecords", "Successfully loaded {{count}} records.", { count: csvData.length })}
              </div>
            )}
          </div>

          {csvData.length > 0 && (
            <div className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="hidden md:table-header-group">
                    <tr>
                      {headers.map((header) => (
                        <th
                          key={header}
                          className="px-4 py-2 text-left bg-background font-medium whitespace-nowrap capitalize"
                        >
                          {header.replace(/_/g, " ")}
                        </th>
                      ))}
                      <th className="px-4 py-2 text-left bg-background font-medium whitespace-nowrap">
                        {t("exercise.exerciseImportCSV.actions", "Actions")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.map((row) => (
                        <tr
                          key={row.id}
                          className="block md:table-row mb-4 md:mb-0 border rounded-lg overflow-hidden md:border-0 md:rounded-none md:border-t hover:bg-muted/50"
                        >
                          {headers.map((header) => (
                            <td
                              key={header}
                              className="block md:table-cell px-4 py-3 md:py-2 md:whitespace-nowrap border-b md:border-0 last:border-b-0"
                            >
                              <span className="font-medium capitalize text-muted-foreground md:hidden mb-1 block">
                                {header.replace(/_/g, " ")}
                              </span>

                            {booleanFields.has(header) ? (
                              <Select
                                value={String(row[header as keyof ExerciseCSVData])}
                                onValueChange={(value) =>
                                  handleEditCell(
                                    row.id,
                                    header,
                                    value === "true"
                                  )
                                }
                              >
                                <SelectTrigger className="w-full md:w-[100px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="true">True</SelectItem>
                                  <SelectItem value="false">False</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : textFields.has(header) || arrayFields.has(header) ? (
                              <Input
                                type="text"
                                value={(row[header as keyof ExerciseCSVData] as string) || ""}
                                onChange={(e) =>
                                  handleEditCell(row.id, header, e.target.value)
                                }
                                required={header === "name"}
                                className="w-full md:w-40"
                              />
                            ) : (
                              <Input
                                type="number"
                                value={(row[header as keyof ExerciseCSVData] as number) || 0}
                                onChange={(e) =>
                                  handleEditCell(
                                    row.id,
                                    header,
                                    e.target.valueAsNumber || 0
                                  )
                                }
                                min="0"
                                step="any"
                                className="w-full md:w-20"
                              />
                            )}
                          </td>
                        ))}
                        <td className="block md:table-cell px-4 py-3 md:py-2">
                          <span className="font-medium capitalize text-muted-foreground md:hidden mb-1 block">
                            {t("exercise.exerciseImportCSV.actions", "Actions")}
                          </span>
                          <Button
                            type="button"
                            onClick={() => handleDeleteRow(row.id)}
                            variant="destructive"
                            size="sm"
                            className="w-full md:w-auto"
                          >
                            <Trash2 size={14} className="md:mr-0" />
                            <span className="ml-2 md:hidden">{t("exercise.exerciseImportCSV.deleteRow", "Delete Row")}</span>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || csvData.length === 0}
            className="w-full flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                {t("exercise.exerciseImportCSV.importing", "Importing...")}
              </>
            ) : (
              <>
                <Upload size={16} /> {t("exercise.exerciseImportCSV.import", "Import")}
                {csvData.length > 0 ? `${csvData.length} ${t("exercise.exerciseImportCSV.records", "Records")}` : t("exercise.exerciseImportCSV.data", "Data")}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ImportFromCSV;

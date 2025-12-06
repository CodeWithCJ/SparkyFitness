import { useState, useRef } from "react";
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
import { Plus, Download, Upload, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { usePreferences } from "@/contexts/PreferencesContext"; // Import usePreferences

interface ImportFromCSVProps {
  onSave: (foodData: Omit<CSVData, "id">[]) => Promise<void>;
}

export interface CSVData {
  id: string;
  [key: string]: string | number | boolean;
}

const generateUniqueId = () =>
  `temp_${Math.random().toString(36).substr(2, 9)}`;

const servingUnitOptions = [
  "g",
  "kg",
  "mg",
  "oz",
  "lb",
  "ml",
  "l",
  "cup",
  "tbsp",
  "tsp",
  "piece",
  "slice",
  "serving",
  "can",
  "bottle",
  "packet",
  "bag",
  "bowl",
  "plate",
  "handful",
  "scoop",
  "bar",
  "stick",
];

const ImportFromCSV = ({ onSave }: ImportFromCSVProps) => {
  const { user } = useAuth();
  const { energyUnit, convertEnergy } = usePreferences();

  const getEnergyUnitString = (unit: 'kcal' | 'kJ'): string => {
    // This component does not import useTranslation, so we'll hardcode or pass t() from parent if it were needed for translation
    return unit === 'kcal' ? 'kcal' : 'kJ';
  };


  const [loading, setLoading] = useState(false);
  const [csvData, setCsvData] = useState<CSVData[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const textFields = new Set(["name", "brand"]);
  const booleanFields = new Set([
    "shared_with_public",
    "is_quick_food",
    "is_default",
    "is_custom",
  ]);

  const requiredHeaders = [
    "name",
    "brand",
    "is_custom",
    "shared_with_public",
    "is_quick_food",
    "serving_size",
    "serving_unit",
    "calories", // Assumed to be in kcal
    "protein",
    "carbs",
    "fat",
    "saturated_fat",
    "polyunsaturated_fat",
    "monounsaturated_fat",
    "trans_fat",
    "cholesterol",
    "sodium",
    "potassium",
    "dietary_fiber",
    "sugars",
    "vitamin_a",
    "vitamin_c",
    "calcium",
    "iron",
    "is_default",
  ];

  const parseCSV = (text: string): CSVData[] => {
    const lines = text.split("\n").filter((line) => line.trim() !== "");
    if (lines.length < 2) return [];

    const parsedHeaders = lines[0].split(",").map((header) => header.trim());
    const data: CSVData[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((value) => value.trim());
      const row: CSVData = { id: generateUniqueId() };

      parsedHeaders.forEach((header, index) => {
        const value = values[index] || "";
        if (booleanFields.has(header)) {
          row[header] = value.toLowerCase() === "true";
        } else if (
          !textFields.has(header) &&
          header !== "serving_unit" &&
          !isNaN(parseFloat(value))
        ) {
          row[header] = parseFloat(value); // All numeric values (including calories) are treated as kcal
        } else {
          row[header] = value;
        }
      });
      data.push(row);
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
          title: "Import Error",
          description: "The selected file is empty.",
          variant: "destructive",
        });
        return;
      }

      const lines = text.split("\n");
      const fileHeaders = lines[0].split(",").map((h) => h.trim());
      const areHeadersValid =
        requiredHeaders.length === fileHeaders.length &&
        requiredHeaders.every((value, index) => value === fileHeaders[index]);

      if (!areHeadersValid) {
        toast({
          title: "Invalid CSV Format",
          description:
            "The CSV headers do not match the required format or order. Please download the template.",
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
          title: "No Data Found",
          description: "The CSV file contains headers but no data rows.",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
  };

  const handleDownloadSample = () => {
    const sampleData = [
      {
        name: "Sparky Sample Food",
        brand: "Sparky Sample Brand",
        is_custom: "TRUE",
        shared_with_public: "",
        is_quick_food: "FALSE",
        serving_size: 231,
        serving_unit: "slice",
        calories: 431, // kcal
        protein: 379,
        carbs: 204,
        fat: 610,
        saturated_fat: 554,
        polyunsaturated_fat: 0,
        monounsaturated_fat: 0,
        trans_fat: 436,
        cholesterol: 81,
        sodium: 317,
        potassium: 64,
        dietary_fiber: 618,
        sugars: 595,
        vitamin_a: 563,
        vitamin_c: 635,
        calcium: 360,
        iron: 366,
        is_default: "TRUE",
      },
    ];

    const headerString = requiredHeaders.join(",");
    const rowsString = sampleData
      .map((row) =>
        requiredHeaders
          .map((header) => row[header as keyof typeof row])
          .join(",")
      )
      .join("\n");
    const csvContent = `${headerString}\n${rowsString}`;

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "food_template.csv");
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
    const newRow: CSVData = {
      id: generateUniqueId(),
      name: "",
      brand: "",
      is_custom: true,
      shared_with_public: false,
      is_quick_food: false,
      serving_size: 100,
      serving_unit: "g",
      calories: 0, // kcal
      protein: 0,
      carbs: 0,
      fat: 0,
      saturated_fat: 0,
      polyunsaturated_fat: 0,
      monounsaturated_fat: 0,
      trans_fat: 0,
      cholesterol: 0,
      sodium: 0,
      potassium: 0,
      dietary_fiber: 0,
      sugars: 0,
      vitamin_a: 0,
      vitamin_c: 0,
      calcium: 0,
      iron: 0,
      is_default: csvData.length === 0,
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
        title: "Validation Error",
        description: "The 'name' field cannot be empty.",
        variant: "destructive",
      });
      return;
    }
    setLoading(true);
    const dataForBackend = csvData.map(({ id, ...rest }) => rest);
    // console.log(dataForBackend);
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
        <CardTitle>Import Food Data</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleAddNewRow}
                variant="outline"
                className="flex items-center justify-center gap-2"
              >
                <Plus size={16} /> Add Row
              </Button>
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                variant="outline"
                className="flex items-center justify-center gap-2"
              >
                <Upload size={16} /> Upload CSV
              </Button>
              <Button
                type="button"
                onClick={handleDownloadSample}
                variant="outline"
                className="flex items-center justify-center gap-2"
              >
                <Download size={16} /> Download Template
              </Button>
              {csvData.length > 0 && (
                <Button
                  type="button"
                  onClick={clearData}
                  variant="destructive"
                  className="flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} /> Clear Data
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
                Successfully loaded {csvData.length} records.
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
                        Actions
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

                            {header === "serving_unit" ? (
                              <Select
                                value={String(row[header]) || "g"}
                                onValueChange={(value) =>
                                  handleEditCell(row.id, header, value)
                                }
                              >
                                <SelectTrigger className="w-full md:w-[100px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {servingUnitOptions.map((unit) => (
                                    <SelectItem key={unit} value={unit}>
                                      {unit}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : booleanFields.has(header) ? (
                              <Select
                                value={String(row[header])}
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
                            ) : textFields.has(header) ? (
                              <Input
                                type="text"
                                value={(row[header] as string) || ""}
                                onChange={(e) =>
                                  handleEditCell(row.id, header, e.target.value)
                                }
                                required={header === "name"}
                                className="w-full md:w-40"
                              />
                            ) : ( // Generic number input
                              <Input
                                type="number"
                                value={
                                  (header === "calories" && row[header] !== undefined)
                                    ? Math.round(convertEnergy(row[header] as number, 'kcal', energyUnit))
                                    : (row[header] as number) || 0
                                }
                                onChange={(e) =>
                                  handleEditCell(
                                    row.id,
                                    header,
                                    (header === "calories" && e.target.valueAsNumber)
                                      ? convertEnergy(e.target.valueAsNumber, energyUnit, 'kcal')
                                      : e.target.valueAsNumber || 0
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
                            Actions
                          </span>
                          <Button
                            type="button"
                            onClick={() => handleDeleteRow(row.id)}
                            variant="destructive"
                            size="sm"
                            className="w-full md:w-auto"
                          >
                            <Trash2 size={14} className="md:mr-0" />
                            <span className="ml-2 md:hidden">Delete Row</span>
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
                Importing...
              </>
            ) : (
              <>
                <Upload size={16} /> Import
                {csvData.length > 0 ? `${csvData.length} Records` : "Data"}
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default ImportFromCSV;

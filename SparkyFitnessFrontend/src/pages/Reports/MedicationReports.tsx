import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend,
} from 'recharts';
import {
  Activity,
  Scale,
  FileText,
  Download,
  Info,
  CheckCircle,
  AlertTriangle,
  Settings,
  Smile,
  Meh,
  Frown,
} from 'lucide-react';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useActiveUser } from '@/contexts/ActiveUserContext';
import { useProfileQuery } from '@/hooks/Settings/useProfile';
import {
  getHydrationConstipationCorrelation,
  getProteinNauseaCorrelation,
  getSleepFatigueCorrelation,
  getDoseSymptomCorrelation,
  CustomCategoriesResponse,
  CustomMeasurementsResponse,
  compareDays,
  addDays,
  instantToDay,
} from '@workspace/shared';
import {
  useMedicationDisplayPreferences,
  useUpsertMedicationDisplayPreferenceMutation,
} from '@/hooks/useMedicationDisplayPreferences';
import Papa from 'papaparse';

import type {
  Medication,
  MedicationEntry,
  InjectionEntry,
  TitrationStep,
} from '@/types/medications';

interface SymptomEntry {
  id: string;
  entry_date: string;
  symptom_name_snapshot: string;
  severity: number;
  body_location?: string | null;
  context_text?: string | null;
}

interface AlignedDailyDataPoint {
  date: string;
  displayDate: string;
  nauseaSeverity: number;
  constipationSeverity: number;
  fatigueSeverity: number;
  glp1Dose: number;
  weight: number | null;
  adherencePercent: number | null;
  glpHunger: number | null;
  glpFoodNoise: number | null;
  glpFullness: number | null;
  glpEnergy: number | null;
}

interface MedicationReportsProps {
  startDate: string;
  endDate: string;
  nutritionData: Array<{
    date: string;
    water?: number | null;
    protein?: number | null;
  }>;
  tabularData: unknown[];
  exerciseEntries: unknown[];
  measurementData: Array<{
    entry_date: string;
    weight: number | string | null;
  }>;
  customCategories: CustomCategoriesResponse[];
  customMeasurementsData: CustomMeasurementsResponse[];
  sleepAnalyticsData: Array<{
    date: string;
    total_sleep_duration_hours?: number | null;
  }>;
  medications: Medication[];
  medicationEntries: MedicationEntry[];
  symptomEntries: SymptomEntry[];
  injections: InjectionEntry[];
  titrationSteps: TitrationStep[];
}

const DEFAULT_VISIBLE_ITEMS = [
  'nausea_vs_dose_chart',
  'weight_vs_goal_chart',
  'adherence_chart',
  'glp1_checkin_chart',
  'hydration_constipation_card',
  'protein_nausea_card',
  'sleep_fatigue_card',
  'dose_nausea_card',
];

const MedicationReports = ({
  startDate,
  endDate,
  nutritionData,
  measurementData,
  customCategories = [],
  customMeasurementsData = [],
  sleepAnalyticsData,
  medications,
  medicationEntries,
  symptomEntries,
  injections,
  titrationSteps,
}: MedicationReportsProps) => {
  const { t } = useTranslation();
  const {
    formatDateInUserTimezone,
    weightUnit,
    convertWeight,
    timezone,
    dateFormat,
  } = usePreferences();
  const { activeUserId } = useActiveUser();
  const { data: profile } = useProfileQuery(activeUserId ?? undefined);

  // Load preferences from backend
  const { data: dbPrefs = [] } = useMedicationDisplayPreferences();
  const upsertPrefMutation = useUpsertMedicationDisplayPreferenceMutation();

  const activePref = useMemo(() => {
    return dbPrefs.find(
      (p) => p.view_group === 'reports' && p.platform === 'web'
    );
  }, [dbPrefs]);

  const visibleItems = useMemo(() => {
    return activePref ? activePref.visible_items : DEFAULT_VISIBLE_ITEMS;
  }, [activePref]);

  const isVisible = (id: string) => visibleItems.includes(id);

  const toggleItem = (id: string) => {
    const nextItems = visibleItems.includes(id)
      ? visibleItems.filter((x) => x !== id)
      : [...visibleItems, id];

    upsertPrefMutation.mutate({
      viewGroup: 'reports',
      platform: 'web',
      visibleItems: nextItems,
    });
  };

  const [showConfig, setShowConfig] = useState(false);

  // Migrate existing database preferences to include the new GLP-1 daily check-in chart by default
  useEffect(() => {
    if (
      activePref &&
      !activePref.visible_items.includes('glp1_checkin_chart')
    ) {
      const migratedKey = `migrated_glp1_checkin_chart_${activePref.id}`;
      if (!localStorage.getItem(migratedKey)) {
        localStorage.setItem(migratedKey, 'true');
        upsertPrefMutation.mutate({
          viewGroup: 'reports',
          platform: 'web',
          visibleItems: [...activePref.visible_items, 'glp1_checkin_chart'],
        });
      }
    }
  }, [activePref, upsertPrefMutation]);

  // Parse patient profile target weight
  const targetWeightConverted = useMemo(() => {
    if (!profile?.target_weight) return null;
    return convertWeight(
      Number(profile.target_weight),
      'kg',
      weightUnit === 'st_lbs' ? 'lbs' : weightUnit
    );
  }, [profile, weightUnit, convertWeight]);

  // --- KPI calculations ----------------------------------------------------
  const stats = useMemo(() => {
    // Adherence: Doses taken vs skipped
    const relevantEntries = medicationEntries.filter(
      (e) => e.status === 'taken' || e.status === 'skipped'
    );
    const taken = relevantEntries.filter((e) => e.status === 'taken').length;
    const total = relevantEntries.length;
    const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : null;

    // GLP-1 count
    const glp1InjectionsCount = injections.filter((inj) => {
      const dateStr = instantToDay(inj.injected_at, timezone);
      return dateStr && dateStr >= startDate && dateStr <= endDate;
    }).length;

    // Side effects count
    const uniqueSymptomCount = new Set(
      symptomEntries.map((s) => s.symptom_name_snapshot.toLowerCase().trim())
    ).size;

    return {
      adherenceRate,
      glp1InjectionsCount,
      uniqueSymptomCount,
    };
  }, [
    medicationEntries,
    injections,
    symptomEntries,
    startDate,
    endDate,
    timezone,
  ]);

  // --- Map and align daily data for Recharts ---------------------------------
  const alignedDailyData = useMemo(() => {
    const datesMap: Record<string, AlignedDailyDataPoint> = {};

    // Base date list
    let curr = startDate;
    while (compareDays(curr, endDate) <= 0) {
      datesMap[curr] = {
        date: curr,
        displayDate: formatDateInUserTimezone(curr, 'MMM dd'),
        nauseaSeverity: 0,
        constipationSeverity: 0,
        fatigueSeverity: 0,
        glp1Dose: 0,
        weight: null,
        adherencePercent: null,
        glpHunger: null,
        glpFoodNoise: null,
        glpFullness: null,
        glpEnergy: null,
      };
      curr = addDays(curr, 1);
    }

    // Weight logs
    measurementData.forEach((m) => {
      const dStr = m.entry_date.split('T')[0];
      if (dStr && datesMap[dStr]) {
        datesMap[dStr].weight = m.weight
          ? convertWeight(
              Number(m.weight),
              'kg',
              weightUnit === 'st_lbs' ? 'lbs' : weightUnit
            )
          : null;
      }
    });

    // Symptoms
    symptomEntries.forEach((s) => {
      const dStr = s.entry_date.split('T')[0];
      if (dStr && datesMap[dStr]) {
        const name = s.symptom_name_snapshot.toLowerCase().trim();
        const sev = Number(s.severity) || 0;
        if (name === 'nausea') {
          datesMap[dStr].nauseaSeverity = Math.max(
            datesMap[dStr].nauseaSeverity,
            sev
          );
        } else if (name === 'constipation') {
          datesMap[dStr].constipationSeverity = Math.max(
            datesMap[dStr].constipationSeverity,
            sev
          );
        } else if (name === 'fatigue') {
          datesMap[dStr].fatigueSeverity = Math.max(
            datesMap[dStr].fatigueSeverity,
            sev
          );
        }
      }
    });

    // Injections & Doses
    injections.forEach((inj) => {
      const dStr = instantToDay(inj.injected_at, timezone);
      if (dStr && datesMap[dStr]) {
        datesMap[dStr].glp1Dose =
          (datesMap[dStr].glp1Dose || 0) + (Number(inj.dose_mg) || 0);
      }
    });

    // Adherence logs per day
    const entriesByDay: Record<string, { taken: number; total: number }> = {};
    medicationEntries.forEach((e) => {
      const dStr = e.entry_date.split('T')[0];
      if (dStr) {
        if (!entriesByDay[dStr]) entriesByDay[dStr] = { taken: 0, total: 0 };
        if (e.status === 'taken') {
          entriesByDay[dStr].taken++;
          entriesByDay[dStr].total++;
        } else if (e.status === 'skipped') {
          entriesByDay[dStr].total++;
        }
      }
    });
    Object.entries(entriesByDay).forEach(([dStr, val]) => {
      if (datesMap[dStr] && val.total > 0) {
        datesMap[dStr].adherencePercent = Math.round(
          (val.taken / val.total) * 100
        );
      }
    });

    // Custom Measurements for GLP-1 Check-ins
    const hungerCat = customCategories.find((c) => c.name === 'GLP Hunger');
    const foodNoiseCat = customCategories.find(
      (c) => c.name === 'GLP Food Noise'
    );
    const fullnessCat = customCategories.find((c) => c.name === 'GLP Fullness');
    const energyCat = customCategories.find((c) => c.name === 'GLP Energy');

    customMeasurementsData.forEach((m) => {
      const dStr = m.entry_date.split('T')[0];
      if (dStr && datesMap[dStr]) {
        const val = Number(m.value);
        if (!isNaN(val)) {
          if (hungerCat && m.category_id === hungerCat.id) {
            datesMap[dStr].glpHunger = val;
          } else if (foodNoiseCat && m.category_id === foodNoiseCat.id) {
            datesMap[dStr].glpFoodNoise = val;
          } else if (fullnessCat && m.category_id === fullnessCat.id) {
            datesMap[dStr].glpFullness = val;
          } else if (energyCat && m.category_id === energyCat.id) {
            datesMap[dStr].glpEnergy = val;
          }
        }
      }
    });

    return Object.values(datesMap).sort((a, b) => a.date.localeCompare(b.date));
  }, [
    startDate,
    endDate,
    symptomEntries,
    injections,
    medicationEntries,
    measurementData,
    customCategories,
    customMeasurementsData,
    weightUnit,
    convertWeight,
    formatDateInUserTimezone,
    timezone,
  ]);

  // --- Compute Correlation Cards --------------------------------------------
  const hydrationConstipation = useMemo(() => {
    return getHydrationConstipationCorrelation(nutritionData, symptomEntries);
  }, [nutritionData, symptomEntries]);

  const proteinNausea = useMemo(() => {
    return getProteinNauseaCorrelation(nutritionData, symptomEntries);
  }, [nutritionData, symptomEntries]);

  const sleepFatigue = useMemo(() => {
    return getSleepFatigueCorrelation(sleepAnalyticsData, symptomEntries);
  }, [sleepAnalyticsData, symptomEntries]);

  const doseNausea = useMemo(() => {
    const alignedDoses = alignedDailyData.map((d) => ({
      date: d.date,
      dose: d.glp1Dose,
    }));
    return getDoseSymptomCorrelation(alignedDoses, symptomEntries, 'nausea');
  }, [alignedDailyData, symptomEntries]);

  // --- Export utilities ------------------------------------------------------
  const exportPrescriberCSV = () => {
    const csvRows = alignedDailyData.map((d) => {
      const waterLog = nutritionData.find((n) => n.date === d.date);
      const sleepLog = sleepAnalyticsData.find((s) => s.date === d.date);
      return {
        Date: d.date,
        'Medication Dose (mg)': d.glp1Dose || 0,
        'Adherence Rate (%)':
          d.adherencePercent !== null ? `${d.adherencePercent}%` : 'N/A',
        'Nausea Severity (1-10)': d.nauseaSeverity || 0,
        'Constipation Severity (1-10)': d.constipationSeverity || 0,
        'Fatigue Severity (1-10)': d.fatigueSeverity || 0,
        [`Weight (${weightUnit})`]:
          d.weight !== null ? d.weight.toFixed(1) : '',
        'Water Intake (mL)': waterLog?.water || 0,
        'Protein (g)': waterLog?.protein || 0,
        'Sleep Hours': sleepLog?.total_sleep_duration_hours || 0,
      };
    });

    const csvContent = Papa.unparse(csvRows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `Prescriber_Medication_Summary_${startDate}_to_${endDate}.csv`
    );
    link.click();
  };

  const exportPrescriberPDF = () => {
    window.print();
  };

  return (
    <div className="space-y-8">
      {/* Configuration Popover */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight">
            {t('medications.reports.title', 'Medications Report')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'medications.reports.subtitle',
              'Analyze dose correlations, side effects, and adherence trends.'
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowConfig(!showConfig)}
        >
          <Settings className="w-4 h-4 mr-2" />
          {t('medications.reports.customize', 'Customize Charts')}
        </Button>
      </div>

      {showConfig && (
        <Card className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">
              {t(
                'medications.reports.configTitle',
                'Enable/Disable Visualizations'
              )}
            </CardTitle>
            <CardDescription>
              {t(
                'medications.reports.configDesc',
                'Toggle the visibility of specific charts and correlation widgets.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { id: 'nausea_vs_dose_chart', label: 'Nausea vs. Dose Chart' },
              { id: 'weight_vs_goal_chart', label: 'Weight vs. Goal Chart' },
              { id: 'adherence_chart', label: 'Adherence Trend Chart' },
              { id: 'glp1_checkin_chart', label: 'GLP-1 Daily Check-In Chart' },
              {
                id: 'hydration_constipation_card',
                label: 'Hydration vs. Constipation Card',
              },
              { id: 'protein_nausea_card', label: 'Protein vs. Nausea Card' },
              { id: 'sleep_fatigue_card', label: 'Sleep vs. Fatigue Card' },
              { id: 'dose_nausea_card', label: 'Dose size vs. Nausea Card' },
            ].map((item) => (
              <div key={item.id} className="flex items-center space-x-2">
                <Switch
                  id={item.id}
                  checked={isVisible(item.id)}
                  onCheckedChange={() => toggleItem(item.id)}
                />
                <Label htmlFor={item.id} className="text-sm font-medium">
                  {item.label}
                </Label>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>
              {t('medications.reports.kpiAdherence', 'Average Adherence')}
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {stats.adherenceRate !== null ? `${stats.adherenceRate}%` : 'N/A'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {t(
                'medications.reports.kpiAdherenceDetail',
                'Percentage of scheduled doses successfully logged taken.'
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>
              {t('medications.reports.kpiGlp1', 'GLP-1 Injections')}
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-sky-600 dark:text-sky-400">
              {stats.glp1InjectionsCount}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {t(
                'medications.reports.kpiGlp1Detail',
                'Total active GLP-1 injection doses recorded in this period.'
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>
              {t(
                'medications.reports.kpiSymptomCount',
                'Reported Side-Effects'
              )}
            </CardDescription>
            <CardTitle className="text-2xl font-bold text-amber-600 dark:text-amber-400">
              {stats.uniqueSymptomCount}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {t(
                'medications.reports.kpiSymptomCountDetail',
                'Number of unique built-in or custom symptoms logged.'
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="space-y-6">
        {/* Nausea vs Dose */}
        {isVisible('nausea_vs_dose_chart') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-md">
                <Activity className="w-4 h-4 mr-2 text-rose-500" />
                {t(
                  'medications.reports.nauseaVsDose',
                  'Nausea Severity vs. GLP-1 Medication Dose'
                )}
              </CardTitle>
              <CardDescription>
                {t(
                  'medications.reports.nauseaVsDoseDesc',
                  'Tracks max nausea severity (bars) relative to injection dose timings (line).'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={alignedDailyData}
                  margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="displayDate" fontSize={10} />
                  <YAxis
                    yAxisId="left"
                    orientation="left"
                    stroke="#ec4899"
                    domain={[0, 10]}
                    fontSize={10}
                    label={{
                      value: 'Nausea Severity',
                      angle: -90,
                      position: 'insideLeft',
                      style: { textAnchor: 'middle', fontSize: 10 },
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#0ea5e9"
                    fontSize={10}
                    label={{
                      value: 'Dose (mg)',
                      angle: 90,
                      position: 'insideRight',
                      style: { textAnchor: 'middle', fontSize: 10 },
                    }}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar
                    yAxisId="left"
                    dataKey="nauseaSeverity"
                    name="Nausea Severity"
                    fill="#ec4899"
                    barSize={16}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="glp1Dose"
                    name="Medication Dose (mg)"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={{ r: 4 }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Weight vs Goal */}
        {isVisible('weight_vs_goal_chart') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-md">
                <Scale className="w-4 h-4 mr-2 text-emerald-500" />
                {t(
                  'medications.reports.weightVsGoal',
                  `Weight Trend vs. Target Weight (${weightUnit})`
                )}
              </CardTitle>
              <CardDescription>
                {t(
                  'medications.reports.weightVsGoalDesc',
                  'Visualizes daily weight measurements compared to your overall target weight.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={alignedDailyData.filter((d) => d.weight !== null)}
                  margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="displayDate" fontSize={10} />
                  <YAxis domain={['auto', 'auto']} fontSize={10} />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="weight"
                    name={`Weight (${weightUnit})`}
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                  />
                  {targetWeightConverted && (
                    <Line
                      type="monotone"
                      dataKey={() => targetWeightConverted}
                      name={`Target Weight (${weightUnit})`}
                      stroke="#94a3b8"
                      strokeDasharray="5 5"
                      strokeWidth={1.5}
                      dot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Adherence Chart */}
        {isVisible('adherence_chart') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-md">
                <CheckCircle className="w-4 h-4 mr-2 text-indigo-500" />
                {t(
                  'medications.reports.adherenceTrend',
                  'Daily Adherence Trend (%)'
                )}
              </CardTitle>
              <CardDescription>
                {t(
                  'medications.reports.adherenceTrendDesc',
                  'Plots daily adherence percentage (percentage of scheduled doses taken).'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={alignedDailyData.filter(
                    (d) => d.adherencePercent !== null
                  )}
                  margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="displayDate" fontSize={10} />
                  <YAxis domain={[0, 100]} fontSize={10} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="adherencePercent"
                    name="Adherence Rate"
                    fill="#6366f1"
                    radius={[4, 4, 0, 0]}
                    barSize={20}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* GLP-1 Daily Check-In Trends */}
        {isVisible('glp1_checkin_chart') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-md">
                <Activity className="w-4 h-4 mr-2 text-pink-500" />
                {t(
                  'medications.reports.glp1CheckinTrends',
                  'GLP-1 Daily Check-In Trends'
                )}
              </CardTitle>
              <CardDescription>
                {t(
                  'medications.reports.glp1CheckinTrendsDesc',
                  'Tracks subjective hunger, food noise, fullness, and energy levels (0-10) alongside GLP-1 doses.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={alignedDailyData}
                  margin={{ top: 10, right: 30, left: 10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="displayDate" fontSize={10} />
                  <YAxis
                    yAxisId="left"
                    domain={[0, 10]}
                    fontSize={10}
                    label={{
                      value: 'Check-In Score (0-10)',
                      angle: -90,
                      position: 'insideLeft',
                      style: { textAnchor: 'middle', fontSize: 10 },
                    }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#0ea5e9"
                    fontSize={10}
                    label={{
                      value: 'Dose (mg)',
                      angle: 90,
                      position: 'insideRight',
                      style: { textAnchor: 'middle', fontSize: 10 },
                    }}
                  />
                  <Tooltip />
                  <Legend />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="glpHunger"
                    name="Hunger"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="glpFoodNoise"
                    name="Food Noise"
                    stroke="#8b5cf6"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="glpFullness"
                    name="Fullness"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="glpEnergy"
                    name="Energy"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                  <Line
                    yAxisId="right"
                    type="stepAfter"
                    dataKey="glp1Dose"
                    name="Dose (mg)"
                    stroke="#0ea5e9"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Correlation Grid Section */}
      <div>
        <h3 className="text-md font-bold mb-4 flex items-center">
          <Info className="w-4 h-4 mr-2 text-indigo-500" />
          {t(
            'medications.reports.correlationsTitle',
            'Informational Symptom & Side-Effect Correlations'
          )}
        </h3>
        <p className="text-xs text-muted-foreground mb-6">
          {t(
            'medications.reports.correlationsDisclaimer',
            'Note: Correlations are purely descriptive calculations over the chosen date range and do not imply clinical causality.'
          )}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Hydration vs Constipation */}
          {isVisible('hydration_constipation_card') && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-sm font-semibold">
                    {t(
                      'medications.reports.corrHydration',
                      'Hydration vs. Constipation'
                    )}
                  </CardTitle>
                  {hydrationConstipation.r !== 0 && (
                    <Badge
                      variant={
                        hydrationConstipation.strength === 'strong'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {hydrationConstipation.strength} correlation
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    Confidence Score:
                  </span>
                  <span className="text-sm font-bold">
                    {hydrationConstipation.confidence}%
                  </span>
                </div>
                <div className="flex gap-3 bg-slate-50 dark:bg-slate-900 p-3 rounded-md border border-slate-100 dark:border-slate-800 text-xs">
                  {hydrationConstipation.r < 0 ? (
                    <>
                      <Smile className="w-5 h-5 text-emerald-500 shrink-0" />
                      <p>
                        <strong>Strong Hydration Benefit:</strong> Higher water
                        intake correlates with lower constipation severity. Stay
                        hydrated to reduce bowel side effects.
                      </p>
                    </>
                  ) : hydrationConstipation.r > 0 ? (
                    <>
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                      <p>
                        <strong>Unexpected positive association:</strong>{' '}
                        Increase fluid intake actively to aid high fiber or
                        medication responses.
                      </p>
                    </>
                  ) : (
                    <>
                      <Meh className="w-5 h-5 text-slate-400 shrink-0" />
                      <p>
                        Insufficient data points to map relationship. Keep
                        tracking water and symptoms.
                      </p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Protein vs Nausea */}
          {isVisible('protein_nausea_card') && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-sm font-semibold">
                    {t(
                      'medications.reports.corrProtein',
                      'Protein Intake vs. Nausea'
                    )}
                  </CardTitle>
                  {proteinNausea.r !== 0 && (
                    <Badge
                      variant={
                        proteinNausea.strength === 'strong'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {proteinNausea.strength} correlation
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    Confidence Score:
                  </span>
                  <span className="text-sm font-bold">
                    {proteinNausea.confidence}%
                  </span>
                </div>
                <div className="flex gap-3 bg-slate-50 dark:bg-slate-900 p-3 rounded-md border border-slate-100 dark:border-slate-800 text-xs">
                  {proteinNausea.r < 0 ? (
                    <>
                      <Smile className="w-5 h-5 text-emerald-500 shrink-0" />
                      <p>
                        <strong>Protein Tolerance:</strong> Higher daily protein
                        intake is associated with lower nausea levels. Keep
                        eating protein-rich lean meals.
                      </p>
                    </>
                  ) : proteinNausea.r > 0 ? (
                    <>
                      <Frown className="w-5 h-5 text-rose-500 shrink-0" />
                      <p>
                        <strong>Reduced Intake:</strong> Nausea spikes
                        correspond to days with lower protein logs, likely due
                        to suppressed appetite.
                      </p>
                    </>
                  ) : (
                    <>
                      <Meh className="w-5 h-5 text-slate-400 shrink-0" />
                      <p>
                        Insufficient data. Log daily food items and nausea
                        side-effects to map correlations.
                      </p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Sleep vs Fatigue */}
          {isVisible('sleep_fatigue_card') && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-sm font-semibold">
                    {t(
                      'medications.reports.corrSleep',
                      'Sleep Duration vs. Fatigue'
                    )}
                  </CardTitle>
                  {sleepFatigue.r !== 0 && (
                    <Badge
                      variant={
                        sleepFatigue.strength === 'strong'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {sleepFatigue.strength} correlation
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    Confidence Score:
                  </span>
                  <span className="text-sm font-bold">
                    {sleepFatigue.confidence}%
                  </span>
                </div>
                <div className="flex gap-3 bg-slate-50 dark:bg-slate-900 p-3 rounded-md border border-slate-100 dark:border-slate-800 text-xs">
                  {sleepFatigue.r < 0 ? (
                    <>
                      <Smile className="w-5 h-5 text-emerald-500 shrink-0" />
                      <p>
                        <strong>Rest Benefit:</strong> Increased sleep duration
                        correlates with lower fatigue severity. Ensure
                        consistent bedtime habits.
                      </p>
                    </>
                  ) : sleepFatigue.r > 0 ? (
                    <>
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                      <p>
                        <strong>Hypersomnia association:</strong> Higher fatigue
                        might be triggering longer sleep requirements or
                        bed-rest periods.
                      </p>
                    </>
                  ) : (
                    <>
                      <Meh className="w-5 h-5 text-slate-400 shrink-0" />
                      <p>
                        Insufficient sleep or fatigue logs to compute
                        correlation in this range.
                      </p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dose size vs Nausea */}
          {isVisible('dose_nausea_card') && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-sm font-semibold">
                    {t(
                      'medications.reports.corrDose',
                      'GLP-1 Dose vs. Nausea Severity'
                    )}
                  </CardTitle>
                  {doseNausea.r !== 0 && (
                    <Badge
                      variant={
                        doseNausea.strength === 'strong'
                          ? 'destructive'
                          : 'secondary'
                      }
                    >
                      {doseNausea.strength} correlation
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    Confidence Score:
                  </span>
                  <span className="text-sm font-bold">
                    {doseNausea.confidence}%
                  </span>
                </div>
                <div className="flex gap-3 bg-slate-50 dark:bg-slate-900 p-3 rounded-md border border-slate-100 dark:border-slate-800 text-xs">
                  {doseNausea.r > 0 ? (
                    <>
                      <Frown className="w-5 h-5 text-rose-500 shrink-0" />
                      <p>
                        <strong>Dose-Dependent Nausea:</strong> Higher
                        medication doses correlate with increased nausea
                        severity. Consider discussing titration steps or split
                        schedules.
                      </p>
                    </>
                  ) : doseNausea.r < 0 ? (
                    <>
                      <Smile className="w-5 h-5 text-emerald-500 shrink-0" />
                      <p>
                        <strong>Adaptation Benefit:</strong> No positive
                        correlation. The body has adapted well to the dose
                        levels without side effects.
                      </p>
                    </>
                  ) : (
                    <>
                      <Meh className="w-5 h-5 text-slate-400 shrink-0" />
                      <p>
                        Requires active GLP-1 dose records and logged nausea
                        logs in this date range.
                      </p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Provider-Ready Export Card */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="flex items-center text-md">
            <FileText className="w-4 h-4 mr-2 text-indigo-500" />
            {t(
              'medications.reports.exportTitle',
              'Prescriber-Ready Data Export'
            )}
          </CardTitle>
          <CardDescription>
            {t(
              'medications.reports.exportDesc',
              'Download a coherent report including medication details, logs, schedules, symptoms, and weight data for your doctor.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button variant="default" onClick={exportPrescriberPDF}>
            <FileText className="w-4 h-4 mr-2" />
            {t('medications.reports.printPDF', 'Print / Save PDF Report')}
          </Button>
          <Button variant="secondary" onClick={exportPrescriberCSV}>
            <Download className="w-4 h-4 mr-2" />
            {t('medications.reports.downloadCSV', 'Download CSV Data')}
          </Button>
        </CardContent>
      </Card>

      {/* Printable Report Outline (Visible only during printing) */}
      <div className="hidden print:block space-y-8 p-8 max-w-4xl mx-auto bg-white text-slate-900">
        <div className="border-b-2 border-slate-300 pb-4">
          <h1 className="text-2xl font-bold">
            {t('medications.print.header', 'Prescriber Medication Report')}
          </h1>
          <p className="text-sm text-slate-500">
            {t('medications.print.dates', 'Reporting Period:')} {startDate} to{' '}
            {endDate}
          </p>
        </div>

        {/* Patient Info */}
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <p>
              <strong>Name:</strong> {profile?.full_name || 'Patient'}
            </p>
            <p>
              <strong>Target Weight:</strong>{' '}
              {targetWeightConverted
                ? `${targetWeightConverted.toFixed(1)} ${weightUnit}`
                : 'Not set'}
            </p>
          </div>
          <div>
            <p>
              <strong>Adherence Rate:</strong>{' '}
              {stats.adherenceRate !== null ? `${stats.adherenceRate}%` : 'N/A'}
            </p>
            <p>
              <strong>Report Date:</strong>{' '}
              {formatDateInUserTimezone(new Date(), dateFormat)}
            </p>
          </div>
        </div>

        {/* Medications list */}
        <div>
          <h2 className="text-sm font-bold border-b border-slate-200 pb-1 mb-2">
            Active Medications
          </h2>
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="py-1">Medication</th>
                <th className="py-1">Type</th>
                <th className="py-1">Strength</th>
                <th className="py-1">Frequency</th>
                <th className="py-1">Prescriber</th>
              </tr>
            </thead>
            <tbody>
              {medications.map((m) => (
                <tr key={m.id} className="border-b border-slate-100">
                  <td className="py-1 font-semibold">
                    {m.display_name || m.name}
                  </td>
                  <td className="py-1">{m.type_id}</td>
                  <td className="py-1">
                    {m.strength_value} {m.strength_unit}
                  </td>
                  <td className="py-1">
                    {m.schedules && m.schedules.length > 0
                      ? m.schedules.map((s) => s.schedule_type_id).join(', ')
                      : 'PRN'}
                  </td>
                  <td className="py-1">{m.prescriber || 'N/A'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Titration Steps */}
        {titrationSteps.length > 0 && (
          <div>
            <h2 className="text-sm font-bold border-b border-slate-200 pb-1 mb-2">
              Titration & Taper Steps
            </h2>
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="py-1">Dose</th>
                  <th className="py-1">Start Date</th>
                  <th className="py-1">Weeks</th>
                  <th className="py-1">Status</th>
                  <th className="py-1">Note</th>
                </tr>
              </thead>
              <tbody>
                {titrationSteps.map((step) => (
                  <tr key={step.id} className="border-b border-slate-100">
                    <td className="py-1 font-semibold">
                      {step.dose_mg} {step.dose_unit}
                    </td>
                    <td className="py-1">{step.start_date || 'N/A'}</td>
                    <td className="py-1">{step.planned_weeks || 'N/A'}</td>
                    <td className="py-1">
                      <Badge
                        variant="outline"
                        className="capitalize text-[10px]"
                      >
                        {step.status}
                      </Badge>
                    </td>
                    <td className="py-1 text-slate-500">{step.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Recent Injection Sites / GLP-1 Injections */}
        {injections.length > 0 && (
          <div>
            <h2 className="text-sm font-bold border-b border-slate-200 pb-1 mb-2">
              Recent Injection History
            </h2>
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="py-1">Date</th>
                  <th className="py-1">Medication</th>
                  <th className="py-1">Dose (mg)</th>
                  <th className="py-1">Injection Site</th>
                  <th className="py-1">Notes</th>
                </tr>
              </thead>
              <tbody>
                {injections.slice(0, 10).map((inj) => (
                  <tr key={inj.id} className="border-b border-slate-100">
                    <td className="py-1">
                      {formatDateInUserTimezone(inj.injected_at, dateFormat)}
                    </td>
                    <td className="py-1 font-semibold">
                      {medications.find((m) => m.id === inj.medication_id)
                        ?.display_name || 'GLP-1'}
                    </td>
                    <td className="py-1">{inj.dose_mg} mg</td>
                    <td className="py-1 capitalize">
                      {inj.site?.replace('_', ' ') || '-'}
                    </td>
                    <td className="py-1 text-slate-500">{inj.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Recent Symptoms */}
        {symptomEntries.length > 0 && (
          <div>
            <h2 className="text-sm font-bold border-b border-slate-200 pb-1 mb-2">
              Recent Symptom Logs
            </h2>
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="py-1">Date</th>
                  <th className="py-1">Symptom</th>
                  <th className="py-1">Severity</th>
                  <th className="py-1">Location</th>
                  <th className="py-1">Notes / Context</th>
                </tr>
              </thead>
              <tbody>
                {symptomEntries.slice(0, 15).map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-1">
                      {formatDateInUserTimezone(s.entry_date, dateFormat)}
                    </td>
                    <td className="py-1 font-semibold capitalize">
                      {s.symptom_name_snapshot.replace('_', ' ')}
                    </td>
                    <td className="py-1">{s.severity}/10</td>
                    <td className="py-1 capitalize">
                      {s.body_location || '-'}
                    </td>
                    <td className="py-1 text-slate-500">
                      {s.context_text || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default MedicationReports;

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Utensils, Lock, Unlock, AlertTriangle, Settings } from "lucide-react";
import {
    Table,
    TableBody,
    TableCell,
    TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { ExpandedGoals } from "@/types/goals";
import { DIET_TEMPLATES, getDietTemplate } from "@/constants/dietTemplates";
import MealPercentageManager from "@/components/MealPercentageManager";
import {
    FatBreakdownAlgorithm,
    FatBreakdownAlgorithmLabels,
    MineralCalculationAlgorithm,
    MineralCalculationAlgorithmLabels,
    VitaminCalculationAlgorithm,
    VitaminCalculationAlgorithmLabels,
    SugarCalculationAlgorithm,
    SugarCalculationAlgorithmLabels,
} from '@/types/nutrientAlgorithms';
import { createGoalPreset } from '@/services/goalPresetService';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Save, PlayCircle } from "lucide-react";

import { TFunction } from "i18next";

interface PersonalPlanProps {
    plan: any;
    editedPlan: ExpandedGoals | null;
    setEditedPlan: React.Dispatch<React.SetStateAction<ExpandedGoals | null>>;
    formData: any;
    t: TFunction; // Use correct type from i18next
    localEnergyUnit: 'kcal' | 'kJ';
    setLocalEnergyUnit: (unit: 'kcal' | 'kJ') => void;
    localWaterUnit: 'ml' | 'oz' | 'liter';
    setLocalWaterUnit: (unit: 'ml' | 'oz' | 'liter') => void;
    convertEnergy: (value: number, from: string, to: string) => number;
    getEnergyUnitString: (unit: string) => string;
    convertMlToSelectedUnit: (ml: number, unit: 'ml' | 'oz' | 'liter') => number;
    convertSelectedUnitToMl: (value: number, unit: 'ml' | 'oz' | 'liter') => number;
    localSelectedDiet: string;
    setLocalSelectedDiet: (diet: string) => void;
    customPercentages: { carbs: number; protein: number; fat: number };
    setCustomPercentages: (percentages: { carbs: number; protein: number; fat: number }) => void;
    handleMacroValueChange: (macro: 'carbs' | 'protein' | 'fat', value: number) => void;
    lockedMacros: { carbs: boolean; protein: boolean; fat: boolean };
    setLockedMacros: React.Dispatch<React.SetStateAction<{ carbs: boolean; protein: boolean; fat: boolean }>>;
    localFatBreakdownAlgorithm: FatBreakdownAlgorithm;
    setLocalFatBreakdownAlgorithm: (algo: FatBreakdownAlgorithm) => void;
    localMineralAlgorithm: MineralCalculationAlgorithm;
    setLocalMineralAlgorithm: (algo: MineralCalculationAlgorithm) => void;
    localVitaminAlgorithm: VitaminCalculationAlgorithm;
    setLocalVitaminAlgorithm: (algo: VitaminCalculationAlgorithm) => void;
    localSugarAlgorithm: SugarCalculationAlgorithm;
    setLocalSugarAlgorithm: (algo: SugarCalculationAlgorithm) => void;
    handleSubmit: () => void;
    isSubmitting: boolean;
}

const PersonalPlan: React.FC<PersonalPlanProps> = ({
    plan,
    editedPlan,
    setEditedPlan,
    formData,
    t,
    localEnergyUnit,
    setLocalEnergyUnit,
    localWaterUnit,
    setLocalWaterUnit,
    convertEnergy,
    getEnergyUnitString,
    convertMlToSelectedUnit,
    convertSelectedUnitToMl,
    localSelectedDiet,
    setLocalSelectedDiet,
    customPercentages,
    setCustomPercentages,
    handleMacroValueChange,
    lockedMacros,
    setLockedMacros,
    localFatBreakdownAlgorithm,
    setLocalFatBreakdownAlgorithm,
    localMineralAlgorithm,
    setLocalMineralAlgorithm,
    localVitaminAlgorithm,
    setLocalVitaminAlgorithm,
    localSugarAlgorithm,
    setLocalSugarAlgorithm,
    handleSubmit,
    isSubmitting,
}) => {
    const [showDietApproach, setShowDietApproach] = useState(false);
    const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
    const [showMealDistribution, setShowMealDistribution] = useState(true);
    const [isSavePresetOpen, setIsSavePresetOpen] = useState(false);
    const [presetName, setPresetName] = useState("");
    const [isSavingPreset, setIsSavingPreset] = useState(false);

    const handleSavePreset = async () => {
        if (!presetName.trim()) {
            toast({
                title: t('common.error', 'Error'),
                description: t('goals.presetNameRequired', 'Please enter a name for your preset.'),
                variant: 'destructive',
            });
            return;
        }

        if (!editedPlan) return;

        setIsSavingPreset(true);
        try {
            // Create the preset
            await createGoalPreset({
                ...editedPlan,
                preset_name: presetName,
            });

            toast({
                title: t('common.success', 'Success'),
                description: t('goals.presetCreatedSuccess', 'Goal preset created successfully!'),
            });

            // After saving preset, proceed to submit the plan as the active goal (finish onboarding)
            await handleSubmit();

        } catch (error) {
            console.error("Error saving preset:", error);
            toast({
                title: t('common.error', 'Error'),
                description: t('goals.errorSavingPreset', 'Failed to save preset.'),
                variant: 'destructive',
            });
            setIsSavingPreset(false);
        }
    };

    if (!plan) return null;

    return (
        <div className="animate-in slide-in-from-bottom duration-500 pb-8">
            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-white">
                    Your Personal Plan
                </h1>
                <p className="text-gray-400 mt-2">
                    Ready to reach your goal of{" "}
                    {formData.primaryGoal.replace("_", " ")}.
                </p>
            </div>

            <Alert className="mb-6 bg-yellow-900/20 border-yellow-600/50 text-yellow-200">
                <AlertTriangle className="h-4 w-4 stroke-yellow-500" />
                <AlertDescription className="text-sm">
                    <strong>Medical Disclaimer:</strong> This plan is for informational purposes only and should not replace professional medical advice. Please consult with your doctor or a certified nutritionist before making significant changes to your diet or exercise routine.
                </AlertDescription>
            </Alert>

            <div className="bg-[#1c1c1e] rounded-2xl p-6 mb-6 text-center border border-gray-800">
                <div className="flex justify-center mb-6 bg-[#2c2c2e] p-1 rounded-lg w-fit mx-auto">
                    <button
                        onClick={() => {
                            if (localEnergyUnit !== 'kcal' && editedPlan?.calories) {
                                setEditedPlan(prev => prev ? ({ ...prev, calories: Math.round(convertEnergy(prev.calories, 'kJ', 'kcal')) }) : null);
                            }
                            setLocalEnergyUnit('kcal');
                        }}
                        className={`px-4 py-2 rounded-md transition-all ${localEnergyUnit === 'kcal' ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                    >
                        {t('settings.preferences.calories', 'Calories (kcal)')}
                    </button>
                    <button
                        onClick={() => {
                            if (localEnergyUnit !== 'kJ' && editedPlan?.calories) {
                                setEditedPlan(prev => prev ? ({ ...prev, calories: Math.round(convertEnergy(prev.calories, 'kcal', 'kJ')) }) : null);
                            }
                            setLocalEnergyUnit('kJ');
                        }}
                        className={`px-4 py-2 rounded-md transition-all ${localEnergyUnit === 'kJ' ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                    >
                        {t('settings.preferences.joules', 'Joules (kJ)')}
                    </button>
                </div>

                <p className="text-gray-400 uppercase text-sm font-bold tracking-wider mb-2">
                    Daily Calorie Budget
                </p>
                <div className="text-6xl font-extrabold text-green-500 flex justify-center">
                    <Input
                        type="number"
                        value={editedPlan?.calories ?? ''}
                        onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, calories: Number(e.target.value) }) : null)}
                        className="w-48 text-center bg-transparent border-none text-6xl text-green-500 font-extrabold focus-visible:ring-0 p-0 h-auto"
                    />
                </div>
                <p className="text-xl text-white font-medium mt-1">{getEnergyUnitString(localEnergyUnit)} / day</p>

                <div className="mt-6 pt-6 border-t border-gray-800 flex justify-between text-sm text-gray-400">
                    <span>Base BMR: {Math.round(convertEnergy(plan.bmr, 'kcal', localEnergyUnit))} {getEnergyUnitString(localEnergyUnit)}</span>

                    <span>
                        Calorie Buyback:{" "}
                        <span
                            className={
                                formData.addBurnedCalories
                                    ? "text-green-400"
                                    : "text-gray-500"
                            }
                        >
                            {formData.addBurnedCalories ? "ON" : "OFF"}
                        </span>
                    </span>
                </div>
            </div >

            {/* Diet Selection */}
            <div className="bg-[#1c1c1e] rounded-2xl border border-gray-800 mb-6">
                <button
                    onClick={() => setShowDietApproach(!showDietApproach)}
                    className="w-full p-4 flex items-center justify-between hover:bg-[#2c2c2e] transition-colors rounded-2xl"
                >
                    <div className="flex items-center gap-2">
                        <Utensils className="h-5 w-5 text-green-500" />
                        <span className="text-white font-semibold">Diet Approach</span>
                    </div>
                    <ChevronLeft className={`h-5 w-5 text-gray-400 transition-transform ${showDietApproach ? '-rotate-90' : 'rotate-180'}`} />
                </button>

                {showDietApproach && (
                    <div className="px-4 pb-4 space-y-4 border-t border-gray-800 pt-4">
                        <p className="text-gray-400 text-sm mb-4">
                            Choose a preset diet or customize your macro split
                        </p>

                        <Select
                            value={localSelectedDiet}
                            onValueChange={(value) => {
                                setLocalSelectedDiet(value);
                                if (value !== 'custom') {
                                    const template = getDietTemplate(value);
                                    setCustomPercentages({
                                        carbs: template.carbsPercentage,
                                        protein: template.proteinPercentage,
                                        fat: template.fatPercentage,
                                    });
                                }
                            }}
                        >
                            <SelectTrigger className="w-full bg-[#2c2c2e] border-gray-700 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {DIET_TEMPLATES.map((diet) => (
                                    <SelectItem key={diet.id} value={diet.id}>
                                        <div>
                                            <div className="font-semibold">{diet.name}</div>
                                            <div className="text-xs text-gray-400">
                                                {diet.carbsPercentage}% Carbs / {diet.proteinPercentage}% Protein / {diet.fatPercentage}% Fat
                                            </div>
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="mt-3 p-3 bg-[#2c2c2e] rounded-lg">
                            <p className="text-sm text-gray-300">
                                {getDietTemplate(localSelectedDiet).description}
                            </p>
                        </div>

                        {localSelectedDiet === 'custom' && (
                            <div className="mt-6 space-y-6 p-4 bg-[#2c2c2e] rounded-lg border border-gray-700">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="text-sm font-semibold text-white">Custom Macro Split</h4>
                                    <span className={`text-sm font-mono ${Math.round(customPercentages.carbs) + Math.round(customPercentages.protein) + Math.round(customPercentages.fat) === 100
                                        ? 'text-green-500'
                                        : 'text-yellow-500'
                                        }`}>
                                        Total: {Math.round(customPercentages.carbs) + Math.round(customPercentages.protein) + Math.round(customPercentages.fat)}%
                                    </span>
                                </div>

                                {/* Carbs */}
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setLockedMacros(p => ({ ...p, carbs: !p.carbs }))} className="text-gray-400 hover:text-white">
                                                {lockedMacros.carbs ? <Lock size={16} /> : <Unlock size={16} />}
                                            </button>
                                            <label className="text-sm font-medium text-gray-300">Carbohydrates</label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                value={Math.round(customPercentages.carbs)}
                                                onChange={(e) => handleMacroValueChange('carbs', parseInt(e.target.value, 10) || 0)}
                                                className="w-20 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                                                disabled={lockedMacros.carbs}
                                            />
                                            <span className="text-sm font-mono text-white">%</span>
                                        </div>
                                    </div>
                                    <Slider
                                        value={[customPercentages.carbs]}
                                        onValueChange={([value]) => handleMacroValueChange('carbs', value)}
                                        min={5}
                                        max={80}
                                        step={1}
                                        className="cursor-pointer"
                                        disabled={lockedMacros.carbs}
                                    />
                                </div>

                                {/* Protein */}
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setLockedMacros(p => ({ ...p, protein: !p.protein }))} className="text-gray-400 hover:text-white">
                                                {lockedMacros.protein ? <Lock size={16} /> : <Unlock size={16} />}
                                            </button>
                                            <label className="text-sm font-medium text-gray-300">Protein</label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                value={Math.round(customPercentages.protein)}
                                                onChange={(e) => handleMacroValueChange('protein', parseInt(e.target.value, 10) || 0)}
                                                className="w-20 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                                                disabled={lockedMacros.protein}
                                            />
                                            <span className="text-sm font-mono text-white">%</span>
                                        </div>
                                    </div>
                                    <Slider
                                        value={[customPercentages.protein]}
                                        onValueChange={([value]) => handleMacroValueChange('protein', value)}
                                        min={10}
                                        max={50}
                                        step={1}
                                        className="cursor-pointer"
                                        disabled={lockedMacros.protein}
                                    />
                                </div>

                                {/* Fat */}
                                <div>
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2">
                                            <button onClick={() => setLockedMacros(p => ({ ...p, fat: !p.fat }))} className="text-gray-400 hover:text-white">
                                                {lockedMacros.fat ? <Lock size={16} /> : <Unlock size={16} />}
                                            </button>
                                            <label className="text-sm font-medium text-gray-300">Fat</label>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Input
                                                type="number"
                                                value={Math.round(customPercentages.fat)}
                                                onChange={(e) => handleMacroValueChange('fat', parseInt(e.target.value, 10) || 0)}
                                                className="w-20 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                                                disabled={lockedMacros.fat}
                                            />
                                            <span className="text-sm font-mono text-white">%</span>
                                        </div>
                                    </div>
                                    <Slider
                                        value={[customPercentages.fat]}
                                        onValueChange={([value]) => handleMacroValueChange('fat', value)}
                                        min={10}
                                        max={75}
                                        step={1}
                                        className="cursor-pointer"
                                        disabled={lockedMacros.fat}
                                    />
                                </div>

                                <p className="text-xs text-gray-500 mt-2">
                                    Adjust or type in a value. Unlocked macros will auto-adjust to maintain 100% total.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>



            {/* Advanced Calculation Settings */}
            <div className="bg-[#1c1c1e] rounded-2xl border border-gray-800 mb-6">
                <button
                    onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
                    className="w-full p-4 flex items-center justify-between hover:bg-[#2c2c2e] transition-colors rounded-2xl"
                >
                    <div className="flex items-center gap-2">
                        <Settings className="h-5 w-5 text-gray-400" />
                        <span className="text-white font-semibold">Calculation Settings</span>
                    </div>
                    <ChevronLeft className={`h-5 w-5 text-gray-400 transition-transform ${showAdvancedSettings ? '-rotate-90' : 'rotate-180'}`} />
                </button>

                {showAdvancedSettings && (
                    <div className="px-4 pb-4 space-y-4 border-t border-gray-800 pt-4">
                        {/* Fat Breakdown Algorithm */}
                        <div>
                            <Label className="text-gray-300 text-sm mb-2 block">Fat Breakdown Method</Label>
                            <Select
                                value={localFatBreakdownAlgorithm}
                                onValueChange={(value) => setLocalFatBreakdownAlgorithm(value as FatBreakdownAlgorithm)}
                            >
                                <SelectTrigger className="bg-[#2c2c2e] border-gray-700 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.values(FatBreakdownAlgorithm).map((algo) => (
                                        <SelectItem key={algo} value={algo}>
                                            {FatBreakdownAlgorithmLabels[algo]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Mineral Calculation Algorithm */}
                        <div>
                            <Label className="text-gray-300 text-sm mb-2 block">Mineral Calculation</Label>
                            <Select
                                value={localMineralAlgorithm}
                                onValueChange={(value) => setLocalMineralAlgorithm(value as MineralCalculationAlgorithm)}
                            >
                                <SelectTrigger className="bg-[#2c2c2e] border-gray-700 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.values(MineralCalculationAlgorithm).map((algo) => (
                                        <SelectItem key={algo} value={algo}>
                                            {MineralCalculationAlgorithmLabels[algo]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Vitamin Calculation Algorithm */}
                        <div>
                            <Label className="text-gray-300 text-sm mb-2 block">Vitamin Calculation</Label>
                            <Select
                                value={localVitaminAlgorithm}
                                onValueChange={(value) => setLocalVitaminAlgorithm(value as VitaminCalculationAlgorithm)}
                            >
                                <SelectTrigger className="bg-[#2c2c2e] border-gray-700 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.values(VitaminCalculationAlgorithm).map((algo) => (
                                        <SelectItem key={algo} value={algo}>
                                            {VitaminCalculationAlgorithmLabels[algo]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Sugar Calculation Algorithm */}
                        <div>
                            <Label className="text-gray-300 text-sm mb-2 block">Sugar Recommendation</Label>
                            <Select
                                value={localSugarAlgorithm}
                                onValueChange={(value) => setLocalSugarAlgorithm(value as SugarCalculationAlgorithm)}
                            >
                                <SelectTrigger className="bg-[#2c2c2e] border-gray-700 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.values(SugarCalculationAlgorithm).map((algo) => (
                                        <SelectItem key={algo} value={algo}>
                                            {SugarCalculationAlgorithmLabels[algo]}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <p className="text-xs text-gray-500 mt-2">
                            These settings control how your nutrient goals are calculated. You can change them later in Settings.
                        </p>
                    </div>
                )}
            </div>

            {/* Nutrient Sections Grid */}
            <h2 className="text-xl font-bold text-white mb-4 ml-1 mt-8">
                Nutrient Goals
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* 1. Daily Macro Targets */}
                <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
                    <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
                        <h3 className="text-white font-bold text-sm">Daily Macro Targets</h3>
                    </div>
                    <Table>
                        <TableBody>
                            <TableRow className="border-gray-800 hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">
                                    Carbohydrates ({editedPlan?.calories ? Math.round((editedPlan.carbs * 4 / convertEnergy(editedPlan.calories, localEnergyUnit, 'kcal')) * 100) : 0}%)
                                </TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input
                                            type="number"
                                            value={editedPlan?.carbs ?? ''}
                                            onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, carbs: Number(e.target.value) }) : null)}
                                            className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                                        />
                                        <span className="text-sm">g</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                            <TableRow className="border-gray-800 hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">
                                    Protein ({editedPlan?.calories ? Math.round((editedPlan.protein * 4 / convertEnergy(editedPlan.calories, localEnergyUnit, 'kcal')) * 100) : 0}%)
                                </TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input
                                            type="number"
                                            value={editedPlan?.protein ?? ''}
                                            onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, protein: Number(e.target.value) }) : null)}
                                            className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                                        />
                                        <span className="text-sm">g</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                            <TableRow className="border-gray-800 hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">
                                    Fats ({editedPlan?.calories ? Math.round((editedPlan.fat * 9 / convertEnergy(editedPlan.calories, localEnergyUnit, 'kcal')) * 100) : 0}%)
                                </TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input
                                            type="number"
                                            value={editedPlan?.fat ?? ''}
                                            onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, fat: Number(e.target.value) }) : null)}
                                            className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                                        />
                                        <span className="text-sm">g</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                            <TableRow className="border-none hover:bg-transparent bg-[#252527]">
                                <TableCell className="font-medium text-gray-300 text-sm">
                                    Fiber
                                </TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input
                                            type="number"
                                            value={editedPlan?.dietary_fiber ?? ''}
                                            onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, dietary_fiber: Number(e.target.value) }) : null)}
                                            className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                                        />
                                        <span className="text-sm">g</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>

                {/* 2. Fat Breakdown */}
                <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
                    <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
                        <h3 className="text-white font-bold text-sm">Fat Breakdown</h3>
                    </div>
                    <Table>
                        <TableBody>
                            <TableRow className="border-gray-800 hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">Saturated Fat</TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input type="number" value={editedPlan?.saturated_fat ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, saturated_fat: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                                        <span className="text-sm">g</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                            <TableRow className="border-gray-800 hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">Trans Fat</TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input type="number" value={editedPlan?.trans_fat ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, trans_fat: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                                        <span className="text-sm">g</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                            <TableRow className="border-gray-800 hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">Polyunsaturated</TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input type="number" value={editedPlan?.polyunsaturated_fat ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, polyunsaturated_fat: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                                        <span className="text-sm">g</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                            <TableRow className="border-none hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">Monounsaturated</TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input type="number" value={editedPlan?.monounsaturated_fat ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, monounsaturated_fat: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                                        <span className="text-sm">g</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>

                {/* 3. Minerals & Other */}
                <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
                    <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
                        <h3 className="text-white font-bold text-sm">Minerals & Other</h3>
                    </div>
                    <Table>
                        <TableBody>
                            <TableRow className="border-gray-800 hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">Cholesterol</TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input type="number" value={editedPlan?.cholesterol ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, cholesterol: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                                        <span className="text-sm">mg</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                            <TableRow className="border-gray-800 hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">Sodium</TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input type="number" value={editedPlan?.sodium ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, sodium: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                                        <span className="text-sm">mg</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                            <TableRow className="border-gray-800 hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">Potassium</TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input type="number" value={editedPlan?.potassium ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, potassium: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                                        <span className="text-sm">mg</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                            <TableRow className="border-gray-800 hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">Calcium</TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input type="number" value={editedPlan?.calcium ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, calcium: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                                        <span className="text-sm">mg</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                            <TableRow className="border-none hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">Iron</TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input type="number" value={editedPlan?.iron ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, iron: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                                        <span className="text-sm">mg</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>

                {/* 4. Sugars & Vitamins */}
                <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
                    <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
                        <h3 className="text-white font-bold text-sm">Sugars & Vitamins</h3>
                    </div>
                    <Table>
                        <TableBody>
                            <TableRow className="border-gray-800 hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">Sugar</TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input type="number" value={editedPlan?.sugars ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, sugars: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                                        <span className="text-sm">g</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                            <TableRow className="border-gray-800 hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">Vitamin A</TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input type="number" value={editedPlan?.vitamin_a ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, vitamin_a: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                                        <span className="text-sm">µg</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                            <TableRow className="border-none hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">Vitamin C</TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input type="number" value={editedPlan?.vitamin_c ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, vitamin_c: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                                        <span className="text-sm">mg</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>

                {/* 5. Hydration & Exercise */}
                <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
                    <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
                        <h3 className="text-white font-bold text-sm">Hydration & Exercise</h3>
                    </div>
                    <div className="p-3 border-b border-gray-800 flex justify-center gap-2">
                        {(['ml', 'oz', 'liter'] as const).map(unit => (
                            <button
                                key={unit}
                                onClick={() => setLocalWaterUnit(unit)}
                                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${localWaterUnit === unit ? 'bg-blue-600 text-white' : 'bg-[#2c2c2e] text-gray-400 hover:text-white'}`}
                            >
                                {unit}
                            </button>
                        ))}
                    </div>
                    <Table>
                        <TableBody>
                            <TableRow className="border-gray-800 hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">Water Goal</TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input
                                            type="number"
                                            value={editedPlan?.water_goal_ml ? convertMlToSelectedUnit(editedPlan.water_goal_ml, localWaterUnit) : ''}
                                            onChange={(e) => {
                                                const val = Number(e.target.value);
                                                const ml = convertSelectedUnitToMl(val, localWaterUnit);
                                                setEditedPlan(prev => prev ? ({ ...prev, water_goal_ml: ml }) : null);
                                            }}
                                            className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm"
                                        />
                                        <span className="text-xs">{localWaterUnit}</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                            <TableRow className="border-gray-800 hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">Exercise Duration</TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input type="number" value={editedPlan?.target_exercise_duration_minutes ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, target_exercise_duration_minutes: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                                        <span className="text-sm">min</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                            <TableRow className="border-none hover:bg-transparent">
                                <TableCell className="font-medium text-gray-300 text-sm">Exercise Calories</TableCell>
                                <TableCell className="text-right text-white font-bold">
                                    <div className="flex items-center justify-end gap-1">
                                        <Input type="number" value={editedPlan?.target_exercise_calories_burned ?? ''} onChange={(e) => setEditedPlan(prev => prev ? ({ ...prev, target_exercise_calories_burned: Number(e.target.value) }) : null)} className="w-16 text-right bg-transparent border-gray-700 text-white h-8 text-sm" />
                                        <span className="text-sm">kcal</span>
                                    </div>
                                </TableCell>
                            </TableRow>
                        </TableBody>
                    </Table>
                </div>

                {/* 6. Meal Calorie Distribution */}
                <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
                    <div className="bg-[#2c2c2e] px-4 py-3 border-b border-gray-800">
                        <h3 className="text-white font-bold text-sm">{t('goals.mealDistribution.title', 'Meal Calorie Distribution')}</h3>
                    </div>
                    <div className="p-4 text-white dark">
                        <MealPercentageManager
                            initialPercentages={{
                                breakfast: editedPlan?.breakfast_percentage || 25,
                                lunch: editedPlan?.lunch_percentage || 25,
                                dinner: editedPlan?.dinner_percentage || 25,
                                snacks: editedPlan?.snacks_percentage || 25,
                            }}
                            totalCalories={editedPlan?.calories || 2000}
                            onPercentagesChange={(newPercentages) => {
                                setEditedPlan(prev => prev ? ({
                                    ...prev,
                                    breakfast_percentage: newPercentages.breakfast,
                                    lunch_percentage: newPercentages.lunch,
                                    dinner_percentage: newPercentages.dinner,
                                    snacks_percentage: newPercentages.snacks,
                                }) : null);
                            }}
                        />
                    </div>
                </div>
            </div>


            <div className="flex flex-col gap-4 mt-8 mb-12">
                <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="w-full bg-green-600 hover:bg-green-700 text-white h-14 text-lg rounded-full font-bold disabled:opacity-70 shadow-lg shadow-green-900/20"
                >
                    <PlayCircle className="mr-2 h-5 w-5" />
                    {isSubmitting ? t('common.saving', "Saving...") : t('goals.startCascadingPlan', "Start 6-Month Cascading Plan")}
                </Button>

                <Button
                    variant="outline"
                    onClick={() => setIsSavePresetOpen(true)}
                    disabled={isSubmitting}
                    className="w-full h-12 text-base rounded-full bg-[#1c1c1e] border-gray-700 text-gray-200 hover:bg-[#2c2c2e] hover:text-white transition-colors"
                >
                    <Save className="mr-2 h-4 w-4" />
                    {t('goals.saveAsPreset', "Save Preset & Start 6-Month Cascading Goal")}
                </Button>
            </div>

            <Dialog open={isSavePresetOpen} onOpenChange={setIsSavePresetOpen}>
                <DialogContent className="bg-[#1c1c1e] text-white border-gray-800">
                    <DialogHeader>
                        <DialogTitle>{t('goals.saveAsPreset', 'Save as Goal Preset')}</DialogTitle>
                        <DialogDescription className="text-gray-400">
                            {t('goals.savePresetDescription', 'Give your goal preset a name. This will save your current configuration for future use and apply it as your plan starting today.')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="name" className="text-gray-300">
                                {t('goals.presetName', 'Preset Name')}
                            </Label>
                            <Input
                                id="name"
                                value={presetName}
                                onChange={(e) => setPresetName(e.target.value)}
                                className="bg-[#2c2c2e] border-gray-700 text-white"
                                placeholder={t('goals.presetNamePlaceholder', 'e.g., Cutting Phase 1')}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setIsSavePresetOpen(false)} className="text-gray-400 hover:text-white hover:bg-white/10">
                            {t('common.cancel', 'Cancel')}
                        </Button>
                        <Button onClick={handleSavePreset} disabled={isSavingPreset} className="bg-blue-600 hover:bg-blue-700 text-white">
                            {isSavingPreset ? t('common.saving', 'Saving...') : t('goals.saveAndStart', 'Save & Start Plan')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
};

export default PersonalPlan;

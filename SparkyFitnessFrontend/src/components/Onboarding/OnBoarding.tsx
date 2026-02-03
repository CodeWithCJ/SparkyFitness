import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Check, Utensils, CalendarIcon } from "lucide-react";
import { submitOnboardingData } from "@/services/onboardingService";
import { saveCheckInMeasurements, getMostRecentMeasurement } from "@/services/checkInService";
import { saveGoals } from "@/services/goalsService";
import { apiCall } from "@/services/api";
import { DEFAULT_GOALS } from "@/constants/goals";
import { format, parseISO } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { usePreferences } from "@/contexts/PreferencesContext";
import { ExpandedGoals } from "@/types/goals";
import { getDietTemplate } from "@/constants/dietTemplates";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { calculateAllAdvancedNutrients } from '@/services/nutrientCalculationService';
import {
    FatBreakdownAlgorithm,
    MineralCalculationAlgorithm,
    VitaminCalculationAlgorithm,
    SugarCalculationAlgorithm,
} from '@/types/nutrientAlgorithms';
import PersonalPlan from "./PersonalPlan";

interface OptionButtonProps {
    label: string;
    subLabel?: string;
    isSelected: boolean;
    onClick: () => void;
}

const OptionButton: React.FC<OptionButtonProps> = ({
    label,
    subLabel,
    isSelected,
    onClick,
}) => (
    <button
        onClick={onClick}
        className={`
      w-full text-left p-5 my-3 rounded-xl border-2 transition-all duration-200
      flex flex-col justify-center
      ${isSelected
                ? "bg-[#1c1c1e] border-green-500"
                : "bg-[#1c1c1e] border-transparent hover:border-gray-600"
            }
    `}
    >
        <div className="flex justify-between items-center w-full">
            <span className="font-semibold text-lg text-white">{label}</span>
            {isSelected && (
                <div className="bg-green-500 rounded-full p-1">
                    <Check className="h-4 w-4 text-black" />
                </div>
            )}
        </div>
        {subLabel && <span className="text-gray-400 text-sm mt-1">{subLabel}</span>}
    </button>
);


interface FormData {
    sex: "male" | "female" | "";
    primaryGoal: "lose_weight" | "maintain_weight" | "gain_weight" | "";
    currentWeight: number | "";
    height: number | "";
    birthDate: string;
    bodyFatRange: string;
    targetWeight: number | "";
    mealsPerDay: number | "";
    activityLevel: "not_much" | "light" | "moderate" | "heavy" | "";
    addBurnedCalories: boolean | null;
}

interface OnBoardingProps {
    onOnboardingComplete: () => void;
}

const TOTAL_INPUT_STEPS = 10;

const OnBoarding: React.FC<OnBoardingProps> = ({ onOnboardingComplete }) => {
    const { t } = useTranslation();

    // Get preferences including algorithm settings
    const {
        energyUnit,
        weightUnit: preferredWeightUnit,
        measurementUnit: preferredMeasurementUnit,
        dateFormat,
        convertEnergy,
        getEnergyUnitString,
        saveAllPreferences,
        fatBreakdownAlgorithm,
        mineralCalculationAlgorithm,
        vitaminCalculationAlgorithm,
        sugarCalculationAlgorithm,
    } = usePreferences();

    // State management
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [formData, setFormData] = useState<FormData>({
        sex: "",
        primaryGoal: "",
        currentWeight: "",
        height: "",
        birthDate: "",
        bodyFatRange: "",
        targetWeight: "",
        mealsPerDay: "",
        activityLevel: "",
        addBurnedCalories: null,
    });

    // Local unit states (can differ from saved preferences during onboarding)
    const [localWeightUnit, setLocalWeightUnit] = useState<'kg' | 'lbs'>(preferredWeightUnit);
    const [localHeightUnit, setLocalHeightUnit] = useState<'cm' | 'inches'>(preferredMeasurementUnit);
    const [localEnergyUnit, setLocalEnergyUnit] = useState<'kcal' | 'kJ'>(energyUnit);
    const [localDateFormat, setLocalDateFormat] = useState(dateFormat);

    // Computed unit values (use local units during onboarding)
    const weightUnit = localWeightUnit;
    const heightUnit = localHeightUnit;

    // State for editable plan (initialized with defaults + calculated, matches ExpandedGoals)
    const [editedPlan, setEditedPlan] = useState<ExpandedGoals | null>(null);

    // Water Unit State
    const [localWaterUnit, setLocalWaterUnit] = useState<'ml' | 'oz' | 'liter'>('ml');

    // Local algorithm states (can change during onboarding before saved)
    const [localFatBreakdownAlgorithm, setLocalFatBreakdownAlgorithm] = useState<FatBreakdownAlgorithm>(fatBreakdownAlgorithm);
    const [localMineralAlgorithm, setLocalMineralAlgorithm] = useState<MineralCalculationAlgorithm>(mineralCalculationAlgorithm);
    const [localVitaminAlgorithm, setLocalVitaminAlgorithm] = useState<VitaminCalculationAlgorithm>(vitaminCalculationAlgorithm);
    const [localSugarAlgorithm, setLocalSugarAlgorithm] = useState<SugarCalculationAlgorithm>(sugarCalculationAlgorithm);

    // Diet selection state
    const [localSelectedDiet, setLocalSelectedDiet] = useState<string>('balanced');
    const [customPercentages, setCustomPercentages] = useState({
        carbs: 40,
        protein: 30,
        fat: 30,
    });

    const [lockedMacros, setLockedMacros] = useState({
        carbs: false,
        protein: false,
        fat: false,
    });

    // Helper functions for water unit conversion
    const convertMlToSelectedUnit = (ml: number, unit: 'ml' | 'oz' | 'liter'): number => {
        switch (unit) {
            case 'oz':
                return Number((ml / 29.5735).toFixed(1));
            case 'liter':
                return Number((ml / 1000).toFixed(2));
            case 'ml':
            default:
                return Math.round(ml);
        }
    };

    const convertSelectedUnitToMl = (value: number, unit: 'ml' | 'oz' | 'liter'): number => {
        switch (unit) {
            case 'oz':
                return Math.round(value * 29.5735);
            case 'liter':
                return Math.round(value * 1000);
            case 'ml':
            default:
                return Math.round(value);
        }
    };


    // Fetch existing user data on component mount to pre-populate the form
    useEffect(() => {
        const fetchExistingData = async () => {
            try {
                const profileResponse = await apiCall('/identity/profiles', {
                    method: 'GET',
                    suppress404Toast: true,
                });

                if (profileResponse) {
                    setFormData(prev => ({
                        ...prev,
                        sex: profileResponse.gender || '',
                        birthDate: profileResponse.date_of_birth || '',
                    }));
                }
            } catch (error) {
                console.log('No existing profile data found');
            }

            try {
                const weightData = await getMostRecentMeasurement('weight');
                if (weightData && weightData.weight) {
                    const weightInPreferredUnit = preferredWeightUnit === 'lbs'
                        ? Number((weightData.weight * 2.20462).toFixed(1))
                        : Number(weightData.weight.toFixed(1));

                    setFormData(prev => ({
                        ...prev,
                        currentWeight: weightInPreferredUnit,
                    }));
                }
            } catch (error) {
                console.log('No existing weight data found');
            }

            try {
                const heightData = await getMostRecentMeasurement('height');
                if (heightData && heightData.height) {
                    const heightInPreferredUnit = preferredMeasurementUnit === 'inches'
                        ? Number((heightData.height / 2.54).toFixed(1))
                        : Number(heightData.height.toFixed(1));

                    setFormData(prev => ({
                        ...prev,
                        height: heightInPreferredUnit,
                    }));
                }
            } catch (error) {
                console.log('No existing height data found');
            }
        };

        fetchExistingData();
    }, []); // Run only once on mount


    // Calculated plan (moved up to avoid use-before-declaration)
    const plan = useMemo(() => {
        if (step < 12) return null;

        const weightKg = weightUnit === 'lbs' ? Number(formData.currentWeight) * 0.453592 : Number(formData.currentWeight);
        const heightCm = heightUnit === 'inches' ? Number(formData.height) * 2.54 : Number(formData.height);
        const age =
            new Date().getFullYear() - new Date(formData.birthDate).getFullYear();

        if (
            isNaN(weightKg) ||
            isNaN(heightCm) ||
            isNaN(age) ||
            !formData.activityLevel
        )
            return null;

        let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age;
        bmr += formData.sex === "male" ? 5 : -161;

        const activityMultipliers = {
            not_much: 1.2,
            light: 1.375,
            moderate: 1.55,
            heavy: 1.725,
        };
        const multiplier = activityMultipliers[formData.activityLevel];
        const tdee = bmr * multiplier;

        let targetCalories = tdee;
        if (formData.primaryGoal === "lose_weight") targetCalories = tdee * 0.8;
        if (formData.primaryGoal === "gain_weight") targetCalories = tdee + 500;

        const finalDailyCalories = Math.round(targetCalories / 10) * 10;

        const dietTemplate = localSelectedDiet === 'custom'
            ? { carbsPercentage: customPercentages.carbs, proteinPercentage: customPercentages.protein, fatPercentage: customPercentages.fat }
            : getDietTemplate(localSelectedDiet);

        const macros = {
            carbs: Math.round((finalDailyCalories * (dietTemplate.carbsPercentage / 100)) / 4),
            protein: Math.round((finalDailyCalories * (dietTemplate.proteinPercentage / 100)) / 4),
            fat: Math.round((finalDailyCalories * (dietTemplate.fatPercentage / 100)) / 9),
            fiber: Math.round((finalDailyCalories / 1000) * 14),
        };

        return { bmr, tdee, finalDailyCalories, macros };
    }, [formData, step, weightUnit, heightUnit, localSelectedDiet, customPercentages]);

    // Sync calculation to editedPlan whenever the plan or its dependencies change
    useEffect(() => {
        if (plan) {
            const weightKg = weightUnit === 'lbs' ? Number(formData.currentWeight) * 0.453592 : Number(formData.currentWeight);
            const waterGoalMl = Math.round(weightKg * 35);
            const age = new Date().getFullYear() - new Date(formData.birthDate).getFullYear();

            if (!formData.sex || !formData.activityLevel) {
                console.error('Missing required data for nutrient calculations');
                return;
            }

            const userData = {
                age,
                sex: formData.sex as "male" | "female",
                weightKg,
                calories: plan.finalDailyCalories,
                totalFatGrams: plan.macros.fat,
                activityLevel: formData.activityLevel as "not_much" | "light" | "moderate" | "heavy",
            };

            const advancedNutrients = calculateAllAdvancedNutrients(userData, {
                fatBreakdown: localFatBreakdownAlgorithm,
                minerals: localMineralAlgorithm,
                vitamins: localVitaminAlgorithm,
                sugar: localSugarAlgorithm,
            });

            setEditedPlan({
                ...DEFAULT_GOALS,
                calories: Math.round(convertEnergy(plan.finalDailyCalories, 'kcal', localEnergyUnit)),
                protein: plan.macros.protein,
                carbs: plan.macros.carbs,
                fat: plan.macros.fat,
                dietary_fiber: plan.macros.fiber,
                water_goal_ml: waterGoalMl,
                ...advancedNutrients,
                protein_percentage: null,
                carbs_percentage: null,
                fat_percentage: null,
            });
        }
    }, [
        plan,
        localEnergyUnit,
        convertEnergy,
        formData.currentWeight,
        formData.birthDate,
        formData.sex,
        formData.activityLevel,
        weightUnit,
        localFatBreakdownAlgorithm,
        localMineralAlgorithm,
        localVitaminAlgorithm,
        localSugarAlgorithm
    ]);


    // Sync state with context initially
    useEffect(() => {
        setLocalEnergyUnit(energyUnit);
    }, [energyUnit]);

    const handleSelect = (field: keyof FormData, value: any) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
        setTimeout(() => nextStep(), 250);
    };

    const handleInputChange = (
        field: "currentWeight" | "height" | "targetWeight",
        value: string
    ) => {
        setFormData((prev) => ({
            ...prev,
            [field]: value === "" ? "" : parseFloat(value),
        }));
    };

    const nextStep = () => setStep((prev) => prev + 1);
    const prevStep = () => setStep((prev) => Math.max(1, prev - 1));

    useEffect(() => {
        if (step === 11) {
            const timer = setTimeout(() => {
                setStep(12);
            }, 1000);
            return () => clearTimeout(timer);
        }
    }, [step]);

    const handleSubmit = async () => {
        setIsSubmitting(true);

        const dataToSubmit = {
            ...formData,
            currentWeight:
                formData.currentWeight === ""
                    ? undefined
                    : weightUnit === 'lbs' ? Number(formData.currentWeight) * 0.453592 : Number(formData.currentWeight),
            height: formData.height === "" ? undefined : heightUnit === 'inches' ? Number(formData.height) * 2.54 : Number(formData.height),
            targetWeight:
                formData.targetWeight === ""
                    ? undefined
                    : weightUnit === 'lbs' ? Number(formData.targetWeight) * 0.453592 : Number(formData.targetWeight),
            mealsPerDay:
                formData.mealsPerDay === "" ? undefined : Number(formData.mealsPerDay),
        };

        // Update user preferences with selected units and algorithms
        await saveAllPreferences({
            weightUnit: weightUnit,
            measurementUnit: heightUnit,
            energyUnit: localEnergyUnit,
            dateFormat: localDateFormat,
            fatBreakdownAlgorithm: localFatBreakdownAlgorithm,
            mineralCalculationAlgorithm: localMineralAlgorithm,
            vitaminCalculationAlgorithm: localVitaminAlgorithm,
            sugarCalculationAlgorithm: localSugarAlgorithm,
            selectedDiet: localSelectedDiet,
        });


        const todayStr = format(new Date(), 'yyyy-MM-dd');

        try {
            await apiCall(`/identity/profiles`, {
                method: 'PUT',
                body: JSON.stringify({
                    gender: formData.sex,
                    date_of_birth: formData.birthDate,
                }),
            });
        } catch (e) {
            console.error("Failed to sync profile data", e);
        }

        try {
            const metricWeight = weightUnit === 'lbs' ? Number(formData.currentWeight) * 0.453592 : Number(formData.currentWeight);
            const metricHeight = heightUnit === 'inches' ? Number(formData.height) * 2.54 : Number(formData.height);

            await saveCheckInMeasurements({
                entry_date: todayStr,
                weight: metricWeight,
                height: metricHeight,
            });
        } catch (e) {
            console.error("Failed to sync measurements", e);
        }

        try {
            if (editedPlan) {
                const storedCalories = convertEnergy(editedPlan.calories, localEnergyUnit, 'kcal');

                const newGoals: ExpandedGoals = {
                    ...editedPlan,
                    calories: storedCalories,
                    protein_percentage: Math.round((editedPlan.protein * 4 / storedCalories) * 100),
                    carbs_percentage: Math.round((editedPlan.carbs * 4 / storedCalories) * 100),
                    fat_percentage: Math.round((editedPlan.fat * 9 / storedCalories) * 100),
                    dietary_fiber: editedPlan.dietary_fiber,
                    water_goal_ml: editedPlan.water_goal_ml,
                    target_exercise_duration_minutes: editedPlan.target_exercise_duration_minutes,
                    target_exercise_calories_burned: editedPlan.target_exercise_calories_burned,
                };

                if (newGoals) {
                    await saveGoals(todayStr, newGoals, true);
                }
            }
        } catch (e) {
            console.error("Failed to sync goals", e);
        }

        try {
            await submitOnboardingData(dataToSubmit);
            toast({
                title: "Success!",
                description: "Your personalized plan is ready to go.",
            });
            onOnboardingComplete();
        } catch (error) {
            toast({
                title: "Submission Error",
                description: "Could not save your plan. Please try again.",
                variant: "destructive",
            });
            setIsSubmitting(false);
        }
    };


    const handleMacroValueChange = (changedMacro: keyof typeof customPercentages, newValue: number) => {
        newValue = Math.max(0, Math.min(100, newValue));

        if (lockedMacros[changedMacro]) return;

        const newPercentages = { ...customPercentages };
        newPercentages[changedMacro] = newValue;

        const otherUnlockedMacros = (Object.keys(customPercentages) as Array<keyof typeof customPercentages>).filter(
            (m) => m !== changedMacro && !lockedMacros[m]
        );

        const fixedTotal = Object.keys(newPercentages).reduce((total, key) => {
            const macro = key as keyof typeof customPercentages;
            if (macro === changedMacro || lockedMacros[macro]) {
                return total + newPercentages[macro];
            }
            return total;
        }, 0);

        const remainingToDistribute = 100 - fixedTotal;

        if (otherUnlockedMacros.length > 0) {
            const totalOfOtherUnlocked = otherUnlockedMacros.reduce(
                (sum, m) => sum + customPercentages[m], 0
            );

            if (totalOfOtherUnlocked > 0) {
                otherUnlockedMacros.forEach((macro) => {
                    const ratio = customPercentages[macro] / totalOfOtherUnlocked;
                    newPercentages[macro] = remainingToDistribute * ratio;
                });
            } else {
                otherUnlockedMacros.forEach((macro) => {
                    newPercentages[macro] = remainingToDistribute / otherUnlockedMacros.length;
                });
            }
        }

        let total = 0;
        (Object.keys(newPercentages) as Array<keyof typeof customPercentages>).forEach((key) => {
            newPercentages[key] = Math.round(newPercentages[key]);
            total += newPercentages[key];
        });

        const lastUnlocked = otherUnlockedMacros[otherUnlockedMacros.length - 1];
        if (total !== 100 && lastUnlocked) {
            newPercentages[lastUnlocked] += 100 - total;
        }

        (Object.keys(newPercentages) as Array<keyof typeof customPercentages>).forEach((key) => {
            if (newPercentages[key] < 0) newPercentages[key] = 0;
        });

        setCustomPercentages(newPercentages);
    };

    const renderStepContent = () => {
        switch (step) {
            case 1:
                return (
                    <>
                        <h1 className="text-3xl font-bold text-white mb-2">
                            What is your sex?
                        </h1>
                        <p className="text-gray-400 mb-8">
                            Used to calculate your base metabolic rate.
                        </p>
                        <OptionButton
                            label="Male"
                            isSelected={formData.sex === "male"}
                            onClick={() => handleSelect("sex", "male")}
                        />
                        <OptionButton
                            label="Female"
                            isSelected={formData.sex === "female"}
                            onClick={() => handleSelect("sex", "female")}
                        />
                    </>
                );
            case 2:
                return (
                    <>
                        <h1 className="text-3xl font-bold text-white mb-8">
                            What is your primary goal?
                        </h1>
                        <OptionButton
                            label="Lose weight"
                            isSelected={formData.primaryGoal === "lose_weight"}
                            onClick={() => handleSelect("primaryGoal", "lose_weight")}
                        />
                        <OptionButton
                            label="Maintain weight"
                            isSelected={formData.primaryGoal === "maintain_weight"}
                            onClick={() => handleSelect("primaryGoal", "maintain_weight")}
                        />
                        <OptionButton
                            label="Gain weight"
                            isSelected={formData.primaryGoal === "gain_weight"}
                            onClick={() => handleSelect("primaryGoal", "gain_weight")}
                        />
                    </>
                );
            case 3:
                return (
                    <>
                        <h1 className="text-3xl font-bold text-white mb-2">
                            What is your current weight?
                        </h1>
                        <p className="text-gray-400 mb-8">Enter in {weightUnit}.</p>

                        <div className="flex justify-center mb-6 bg-[#2c2c2e] p-1 rounded-lg w-fit mx-auto">
                            <button
                                onClick={() => {
                                    if (weightUnit !== 'kg' && formData.currentWeight) {
                                        setFormData(prev => ({ ...prev, currentWeight: Number((Number(prev.currentWeight) * 0.453592).toFixed(1)) }));
                                    }
                                    setLocalWeightUnit('kg');
                                }}
                                className={`px-4 py-2 rounded-md transition-all ${weightUnit === 'kg' ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                            >
                                {t('settings.preferences.kilograms', 'Kilograms (kg)')}
                            </button>
                            <button
                                onClick={() => {
                                    if (weightUnit !== 'lbs' && formData.currentWeight) {
                                        setFormData(prev => ({ ...prev, currentWeight: Number((Number(prev.currentWeight) * 2.20462).toFixed(1)) }));
                                    }
                                    setLocalWeightUnit('lbs');
                                }}
                                className={`px-4 py-2 rounded-md transition-all ${weightUnit === 'lbs' ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                            >
                                {t('settings.preferences.pounds', 'Pounds (lbs)')}
                            </button>
                        </div>


                        <div className="flex items-center justify-center">
                            <Input
                                type="number"
                                className="text-5xl text-center bg-transparent border-none text-green-500 font-bold w-48 focus-visible:ring-0 placeholder:text-gray-700"
                                placeholder="0"
                                autoFocus
                                value={formData.currentWeight}
                                onChange={(e) =>
                                    handleInputChange("currentWeight", e.target.value)
                                }
                            />
                            <span className="text-2xl text-gray-500 font-bold ml-2">{weightUnit}</span>
                        </div>
                        <Button
                            onClick={nextStep}
                            disabled={!formData.currentWeight}
                            className="w-full mt-12 bg-green-600 hover:bg-green-700 text-white h-14 text-lg rounded-full"
                        >
                            Continue
                        </Button>
                    </>
                );
            case 4:
                return (
                    <>
                        <h1 className="text-3xl font-bold text-white mb-2">
                            What is your height?
                        </h1>
                        <p className="text-gray-400 mb-8">Enter in {heightUnit}.</p>

                        <div className="flex justify-center mb-6 bg-[#2c2c2e] p-1 rounded-lg w-fit mx-auto">
                            <button
                                onClick={() => {
                                    if (heightUnit !== 'cm' && formData.height) {
                                        setFormData(prev => ({ ...prev, height: Number((Number(prev.height) * 2.54).toFixed(1)) }));
                                    }
                                    setLocalHeightUnit('cm');
                                }}
                                className={`px-4 py-2 rounded-md transition-all ${heightUnit === 'cm' ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                            >
                                {t('settings.preferences.centimeters', 'Centimeters (cm)')}
                            </button>
                            <button
                                onClick={() => {
                                    if (heightUnit !== 'inches' && formData.height) {
                                        setFormData(prev => ({ ...prev, height: Number((Number(prev.height) / 2.54).toFixed(1)) }));
                                    }
                                    setLocalHeightUnit('inches');
                                }}
                                className={`px-4 py-2 rounded-md transition-all ${heightUnit === 'inches' ? 'bg-green-600 text-white shadow-md' : 'text-gray-400 hover:text-white'}`}
                            >
                                {t('settings.preferences.inches', 'Inches (in)')}
                            </button>
                        </div>


                        <div className="flex items-center justify-center">
                            <Input
                                type="number"
                                className="text-5xl text-center bg-transparent border-none text-green-500 font-bold w-48 focus-visible:ring-0 placeholder:text-gray-700"
                                placeholder="0"
                                autoFocus
                                value={formData.height}
                                onChange={(e) => handleInputChange("height", e.target.value)}
                            />
                            <span className="text-2xl text-gray-500 font-bold ml-2">{heightUnit === 'cm' ? 'cm' : 'in'}</span>
                        </div>
                        <Button
                            onClick={nextStep}
                            disabled={!formData.height}
                            className="w-full mt-12 bg-green-600 hover:bg-green-700 text-white h-14 text-lg rounded-full"
                        >
                            Continue
                        </Button>
                    </>
                );
            case 5:
                return (
                    <>
                        <h1 className="text-3xl font-bold text-white mb-2">
                            When were you born?
                        </h1>
                        <p className="text-gray-400 mb-8">
                            Age is a key factor in your metabolism.
                        </p>
                        <div className="flex justify-center mb-6 bg-[#2c2c2e] p-1 rounded-lg w-fit mx-auto">
                            <Select
                                value={localDateFormat}
                                onValueChange={setLocalDateFormat}
                            >
                                <SelectTrigger className="w-[180px] bg-[#1c1c1e] text-white border-none rounded-md">
                                    <SelectValue placeholder="Select format" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="MM/dd/yyyy">MM/dd/yyyy (12/25/2024)</SelectItem>
                                    <SelectItem value="dd/MM/yyyy">dd/MM/yyyy (25/12/2024)</SelectItem>
                                    <SelectItem value="dd-MMM-yyyy">dd-MMM-yyyy (25-Dec-2024)</SelectItem>
                                    <SelectItem value="yyyy-MM-dd">yyyy-MM-dd (2024-12-25)</SelectItem>
                                    <SelectItem value="MMM dd, yyyy">MMM dd, yyyy (Dec 25, 2024)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex justify-center">
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant={"outline"}
                                        className={`w-[240px] pl-3 text-left font-normal bg-[#1c1c1e] border-none text-white hover:bg-[#2c2c2e] hover:text-white h-14 text-lg rounded-xl justify-start ${!formData.birthDate && "text-muted-foreground"}`}
                                    >
                                        {formData.birthDate ? (
                                            format(parseISO(formData.birthDate), localDateFormat)
                                        ) : (
                                            <span className="text-gray-400">Pick a date</span>
                                        )}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="center">
                                    <Calendar
                                        mode="single"
                                        selected={formData.birthDate ? parseISO(formData.birthDate) : undefined}
                                        onSelect={(date) => {
                                            if (date) {
                                                setFormData({ ...formData, birthDate: format(date, 'yyyy-MM-dd') });
                                            }
                                        }}
                                        disabled={(date) =>
                                            date > new Date() || date < new Date("1900-01-01")
                                        }
                                        initialFocus
                                        yearsRange={100} // Set to 100 years for date of birth
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <Button
                            onClick={nextStep}
                            disabled={!formData.birthDate}
                            className="w-full mt-12 bg-green-600 hover:bg-green-700 text-white h-14 text-lg rounded-full"
                        >
                            Continue
                        </Button>
                    </>
                );
            case 6:
                return (
                    <>
                        <h1 className="text-3xl font-bold text-white mb-2">
                            Estimate your body fat
                        </h1>
                        <p className="text-gray-400 mb-8">
                            A visual estimate is sufficient.
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            {[
                                "Low (<15%)",
                                "Medium (15-25%)",
                                "High (25-35%)",
                                "Very High (>35%)",
                            ].map((range) => (
                                <button
                                    key={range}
                                    onClick={() => handleSelect("bodyFatRange", range)}
                                    className={`p-6 rounded-xl border-2 bg-[#1c1c1e] text-white font-semibold
                     ${formData.bodyFatRange === range
                                            ? "border-green-500"
                                            : "border-transparent hover:border-gray-600"
                                        }`}
                                >
                                    {range}
                                </button>
                            ))}
                        </div>
                    </>
                );
            case 7:
                return (
                    <>
                        <h1 className="text-3xl font-bold text-white mb-2">
                            What is your target weight?
                        </h1>
                        <p className="text-gray-400 mb-8">Your ultimate goal.</p>
                        <div className="flex items-center justify-center">
                            <Input
                                type="number"
                                className="text-5xl text-center bg-transparent border-none text-green-500 font-bold w-48 focus-visible:ring-0 placeholder:text-gray-700"
                                placeholder="0"
                                autoFocus
                                value={formData.targetWeight}
                                onChange={(e) =>
                                    handleInputChange("targetWeight", e.target.value)
                                }
                            />
                            <span className="text-2xl text-gray-500 font-bold ml-2">{weightUnit}</span>
                        </div>
                        <Button
                            onClick={nextStep}
                            disabled={!formData.targetWeight}
                            className="w-full mt-12 bg-green-600 hover:bg-green-700 text-white h-14 text-lg rounded-full"
                        >
                            Continue
                        </Button>
                    </>
                );
            case 8:
                return (
                    <>
                        <h1 className="text-3xl font-bold text-white mb-8">
                            How many meals do you eat in a typical day?
                        </h1>
                        {[3, 4, 5, 6].map((num) => (
                            <OptionButton
                                key={num}
                                label={`${num} meals per day`}
                                isSelected={formData.mealsPerDay === num}
                                onClick={() => handleSelect("mealsPerDay", num)}
                            />
                        ))}
                    </>
                );
            case 9:
                return (
                    <>
                        <h1 className="text-3xl font-bold text-white mb-8">
                            {t('onboarding.activityLevelTitle', 'How often do you exercise?')}
                        </h1>
                        <OptionButton
                            label={t('onboarding.activityNotMuch', 'Not Much')}
                            subLabel={t('onboarding.activityNotMuchDesc', 'Sedentary lifestyle, little to no exercise.')}
                            isSelected={formData.activityLevel === "not_much"}
                            onClick={() => handleSelect("activityLevel", "not_much")}
                        />
                        <OptionButton
                            label={t('onboarding.activityLight', 'Light (1-2 days/week)')}
                            subLabel={t('onboarding.activityLightDesc', 'Light exercise or sports.')}
                            isSelected={formData.activityLevel === "light"}
                            onClick={() => handleSelect("activityLevel", "light")}
                        />
                        <OptionButton
                            label={t('onboarding.activityModerate', 'Moderate (3-5 days/week)')}
                            subLabel={t('onboarding.activityModerateDesc', 'Moderate exercise or sports.')}
                            isSelected={formData.activityLevel === "moderate"}
                            onClick={() => handleSelect("activityLevel", "moderate")}
                        />
                        <OptionButton
                            label={t('onboarding.activityHeavy', 'Heavy (6-7 days/week)')}
                            subLabel={t('onboarding.activityHeavyDesc', 'Hard exercise or sports.')}
                            isSelected={formData.activityLevel === "heavy"}
                            onClick={() => handleSelect("activityLevel", "heavy")}
                        />
                    </>
                );
            case 10:
                return (
                    <>
                        <h1 className="text-3xl font-bold text-white mb-8">
                            {t('onboarding.addBurnedCaloriesTitle', 'Add burned calories from exercise?')}
                        </h1>
                        <p className="text-gray-400 mb-8">
                            {t('onboarding.addBurnedCaloriesDesc', 'If you exercise, should we add those calories back to your daily budget?')}
                        </p>
                        <div className="flex gap-4 w-full">
                            <button
                                onClick={() => handleSelect("addBurnedCalories", false)}
                                className={`flex-1 p-6 rounded-full text-lg font-bold transition-all
                  ${formData.addBurnedCalories === false
                                        ? "bg-green-600 text-white"
                                        : "bg-[#2c2c2e] text-gray-300"
                                    }
                `}
                            >
                                {t('common.no', 'No')}
                            </button>
                            <button
                                onClick={() => handleSelect("addBurnedCalories", true)}
                                className={`flex-1 p-6 rounded-full text-lg font-bold transition-all
                  ${formData.addBurnedCalories === true
                                        ? "bg-green-600 text-white"
                                        : "bg-[#2c2c2e] text-gray-300"
                                    }
                `}
                            >
                                {t('common.yes', 'Yes')}
                            </button>
                        </div>
                    </>
                );
            case 11:
                return (
                    <div className="flex flex-col items-center justify-center h-full animate-in fade-in duration-700">
                        <div className="relative flex h-32 w-32 mb-8">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-20"></span>
                            <span className="relative inline-flex rounded-full h-32 w-32 bg-[#1c1c1e] items-center justify-center border-4 border-green-500">
                                <Utensils className="h-12 w-12 text-green-500" />
                            </span>
                        </div>
                        <h2 className="text-2xl font-bold text-white text-center">
                            Preparing your personalized plan...
                        </h2>
                        <p className="text-gray-500 mt-4">
                            Crunching the numbers based on your unique profile.
                        </p>
                    </div>
                );

            case 12:
                return (
                    <PersonalPlan
                        plan={plan}
                        editedPlan={editedPlan}
                        setEditedPlan={setEditedPlan}
                        formData={formData}
                        t={t}
                        localEnergyUnit={localEnergyUnit}
                        setLocalEnergyUnit={setLocalEnergyUnit}
                        localWaterUnit={localWaterUnit}
                        setLocalWaterUnit={setLocalWaterUnit}
                        convertEnergy={convertEnergy}
                        getEnergyUnitString={getEnergyUnitString}
                        convertMlToSelectedUnit={convertMlToSelectedUnit}
                        convertSelectedUnitToMl={convertSelectedUnitToMl}
                        localSelectedDiet={localSelectedDiet}
                        setLocalSelectedDiet={setLocalSelectedDiet}
                        customPercentages={customPercentages}
                        setCustomPercentages={setCustomPercentages}
                        handleMacroValueChange={handleMacroValueChange}
                        lockedMacros={lockedMacros}
                        setLockedMacros={setLockedMacros}
                        localFatBreakdownAlgorithm={localFatBreakdownAlgorithm}
                        setLocalFatBreakdownAlgorithm={setLocalFatBreakdownAlgorithm}
                        localMineralAlgorithm={localMineralAlgorithm}
                        setLocalMineralAlgorithm={setLocalMineralAlgorithm}
                        localVitaminAlgorithm={localVitaminAlgorithm}
                        setLocalVitaminAlgorithm={setLocalVitaminAlgorithm}
                        localSugarAlgorithm={localSugarAlgorithm}
                        setLocalSugarAlgorithm={setLocalSugarAlgorithm}
                        handleSubmit={handleSubmit}
                        isSubmitting={isSubmitting}
                    />
                );

            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-black flex flex-col">
            <div className="px-4 pt-6 pb-2 flex items-center sticky top-0 bg-black z-10">
                {step > 1 && step <= TOTAL_INPUT_STEPS ? (
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={prevStep}
                        className="text-white hover:bg-[#1c1c1e] hover:text-white mr-2 -ml-2"
                    >
                        <ChevronLeft className="h-8 w-8" />
                    </Button>
                ) : (
                    <div className="w-10"></div>
                )}

                {step <= TOTAL_INPUT_STEPS && (
                    <div className="flex-1 h-2 bg-[#1c1c1e] rounded-full overflow-hidden">
                        <div
                            className="h-full bg-green-500 transition-all duration-500 ease-out rounded-full"
                            style={{ width: `${(step / TOTAL_INPUT_STEPS) * 100}%` }}
                        />
                    </div>
                )}

                {step <= TOTAL_INPUT_STEPS ? (
                    <Button
                        onClick={onOnboardingComplete}
                        variant="ghost"
                        className="text-gray-400 hover:text-white font-semibold ml-2 -mr-2 w-16"
                    >
                        Skip
                    </Button>
                ) : (
                    <div className="w-16 ml-2"></div>
                )}
            </div>

            <div className={`flex-1 flex flex-col px-6 w-full py-4 ${step === 12 ? 'max-w-7xl' : 'max-w-md'} mx-auto`}>
                {renderStepContent()}
            </div>
        </div>
    );
};

export default OnBoarding;

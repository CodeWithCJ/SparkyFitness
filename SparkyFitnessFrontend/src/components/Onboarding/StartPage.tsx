import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronLeft, Check, Utensils } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { submitOnboardingData } from "@/services/onboardingService";
import { toast } from "@/hooks/use-toast";

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
      ${
        isSelected
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

interface StartPageProps {
  onOnboardingComplete: () => void;
}

const StartPage: React.FC<StartPageProps> = ({ onOnboardingComplete }) => {
  const [step, setStep] = useState(1);
  const TOTAL_INPUT_STEPS = 10;
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
          : Number(formData.currentWeight),
      height: formData.height === "" ? undefined : Number(formData.height),
      targetWeight:
        formData.targetWeight === ""
          ? undefined
          : Number(formData.targetWeight),
      mealsPerDay:
        formData.mealsPerDay === "" ? undefined : Number(formData.mealsPerDay),
    };

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

  const plan = useMemo(() => {
    if (step < 12) return null;

    const weightKg = Number(formData.currentWeight);
    const heightCm = Number(formData.height);
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

    const macros = {
      carbs: Math.round((finalDailyCalories * 0.4) / 4),
      protein: Math.round((finalDailyCalories * 0.3) / 4),
      fat: Math.round((finalDailyCalories * 0.3) / 9),
      fiber: Math.round((finalDailyCalories / 1000) * 14),
    };

    return { bmr, tdee, finalDailyCalories, macros };
  }, [formData, step]);

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
            <p className="text-gray-400 mb-8">Enter in kg.</p>
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
              <span className="text-2xl text-gray-500 font-bold ml-2">kg</span>
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
            <p className="text-gray-400 mb-8">Enter in cm.</p>
            <div className="flex items-center justify-center">
              <Input
                type="number"
                className="text-5xl text-center bg-transparent border-none text-green-500 font-bold w-48 focus-visible:ring-0 placeholder:text-gray-700"
                placeholder="0"
                autoFocus
                value={formData.height}
                onChange={(e) => handleInputChange("height", e.target.value)}
              />
              <span className="text-2xl text-gray-500 font-bold ml-2">cm</span>
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
            <Input
              type="date"
              className="bg-[#1c1c1e] border-none text-white h-14 text-lg px-4 rounded-xl"
              value={formData.birthDate}
              onChange={(e) =>
                setFormData({ ...formData, birthDate: e.target.value })
              }
            />
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
                     ${
                       formData.bodyFatRange === range
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
              <span className="text-2xl text-gray-500 font-bold ml-2">kg</span>
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
              How often do you exercise?
            </h1>
            <OptionButton
              label="Not Much"
              subLabel="Sedentary lifestyle, little to no exercise."
              isSelected={formData.activityLevel === "not_much"}
              onClick={() => handleSelect("activityLevel", "not_much")}
            />
            <OptionButton
              label="Light (1-2 days/week)"
              subLabel="Light exercise or sports."
              isSelected={formData.activityLevel === "light"}
              onClick={() => handleSelect("activityLevel", "light")}
            />
            <OptionButton
              label="Moderate (3-5 days/week)"
              subLabel="Moderate exercise or sports."
              isSelected={formData.activityLevel === "moderate"}
              onClick={() => handleSelect("activityLevel", "moderate")}
            />
            <OptionButton
              label="Very Active (6-7 days/week)"
              subLabel="Hard exercise or physical job."
              isSelected={formData.activityLevel === "heavy"}
              onClick={() => handleSelect("activityLevel", "heavy")}
            />
          </>
        );
      case 10:
        return (
          <>
            <h1 className="text-3xl font-bold text-white mb-2">
              Add calories burned back to your budget?
            </h1>
            <p className="text-gray-400 mb-8">
              If you track exercises, do you want to eat back those calories?
            </p>

            <div className="flex flex-col sm:flex-row gap-4 mt-8">
              <button
                onClick={() => handleSelect("addBurnedCalories", false)}
                className={`flex-1 p-6 rounded-full text-lg font-bold transition-all
                  ${
                    formData.addBurnedCalories === false
                      ? "bg-green-600 text-white"
                      : "bg-[#2c2c2e] text-gray-300"
                  }
                `}
              >
                No
              </button>
              <button
                onClick={() => handleSelect("addBurnedCalories", true)}
                className={`flex-1 p-6 rounded-full text-lg font-bold transition-all
                  ${
                    formData.addBurnedCalories === true
                      ? "bg-green-600 text-white"
                      : "bg-[#2c2c2e] text-gray-300"
                  }
                `}
              >
                Yes
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

            <div className="bg-[#1c1c1e] rounded-2xl p-6 mb-6 text-center border border-gray-800">
              <p className="text-gray-400 uppercase text-sm font-bold tracking-wider mb-2">
                Daily Calorie Budget
              </p>
              <div className="text-6xl font-extrabold text-green-500">
                {plan.finalDailyCalories}
              </div>
              <p className="text-xl text-white font-medium mt-1">kcal / day</p>

              <div className="mt-6 pt-6 border-t border-gray-800 flex justify-between text-sm text-gray-400">
                <span>Base BMR: {Math.round(plan.bmr)}</span>
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
            </div>

            <h2 className="text-xl font-bold text-white mb-4 ml-1">
              Daily Macro Targets
            </h2>
            <div className="bg-[#1c1c1e] rounded-2xl overflow-hidden border border-gray-800">
              <Table>
                <TableHeader className="bg-[#2c2c2e]">
                  <TableRow className="border-none hover:bg-transparent">
                    <TableHead className="text-white font-bold">
                      Nutrient
                    </TableHead>
                    <TableHead className="text-white font-bold text-right">
                      Amount
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableCell className="font-medium text-gray-300">
                      Carbohydrates (40%)
                    </TableCell>
                    <TableCell className="text-right text-white font-bold text-lg">
                      {plan.macros.carbs}g
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableCell className="font-medium text-gray-300">
                      Protein (30%)
                    </TableCell>
                    <TableCell className="text-right text-white font-bold text-lg">
                      {plan.macros.protein}g
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableCell className="font-medium text-gray-300">
                      Fats (30%)
                    </TableCell>
                    <TableCell className="text-right text-white font-bold text-lg">
                      {plan.macros.fat}g
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-none hover:bg-transparent bg-[#252527]">
                    <TableCell className="font-medium text-gray-300">
                      Fiber (Recommended)
                    </TableCell>
                    <TableCell className="text-right text-white font-bold text-lg">
                      {plan.macros.fiber}g
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <Button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="w-full mt-8 bg-green-600 hover:bg-green-700 text-white h-14 text-lg rounded-full font-bold disabled:opacity-70"
            >
              {isSubmitting ? "Saving Your Plan..." : "Start Tracking Now"}
            </Button>
          </div>
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

      <div className="flex-1 flex flex-col px-6 max-w-md mx-auto w-full py-4">
        {renderStepContent()}
      </div>
    </div>
  );
};

export default StartPage;

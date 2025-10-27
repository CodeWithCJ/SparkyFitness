import { apiCall } from "./api";

interface OnboardingData {
  sex: "male" | "female" | "";
  primaryGoal: "lose_weight" | "maintain_weight" | "gain_weight" | "";
  currentWeight: number | "";
  height: number | "";
  birthDate: string; // In 'YYYY-MM-DD' format
  bodyFatRange?: string;
  targetWeight: number | "";
  mealsPerDay?: number;
  activityLevel: "not_much" | "light" | "moderate" | "heavy" | "";
  addBurnedCalories?: boolean;
}

/**
 * Submits the completed onboarding form data to the backend.
 * @param data The user's onboarding data.
 * @returns {Promise<any>} The response from the server.
 */
export const submitOnboardingData = async (data: OnboardingData) => {
  try {
    const response = await apiCall("/onboarding", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    return response;
  } catch (error) {
    console.error("Error submitting onboarding data:", error);
    throw error;
  }
};

/**
 * Fetches the user's onboarding completion status from the backend.
 * @returns {Promise<{ onboardingComplete: boolean }>}
 */
export const getOnboardingStatus = async (): Promise<{
  onboardingComplete: boolean;
}> => {
  try {
    const response = await apiCall("/onboarding/status");
    return response;
  } catch (error) {
    console.error("Error fetching onboarding status:", error);
    return { onboardingComplete: true };
  }
};

/**
 * Resets the user's onboarding completion status on the backend.
 * @returns {Promise<any>} The response from the server.
 */
export const resetOnboardingStatus = async () => {
  try {
    const response = await apiCall("/onboarding/reset", {
      method: "POST",
    });
    return response;
  } catch (error) {
    console.error("Error resetting onboarding status:", error);
    throw error;
  }
};

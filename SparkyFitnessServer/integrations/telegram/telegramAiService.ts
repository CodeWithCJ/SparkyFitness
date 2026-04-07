import { log } from '../../config/logging';
import * as userRepository from '../../models/userRepository';
import * as preferenceRepository from '../../models/preferenceRepository';
import * as goalRepository from '../../models/goalRepository';
import * as foodEntry from '../../models/foodEntry';
import * as exerciseEntry from '../../models/exerciseEntry';
import * as measurementRepository from '../../models/measurementRepository';
import { todayInZone, instantToDay } from '@workspace/shared';

const bmrService = require('../../services/bmrService');
const { loadUserTimezone } = require('../../utils/timezoneLoader');

export class TelegramAiService {
  static buildContextBlock(
    user: any,
    exerciseSummary: string,
    nutritionContext: string = '',
    extraContext: string = '',
    userPlan: string = ''
  ): string {
    const today = todayInZone(user.timezone || 'UTC');
    return `
SYSTEM CONTEXT FOR SPARKY FITNESS AI (TELEGRAM):
- Current Date: ${today}
- Active User: ${user.name} (ID: ${user.id})
- Preferred Language: ${user.language || 'en'}

USER'S PHYSICAL PROFILE & NUTRITION GOALS:
${nutritionContext || 'No profile or goal data available.'}

USER'S RECENT EXERCISE HISTORY (Last 7 Days):
${exerciseSummary || 'No recent exercises found.'}

BEHAVIORAL INSTRUCTIONS:
1. You are Sparky, a professional and motivating fitness coach.
2. You are communicating via Telegram. Keep your responses VERY CONCISE, friendly, and use Markdown (bold, lists).
3. When the user asks about "workouts", "sessions", or "exercises" (e.g., "последние занятия"), refer to the Exercise History provided above.
4. For every message, you MUST identify the intent (log_food, log_exercise, log_measurement, chat, etc.) and return it in the JSON format as defined in your main system prompt.
5. If you are just chatting or answering a question without a specific log intent, use the "chat" or "ask_question" intent and put your response in the "response" field.

[USER NUTRITION PLAN]
${userPlan || 'No specific nutrition plan rules provided yet.'}

${extraContext}
`;
  }

  static async getUserNutritionContext(userId: string): Promise<string> {
    try {
      const tz = await loadUserTimezone(userId);
      const today = todayInZone(tz);

      const [
        profile,
        prefs,
        goal,
        todayFoods,
        todayExercises,
        latestMeasurement,
      ] = await Promise.all([
        userRepository.getUserProfile(userId),
        preferenceRepository.getUserPreferences(userId),
        goalRepository.getMostRecentGoalBeforeDate(userId, today),
        foodEntry.getFoodEntriesByDate(userId, today),
        exerciseEntry.getExerciseEntriesByDate(userId, today),
        measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate(
          userId,
          today
        ),
      ]);

      if (!profile && !goal) return '';

      let age = null;
      if (profile?.date_of_birth) {
        const dob = new Date(profile.date_of_birth);
        const ageDifMs = Date.now() - dob.getTime();
        const ageDate = new Date(ageDifMs);
        age = Math.abs(ageDate.getUTCFullYear() - 1970);
      }

      const weight = latestMeasurement?.weight || null;
      const height = latestMeasurement?.height || null;
      const gender = profile?.gender || null;

      let bmr = 0;
      let tdee = 0;
      if (weight && height && age && gender && prefs) {
        bmr = bmrService.calculateBmr(
          prefs.bmr_algorithm || bmrService.BmrAlgorithm.MIFFLIN_ST_JEOR,
          weight,
          height,
          age,
          gender
        );
        const multiplier =
          bmrService.ActivityMultiplier[prefs.activity_level] || 1.2;
        tdee = bmr * multiplier;
      }

      const caloriesConsumed = todayFoods.reduce(
        (sum: number, f: any) => sum + Number(f.calories || 0),
        0
      );
      const proteinConsumed = todayFoods.reduce(
        (sum: number, f: any) => sum + Number(f.protein || 0),
        0
      );
      const carbsConsumed = todayFoods.reduce(
        (sum: number, f: any) => sum + Number(f.carbs || 0),
        0
      );
      const fatConsumed = todayFoods.reduce(
        (sum: number, f: any) => sum + Number(f.fat || 0),
        0
      );
      const caloriesBurnedToday = todayExercises.reduce(
        (sum: number, e: any) => sum + Number(e.calories_burned || 0),
        0
      );

      const calGoal = Number(goal?.calories || 2000);
      const remaining = calGoal + caloriesBurnedToday - caloriesConsumed;

      let context = `- Gender: ${gender || 'Unknown'}\n`;
      if (age) context += `- Age: ${age} years\n`;
      if (weight) context += `- Current Weight: ${weight} kg\n`;
      if (height) context += `- Height: ${height} cm\n`;
      if (bmr) context += `- Calculated BMR: ${Math.round(bmr)} kcal\n`;
      if (tdee) context += `- TDEE (Maintenance): ${Math.round(tdee)} kcal\n`;

      context += `\nDAILY GOALS & PROGRESS (${today}):\n`;
      context += `- Daily Base Calorie Goal: ${calGoal} kcal\n`;
      context += `- Active Calories Burned Today: ${Math.round(caloriesBurnedToday)} kcal\n`;
      context += `- Consumed Today: ${Math.round(caloriesConsumed)} kcal (${Math.round(proteinConsumed)}g P, ${Math.round(carbsConsumed)}g C, ${Math.round(fatConsumed)}g F)\n`;
      context += `- REMAINING CALORIES: ${Math.round(remaining)} kcal (Goal + Burned - Consumed)\n`;

      if (goal?.protein)
        context += `- Macronutrient Targets: ${goal.protein}g P, ${goal.carbs}g C, ${goal.fat}g F\n`;

      if (todayFoods.length > 0) {
        context += `\nFOOD LOGGED TODAY:\n`;
        todayFoods.forEach((f: any) => {
          context += `- [${f.meal_type || 'snack'}] ${f.food_name || f.name}: ${f.quantity} ${f.unit} - ${Math.round(f.calories)} kcal (P:${Math.round(f.protein)}g, C:${Math.round(f.carbs)}g, F:${Math.round(f.fat)}g, Fiber:${Math.round(f.dietary_fiber || 0)}g)\n`;
        });
      } else {
        context += `\nNo food logged today yet.\n`;
      }

      return context;
    } catch (e: any) {
      log('error', '[TELEGRAM BOT] Error building nutrition context:', e.message);
      return '';
    }
  }
}

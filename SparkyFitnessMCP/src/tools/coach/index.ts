import { query } from "../../db.js";
import { MOCK_USER_ID } from "../../config.js";

export const coachTools = [
  {
    name: "get_health_summary",
    description: "Get a summary of the user's health status (Nutrition, Fitness, Vitals) for a specific date range.",
    inputSchema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Start date (YYYY-MM-DD)." },
        end_date: { type: "string", description: "End date (YYYY-MM-DD)." },
      },
      required: ["start_date"],
    },
  },
  {
    name: "analyze_trends",
    description: "Analyze weight trends vs. calorie intake to identify plateaus or progress.",
    inputSchema: {
      type: "object",
      properties: {
        days: { type: "number", description: "Number of days to analyze (default 7)." }
      }
    }
  },
  {
    name: "get_30_day_trends",
    description: "Get comprehensive trends for the last 30 days including food, exercise, mood, sleep, and biometrics.",
    inputSchema: {
      type: "object",
      properties: {
        end_date: { type: "string", description: "End date for the 30-day period (YYYY-MM-DD). Defaults to today." },
      },
    },
  }
];

export const handleCoachTool = async (name: string, args: any) => {
  const { start_date, end_date, days = 7 } = args;

  switch (name) {
    case "get_health_summary":
      const summaryDate = start_date;
      const nutritionRes = await query(
        "SELECT SUM(calories) as total_cals, SUM(protein) as total_protein FROM food_entries fe JOIN foods f ON fe.food_id = f.id WHERE entry_date = $1 AND fe.user_id = $2",
        [summaryDate, MOCK_USER_ID]
      );
      
      const weightRes = await query(
        "SELECT weight FROM check_in_measurements WHERE entry_date <= $1 AND user_id = $2 ORDER BY entry_date DESC LIMIT 1",
        [summaryDate, MOCK_USER_ID]
      );

      return {
        content: [{ 
            type: "text", 
            text: `Health Summary for ${summaryDate}:\n- Calories: ${nutritionRes.rows[0].total_cals || 0} kcal\n- Protein: ${nutritionRes.rows[0].total_protein || 0}g\n- Latest Weight: ${weightRes.rows[0]?.weight || 'No data'} kg` 
        }],
      };

    case "analyze_trends":
        // Logic for comparing avg calories vs weight change
        return { content: [{ type: "text", text: `Trend analysis for the last ${days} days: Feature coming in full Phase 3 implementation!` }] };

    case "get_30_day_trends":
        const endDate = args.end_date ? new Date(args.end_date) : new Date();
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - 30);

        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        const formattedStartDate = formatDate(startDate);
        const formattedEndDate = formatDate(endDate);

        const foodData = await query(
            `SELECT entry_date, SUM(calories) as total_calories, SUM(protein) as total_protein, SUM(carbs) as total_carbs, SUM(fat) as total_fat
             FROM food_entries
             WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
             GROUP BY entry_date ORDER BY entry_date`,
            [MOCK_USER_ID, formattedStartDate, formattedEndDate]
        );

        const exerciseData = await query(
            `SELECT entry_date, SUM(duration_minutes) as total_duration_minutes, SUM(calories_burned) as total_calories_burned
             FROM exercise_entries
             WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
             GROUP BY entry_date ORDER BY entry_date`,
            [MOCK_USER_ID, formattedStartDate, formattedEndDate]
        );

        const moodData = await query(
            `SELECT entry_date, AVG(mood_value) as average_mood
             FROM mood_entries
             WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
             GROUP BY entry_date ORDER BY entry_date`,
            [MOCK_USER_ID, formattedStartDate, formattedEndDate]
        );

        const sleepData = await query(
            `SELECT entry_date, AVG(duration_in_seconds) as average_sleep_seconds, AVG(sleep_score) as average_sleep_score
             FROM sleep_entries
             WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
             GROUP BY entry_date ORDER BY entry_date`,
            [MOCK_USER_ID, formattedStartDate, formattedEndDate]
        );

        const biometricsData = await query(
            `SELECT entry_date, AVG(weight) as average_weight, AVG(steps) as average_steps
             FROM check_in_measurements
             WHERE user_id = $1 AND entry_date BETWEEN $2 AND $3
             GROUP BY entry_date ORDER BY entry_date`,
            [MOCK_USER_ID, formattedStartDate, formattedEndDate]
        );
        
        // Combine data for a comprehensive view
        const combinedData: any = {};
        const addData = (arr: any[], key: string) => {
            arr.forEach(row => {
                const date = row.entry_date;
                if (!combinedData[date]) combinedData[date] = { date };
                combinedData[date][key] = row;
            });
        };

        addData(foodData.rows, "food");
        addData(exerciseData.rows, "exercise");
        addData(moodData.rows, "mood");
        addData(sleepData.rows, "sleep");
        addData(biometricsData.rows, "biometrics");

        return {
            content: [{
                type: "text",
                text: `30-Day Trends (${formattedStartDate} to ${formattedEndDate}):\n` + JSON.stringify(Object.values(combinedData), null, 2)
            }]
        };

    default:
      return null;
  }
};

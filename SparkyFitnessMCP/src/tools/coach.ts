import { query } from "../db.js";
import { MOCK_USER_ID } from "../config.js";

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
  }
];

export const handleCoachTool = async (name: string, args: any) => {
  const { start_date, end_date, days = 7 } = args;

  switch (name) {
    case "get_health_summary":
      const summaryDate = start_date;
      const nutritionRes = await query(
        "SELECT SUM(calories) as total_cals, SUM(protein) as total_protein FROM food_entries fe JOIN foods f ON fe.food_id = f.id WHERE entry_date = $1 AND user_id = $2",
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

    default:
      return null;
  }
};

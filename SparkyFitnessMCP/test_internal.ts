import dotenv from "dotenv";
import path from "path";

// Load environment variables from the root .env
dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

import { handleNutritionTool } from "./src/tools/nutrition.js";
import { handleCoachTool } from "./src/tools/coach.js";
import { poolInstance } from "./src/db.js";

async function runTests() {
  console.log("🚀 Starting Sparky MCP Internal Logic Verification...");

  try {
    // 1. Test Nutrition: Create Food
    console.log("\n--- Testing: manage_food (create) ---");
    const createRes = await handleNutritionTool("manage_food", {
      action: "create",
      food_name: "Int-Test Protein Bar",
      quantity: 1,
      unit: "bar",
      macros: { calories: 200, protein: 15, carbs: 10, fat: 5 },
      brand: "McpTest"
    });
    console.log("Result:", JSON.stringify(createRes, null, 2));

    // 2. Test Nutrition: Log Food
    console.log("\n--- Testing: manage_food (log) ---");
    const logRes = await handleNutritionTool("manage_food", {
      action: "log",
      food_name: "Int-Test Protein Bar",
      quantity: 2,
      unit: "bar",
      meal_type: "snacks"
    });
    console.log("Result:", JSON.stringify(logRes, null, 2));

    // 3. Test Coach: Get Health Summary
    console.log("\n--- Testing: get_health_summary ---");
    const summaryRes = await handleCoachTool("get_health_summary", {
      start_date: new Date().toISOString().split('T')[0]
    });
    console.log("Result:", JSON.stringify(summaryRes, null, 2));

    console.log("\n✅ All logic tests passed!");
  } catch (err) {
    console.error("\n❌ Test failed:", err);
  } finally {
      await poolInstance.end();
      console.log("Disconnected from DB.");
  }
}

runTests();

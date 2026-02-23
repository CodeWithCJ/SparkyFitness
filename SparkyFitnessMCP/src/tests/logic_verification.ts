import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from the root .env
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

import { handleNutritionTool } from "../tools/nutrition.js";
import { handleCoachTool } from "../tools/coach.js";
import { poolInstance } from "../db.js";

async function runTests() {
  console.log("🚀 Starting Sparky MCP Tool Logic Verification...");

  try {
    // 1. Test Nutrition: Create Food
    console.log("\n--- Testing: manage_food (create) ---");
    const createRes = await handleNutritionTool("manage_food", {
      action: "create",
      food_name: "Dosai",
      quantity: 1,
      unit: "piece",
      macros: { calories: 130, protein: 3, carbs: 28, fat: 3 },
      brand: "Home Made"
    });
    console.log("Result:", JSON.stringify(createRes, null, 2));

    // 2. Test Nutrition: Log Food
    console.log("\n--- Testing: manage_food (log) ---");
    const logRes = await handleNutritionTool("manage_food", {
      action: "log",
      food_name: "Dosai",
      quantity: 1,
      unit: "piece",
      meal_type: "dinner"
    });
    console.log("Result:", JSON.stringify(logRes, null, 2));

    // 3. Test Coach: Get Health Summary
    console.log("\n--- Testing: get_health_summary ---");
    const summaryRes = await handleCoachTool("get_health_summary", {
      start_date: new Date().toISOString().split('T')[0]
    });
    console.log("Result:", JSON.stringify(summaryRes, null, 2));

    console.log("\n✅ Tool logic verification complete!");
  } catch (err) {
    console.error("\n❌ Test failed:", err);
  } finally {
      await poolInstance.end();
      console.log("Disconnected from DB.");
  }
}

runTests();

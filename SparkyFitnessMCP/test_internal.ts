import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load environment variables from the root .env
dotenv.config({ path: path.resolve(__dirname, "../.env") });

import { handleNutritionTool } from "./src/tools/food/index.js";
import { poolInstance } from "./src/db.js";

async function runTests() {
  console.log("🚀 Starting Sparky MCP Food Diary Verification...");

  try {
    const today = new Date().toISOString().split('T')[0];

    // 1. Test: Create Food
    console.log("\n--- Testing: create_food ---");
    const createRes = await handleNutritionTool("manage_food", {
      action: "create_food",
      food_name: "MCP Test Apple",
      brand: "Nature",
      macros: { calories: 95, protein: 0.5, carbs: 25, fat: 0.3 },
      quantity: 182,
      unit: "g"
    });
    console.log("Result:", JSON.stringify(createRes, null, 2));

    // 2. Test: Log Food with Unit Conversion (g to kg)
    console.log("\n--- Testing: log_food (with conversion) ---");
    const logRes = await handleNutritionTool("manage_food", {
      action: "log_food",
      food_name: "MCP Test Apple",
      quantity: 0.182,
      unit: "kg", // Should convert to 182g if DB is in g
      meal_type: "breakfast",
      entry_date: today
    });
    console.log("Result:", JSON.stringify(logRes, null, 2));

    // 3. Test: List Diary
    console.log("\n--- Testing: list_diary ---");
    const diaryRes = await handleNutritionTool("manage_food", {
      action: "list_diary",
      entry_date: today
    });
    console.log("Result:", JSON.stringify(diaryRes, null, 2));

    console.log("\n✅ Internal logic tests completed!");
  } catch (err) {
    console.error("\n❌ Test failed:", err);
  } finally {
      await poolInstance.end();
      console.log("Disconnected from DB.");
  }
}

runTests();

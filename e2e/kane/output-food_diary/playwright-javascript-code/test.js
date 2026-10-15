import testmu, { resolveVar, setVar } from '@testmuai/playwright-bindings';
import { expect } from '@playwright/test';

testmu.configure({
  "build": "35863f7c-0a30-4272-bf4e-6fa9d48bcab5",
  "name": "Log Custom Food to Breakfast",
  "tcId": "TC-199",
  "network": (process.env.NETWORK ?? "false").toLowerCase() === "true",
  "autoHealVersion": "AH2",
  "defaultActionTimeoutMs": 10000,
  "defaultNavigationTimeoutMs": 60000,
  "kaneRunV4": true
});

testmu.test("Log Custom Food to Breakfast", async (page) => {
  let element_9, element_0, element_1, element_2, element_13, element_14, element_15, element_16, element_17, element_3, element_4, element_5, element_6, element_7, element_23, element_24, element_8, element_26, element_27, element_28;
  await testmu.step("Navigate to http://localhost:3004/login", { instructionId: "bde61df2-5f96-492c-9559-4d88b2472557" }, async () => {
    await page.goto("http://localhost:3004/login");
  });
  
  await testmu.step("Clicking the Sign Up tab", { instructionId: "1a97c7e7-4fcd-4e66-85c6-bfc3bc61c6bb" }, async () => {
    element_9 = page.locator("internal:role=tab[name=\"Sign Up\"i]");
    await element_9.click();
  });
  
  await testmu.step("Waiting for the queued plan steps to complete", { instructionId: "0f9d1f10-d86c-4b58-af5f-72593957a80e" }, async () => {
    await page.waitForTimeout(1000);
  });
  
  await testmu.step("Type \"Jamie Cook\" into \"Full Name\"", { instructionId: "a42422e7-76e8-4e55-a64d-7342a20adeea" }, async () => {
    element_0 = page.locator("internal:role=textbox[name=\"Full Name\"i]");
    await element_0.click();
    await element_0.fill("Jamie Cook");
  });
  
  await testmu.step("Waiting for the email input field to be ready", { instructionId: "6d78b766-18c6-4ad3-a674-d24e65bc56ee" }, async () => {
    await page.waitForTimeout(1000);
  });
  
  await testmu.step("Type \"jamie.cook@example.com\" into \"Email\"", { instructionId: "548ed9ec-8c68-4583-bf8b-bc1bfc988e5e" }, async () => {
    element_1 = page.locator("internal:role=textbox[name=\"Email\"i]");
    await element_1.click();
    await element_1.fill("jamie.cook@example.com");
  });
  
  await testmu.step("Waiting while the plan steps are queued", { instructionId: "c2d59b85-00f5-4aef-ba02-8b9303080248" }, async () => {
    await page.waitForTimeout(1000);
  });
  
  await testmu.step("Type \"CookPass123!\" into \"Password\"", { instructionId: "b5adea32-b6e3-47b2-9f99-222a680f9b8b" }, async () => {
    element_2 = page.locator("internal:role=textbox[name=\"Password\"i]");
    await element_2.click();
    await element_2.fill("CookPass123!");
  });
  
  await testmu.step("Clicking Sign Up submit button", { instructionId: "b5991fc7-053b-4a74-8053-9c5e9f7756e0" }, async () => {
    element_13 = page.locator("internal:role=button[name=\"Sign Up\"i]");
    await element_13.click();
  });
  
  await testmu.step("Checking whether the announcement dialog is present", async () => {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
    setVar("cp_1", await testmu.textualAnalyzer(page, { wrappedJs: "(els) => {\n  const __m = {2: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(2) !== null);\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators: ["internal:role=alertdialog[name=\"SparkyFitness Sponsorship! \ud83c\udf1f\"i]"], query: "whether the announcement dialog is present", expectedValue: "true", needsUnitConversion: false, operator: "equals", transforms: [], condition: "An announcement dialog appears." }));
  });
  
  if (await testmu.evaluateBranch([{"description": "An announcement dialog appears.", "store_key": "cp_1", "expected_value": "true", "operator": "equals", "transforms": []}], "and")) {
    await testmu.step("Clicking dismiss announcement button to hide it", { instructionId: "df59344c-0f74-40cc-9262-33b75b51309a" }, async () => {
      element_14 = page.locator("internal:role=button[name=\"Got it, don't show again\"i]");
      await element_14.click();
    });
  } else {
    page = await testmu.executeKaneCli("do nothing", page);
  }
  
  await testmu.step("Clicking Skip onboarding button", { instructionId: "d41a9559-de5d-4930-89a1-2718ec87ce64" }, async () => {
    element_15 = page.locator("internal:role=button[name=\"Skip\"i]");
    await element_15.click();
  });
  
  await testmu.step("Checking whether the diary meal sections are present", async () => {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
    setVar("diary_shown_check", await testmu.textualAnalyzer(page, { wrappedJs: "(els) => {\n  const __m = {53: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(53).textContent.trim() === 'Breakfast');\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators: ["internal:role=heading[name=\"Breakfast\"i]"], query: "whether the diary meal sections are shown", expectedValue: "true", needsUnitConversion: false, operator: "equals", transforms: [], condition: "The diary is shown." }));
  });
  
  await testmu.step("whether the Breakfast diary section is empty", { instructionId: "93de9d48-820f-4b96-b058-d2bd682ab63c" }, async () => {
    setVar("breakfast_section_empty_check", await testmu.visionQuery(page, "whether the Breakfast diary section is empty", ""));
  });
  
  await testmu.step("Assertion check", { instructionId: "040e5b82-ebda-4233-9d95-eca0c4f561c4" }, async () => {
    await testmu.verifyAssertion(page, "Assertion check", {"operator": ["equals"], "assertion_operands": [], "left_operand": null, "right_operand": null, "operands": [], "sub_results": [{"description": "The diary is shown.", "passed": true, "operator": "equals", "transforms": [], "json_path": null, "expected": "true", "extracted_value": "{{diary_shown_check}}", "store_key": "diary_shown_check", "variable_refs": {"{{diary_shown_check}}": "true"}}, {"description": "The \"Breakfast\" section is empty.", "passed": true, "operator": "equals", "transforms": [], "json_path": null, "expected": "true", "extracted_value": "{{breakfast_section_empty_check}}", "store_key": "breakfast_section_empty_check", "variable_refs": {"{{breakfast_section_empty_check}}": "true"}}], "sub_checks": [{"description": "The diary is shown.", "store_key": "diary_shown_check", "expected_value": "true", "extracted_value": "{{diary_shown_check}}", "operator": "equals", "transforms": []}, {"description": "The \"Breakfast\" section is empty.", "store_key": "breakfast_section_empty_check", "expected_value": "true", "extracted_value": "{{breakfast_section_empty_check}}", "operator": "equals", "transforms": []}], "composite_operator": "and", "claim": "the diary is shown with an empty \"Breakfast\" section"});
  });
  
  await testmu.step("Clicking Add Food to button in Breakfast section", { instructionId: "4106df19-2d5b-4bbc-8346-179448babea7" }, async () => {
    element_16 = page.locator("internal:role=button[name=\"Add Food to\"i] >> nth=0");
    await element_16.click();
  });
  
  await testmu.step("Clicking Custom Food option", { instructionId: "b30d2827-af55-495d-a36d-270e7d59c24a" }, async () => {
    element_17 = page.locator("internal:role=button[name=\"Custom Food\"i]");
    await element_17.click();
  });
  
  await testmu.step("Waiting for the Food Name field to open", { instructionId: "9a8fdc95-27c2-4f8b-9f22-501723dfd36a" }, async () => {
    await page.waitForTimeout(1000);
  });
  
  await testmu.step("Type \"Greek Yogurt Bowl\" into \"Food Name *\"", { instructionId: "bbd387d5-829d-4bf2-b253-fe898442ef73" }, async () => {
    element_3 = page.locator("internal:role=textbox[name=\"Food Name *\"i]");
    await element_3.click();
    await element_3.fill("Greek Yogurt Bowl");
  });
  
  await testmu.step("Type \"100\" into \"Serving Size\"", { instructionId: "f26bcb96-b48c-403b-a29e-feaacb018faf" }, async () => {
    element_4 = page.locator("internal:role=spinbutton[name=\"Serving Size\"i]");
    await element_4.click();
    await element_4.fill("100");
  });
  
  await testmu.step("Type \"150\" into \"Calories (kcal)\"", { instructionId: "c25d6fa8-6268-4819-9482-6aa8dd0009df" }, async () => {
    element_5 = page.locator("internal:role=spinbutton[name=\"Calories (kcal)\"i]");
    await element_5.click();
    await element_5.fill("150");
  });
  
  await testmu.step("Type \"10\" into \"Protein (g)\"", { instructionId: "5b84c2bb-5fa2-41e6-b629-4ef03f3e8eae" }, async () => {
    element_6 = page.locator("internal:role=spinbutton[name=\"Protein (g)\"i]");
    await element_6.click();
    await element_6.fill("10");
  });
  
  await testmu.step("Scroll into view: PRIMARY: Add Food button; role=button; text=\"Add Food\" | HINTS: bottom of Add New Food dialog", { instructionId: "c684c6a0-1875-4a6b-a431-472beb9d3e95" }, async () => {
    element_7 = page.locator("internal:role=button[name=\"Add Food\"i]");
    await element_7.evaluate(el => el.scrollIntoView({block: 'center'}));
  });
  
  await testmu.step("Click \"Add Food\"", { instructionId: "b70aeabd-719f-4478-b29a-8564db7d0abc" }, async () => {
    element_23 = page.locator("internal:role=button[name=\"Add Food\"i]");
    await element_23.click();
  });
  
  await testmu.step("Clicking Add to Meal button for Add Greek Yogurt Bowl dialog", { instructionId: "a6c4be5d-dff9-47a6-87e6-a6120dea170a" }, async () => {
    element_24 = page.locator("internal:role=button[name=\"Add to Meal\"i]");
    await element_24.click();
  });
  
  await testmu.step("Scroll into view: PRIMARY: Close button; role=button; text=\"Close\" | HINTS: bottom of Add New Food dialog", { instructionId: "49292b81-abad-4d5c-9673-e4d0cad9d96b" }, async () => {
    element_8 = page.locator("internal:role=button[name=\"Close\"i]");
    await element_8.evaluate(el => el.scrollIntoView({block: 'center'}));
  });
  
  await testmu.step("Clicking Close button to close Add New Food dialog", { instructionId: "f95bc5ac-366c-4e3f-b085-ab950c2a32f3" }, async () => {
    element_26 = page.locator("internal:role=button[name=\"Close\"i]");
    await element_26.click();
  });
  
  await testmu.step("Clicking Close button", { instructionId: "a1488117-3463-4879-8ced-0aacc6b9e67a" }, async () => {
    element_27 = page.locator("internal:role=button[name=\"Close\"i]");
    await element_27.click();
  });
  
  await testmu.step("Clicking Close button", { instructionId: "105c8521-c5a3-467d-bfcb-b29f65b70d82" }, async () => {
    element_28 = page.locator("internal:role=button[name=\"Close\"i]");
    await element_28.click();
  });
  
  await testmu.step("Waiting briefly while confirming the closed add-food dialog and Breakfast state", { instructionId: "5cf17ea3-159e-43c7-9733-4aed7494af9a" }, async () => {
    await page.waitForTimeout(1000);
  });
  
  await testmu.step("Reading the calorie amount for Greek Yogurt Bowl", async () => {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
    setVar("breakfast_greek_yogurt_bowl_calories", await testmu.textualAnalyzer(page, { wrappedJs: "(els) => {\n  const __m = {163: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(163).innerText);\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators: ["internal:text=\"150 kcal\"i >> nth=1"], query: "the calorie amount displayed for Greek Yogurt Bowl in the Breakfast section", expectedValue: "150 kcal", needsUnitConversion: false, operator: "equals", transforms: ["strip"], condition: "The \"Breakfast\" section shows 150 kcal for \"Greek Yogurt Bowl\"." }));
  });
  
  await testmu.step("Assertion check", { instructionId: "c8618a04-dbca-4365-acf6-fcf201cd8a0d" }, async () => {
    await testmu.verifyAssertion(page, "Assertion check", {"operator": ["equals"], "assertion_operands": [], "left_operand": null, "right_operand": null, "operands": [], "sub_results": [{"description": "The \"Breakfast\" section shows 150 kcal for \"Greek Yogurt Bowl\".", "passed": true, "operator": "equals", "transforms": ["strip"], "json_path": null, "expected": "150 kcal", "extracted_value": "{{breakfast_greek_yogurt_bowl_calories}}", "store_key": "breakfast_greek_yogurt_bowl_calories", "variable_refs": {"{{breakfast_greek_yogurt_bowl_calories}}": "150 kcal"}}], "sub_checks": [{"description": "The \"Breakfast\" section shows 150 kcal for \"Greek Yogurt Bowl\".", "store_key": "breakfast_greek_yogurt_bowl_calories", "expected_value": "150 kcal", "extracted_value": "{{breakfast_greek_yogurt_bowl_calories}}", "operator": "equals", "transforms": ["strip"]}], "composite_operator": "and", "claim": "the \"Breakfast\" section shows 150 kcal for \"Greek Yogurt Bowl\""});
  });
  
  await testmu.step("Waiting for the daily energy summary to refresh", { instructionId: "d6bebab5-b957-462d-8289-91429cbc64e4" }, async () => {
    await page.waitForTimeout(3000);
  });
  
  await testmu.step("Reading the eaten calories from the daily energy summary", async () => {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
    setVar("daily_energy_summary_eaten_calories", await testmu.textualAnalyzer(page, { wrappedJs: "(els) => {\n  const __m = {25: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (Array.from(el(25).querySelectorAll('div')).find(x => x.textContent.replace(/\\s+/g, '') === '150kcaleaten')?.textContent.trim() ?? null);\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators: [".react-grid-layout"], query: "the eaten calorie amount in the daily energy summary", expectedValue: "150 kcal", needsUnitConversion: false, operator: "equals", transforms: ["extract_number"], condition: "The daily energy summary shows 150 kcal eaten." }));
  });
  
  await testmu.step("Assertion check", { instructionId: "65cf21ce-8e87-4c43-8f76-2d63c7f8f20e" }, async () => {
    await testmu.verifyAssertion(page, "Assertion check", {"operator": ["equals"], "assertion_operands": [], "left_operand": null, "right_operand": null, "operands": [], "sub_results": [{"description": "The daily energy summary shows 150 kcal eaten.", "passed": true, "operator": "equals", "transforms": ["extract_number"], "json_path": null, "expected": "150 kcal", "extracted_value": "{{daily_energy_summary_eaten_calories}}", "store_key": "daily_energy_summary_eaten_calories", "variable_refs": {"{{daily_energy_summary_eaten_calories}}": "150kcal eaten"}}], "sub_checks": [{"description": "The daily energy summary shows 150 kcal eaten.", "store_key": "daily_energy_summary_eaten_calories", "expected_value": "150 kcal", "extracted_value": "{{daily_energy_summary_eaten_calories}}", "operator": "equals", "transforms": ["extract_number"]}], "composite_operator": "and", "claim": "the daily energy summary shows 150 kcal eaten"});
  });
});

testmu.run();
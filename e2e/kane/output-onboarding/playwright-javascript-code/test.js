import testmu, { resolveVar, setVar } from '@testmuai/playwright-bindings';
import { expect } from '@playwright/test';

testmu.configure({
  "build": "89e9c4e0-e417-47af-af6d-16c416937c85",
  "name": "Complete User Onboarding and Start Personalized Plan",
  "tcId": "TC-198",
  "network": (process.env.NETWORK ?? "false").toLowerCase() === "true",
  "autoHealVersion": "AH2",
  "defaultActionTimeoutMs": 10000,
  "defaultNavigationTimeoutMs": 60000,
  "kaneRunV4": true
});

testmu.test("Complete User Onboarding and Start Personalized Plan", async (page) => {
  let element_9, element_0, element_1, element_2, element_13, element_14, element_15, element_16, element_3, element_18, element_19, element_4, element_21, element_22, element_5, element_6, element_25, element_26, element_27, element_7, element_29, element_30, element_31, element_32, element_33, element_8, element_35;
  await testmu.step("Navigate to http://localhost:3004/login", { instructionId: "c6a99d64-a4d0-4346-8870-84bd8450d5d0" }, async () => {
    await page.goto("http://localhost:3004/login");
  });
  
  await testmu.step("Clicking the Sign Up tab", { instructionId: "52e12f79-0d6a-43df-ae5c-019fd4e265a9" }, async () => {
    element_9 = page.locator("internal:role=tab[name=\"Sign Up\"i]");
    await element_9.click();
  });
  
  await testmu.step("Waiting for the form fields to finish processing", { instructionId: "ef745fa9-41bd-49d6-935c-6b0ff9b97566" }, async () => {
    await page.waitForTimeout(1000);
  });
  
  await testmu.step("Type \"Alex Runner\" into \"Full Name\"", { instructionId: "001d0ba5-c06f-4671-a7fe-dcd6f9313603" }, async () => {
    element_0 = page.locator("internal:role=textbox[name=\"Full Name\"i]");
    await element_0.click();
    await element_0.fill("Alex Runner");
  });
  
  await testmu.step("Waiting for the Sign Up form to be ready", { instructionId: "dfb8d86f-31e1-4261-a35d-2b205004005f" }, async () => {
    await page.waitForTimeout(1000);
  });
  
  await testmu.step("Type \"alex.runner@example.com\" into \"Email\"", { instructionId: "bc55c60a-6b49-4583-bc75-571f8a1aa0ff" }, async () => {
    element_1 = page.locator("internal:role=textbox[name=\"Email\"i]");
    await element_1.click();
    await element_1.fill("alex.runner@example.com");
  });
  
  await testmu.step("Typing the password into the password field", { instructionId: "9a5f1405-ae5c-46ec-bf47-b0383e8c18a7" }, async () => {
    element_2 = page.locator("internal:role=textbox[name=\"Password\"i]");
    await element_2.click();
    await element_2.fill("RunnerPass123!");
  });
  
  await testmu.step("Clicking Sign Up submit button", { instructionId: "74bfb5e4-6403-4358-bb22-ae4857d5a11f" }, async () => {
    element_13 = page.locator("internal:role=button[name=\"Sign Up\"i]");
    await element_13.click();
  });
  
  await testmu.step("Checking whether the announcement dialog is present", async () => {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
    setVar("cp_1", await testmu.textualAnalyzer(page, { wrappedJs: "(els) => {\n  const __m = {2: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(2).getAttribute('role') === 'alertdialog');\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators: ["internal:role=alertdialog[name=\"SparkyFitness Sponsorship! \ud83c\udf1f\"i]"], query: "whether the announcement dialog is present", expectedValue: "true", needsUnitConversion: false, operator: "equals", transforms: [], condition: "An announcement dialog appears." }));
  });
  
  if (await testmu.evaluateBranch([{"description": "An announcement dialog appears.", "store_key": "cp_1", "expected_value": "true", "stored_value": "{{cp_1}}", "operator": "equals", "transforms": []}], "and")) {
    await testmu.step("Clicking dismissing the announcement dialog button", { instructionId: "9f63fc21-a9d1-4098-87bc-d2debcfc6734" }, async () => {
      element_14 = page.locator("internal:role=button[name=\"Got it, don't show again\"i]");
      await element_14.click();
    });
  }
  
  await testmu.step("Checking whether the onboarding sex question is shown", async () => {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
    setVar("onboarding_sex_question_shown", await testmu.textualAnalyzer(page, { wrappedJs: "(els) => {\n  const __m = {5: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(5).textContent.trim() === 'What is your sex?');\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators: ["internal:role=heading[name=\"What is your sex?\"i]"], query: "whether the onboarding question \"What is your sex?\" is shown", expectedValue: "true", needsUnitConversion: false, operator: "equals", transforms: [], condition: "The onboarding question \"What is your sex?\" is shown." }));
  });
  
  await testmu.step("Assertion check", { instructionId: "bc43c79d-d1e0-4cc2-8b37-ce76fdba7034" }, async () => {
    await testmu.verifyAssertion(page, "Assertion check", {"operator": ["equals"], "assertion_operands": [], "left_operand": null, "right_operand": null, "operands": [], "sub_results": [{"description": "The onboarding question \"What is your sex?\" is shown.", "passed": true, "operator": "equals", "transforms": [], "json_path": null, "expected": "true", "extracted_value": "{{onboarding_sex_question_shown}}", "store_key": "onboarding_sex_question_shown", "variable_refs": {"{{onboarding_sex_question_shown}}": "true"}}], "sub_checks": [{"description": "The onboarding question \"What is your sex?\" is shown.", "store_key": "onboarding_sex_question_shown", "expected_value": "true", "extracted_value": "{{onboarding_sex_question_shown}}", "operator": "equals", "transforms": []}], "composite_operator": "and", "claim": "Verify the onboarding question \"What is your sex?\" is shown."});
  });
  
  await testmu.step("Clicking the Male sex option button", { instructionId: "e582b61b-02fb-41ed-b27d-5b35da801d54" }, async () => {
    element_15 = page.locator("internal:role=button[name=\"Male\"s]");
    await element_15.click();
  });
  
  await testmu.step("Clicking Lose weight selection button", { instructionId: "e43cd648-b6cb-44f3-b575-41a4e28b94d1" }, async () => {
    element_16 = page.locator("internal:role=button[name=\"Lose weight\"i]");
    await element_16.click();
  });
  
  await testmu.step("Waiting for the queued plan to start", { instructionId: "71b7bf51-acff-44ea-9c79-dbaffe6cb013" }, async () => {
    await page.waitForTimeout(1000);
  });
  
  await testmu.step("Type \"90\" into \"spinbutton\"", { instructionId: "d1e0534a-3aee-474b-8ee0-df699310680f" }, async () => {
    element_3 = page.locator("#current-weight");
    await element_3.click();
    await element_3.fill("90");
  });
  
  await testmu.step("Click \"Continue\"", { instructionId: "28c2c222-8a3c-43ee-8734-843f5c6ecde7" }, async () => {
    element_18 = page.locator("internal:role=button[name=\"Continue\"i]");
    await element_18.click();
  });
  
  await testmu.step("Clicking the Continue button", { instructionId: "84e886f1-83fe-4a09-96f3-8ff97248d8f5" }, async () => {
    element_19 = page.locator("internal:role=button[name=\"Continue\"i]");
    await element_19.click();
  });
  
  await testmu.step("Entering height 180 cm", { instructionId: "02434c47-c0d5-4911-91fb-07dd92c6d519" }, async () => {
    element_4 = page.locator("#height");
    await element_4.click();
    await element_4.fill("180");
  });
  
  await testmu.step("Pressing the Tab key to blur the height input and update validation", { instructionId: "b90070d8-9017-4a33-8fbb-33f8096ef3b9" }, async () => {
    await page.keyboard.press("Tab");
  });
  
  await testmu.step("Clicking Continue button", { instructionId: "03bb7fe2-685b-4320-9fc1-d2a983c530ba" }, async () => {
    element_21 = page.locator("internal:role=button[name=\"Continue\"i]");
    await element_21.click();
  });
  
  await testmu.step("Clicking the Pick a date button under the date-of-birth combobox", { instructionId: "6d37b301-b1c4-4993-874e-ebab2765ec6e" }, async () => {
    element_22 = page.locator("internal:role=button[name=\"Pick a date\"i]");
    await element_22.click();
  });
  
  await testmu.step("Waiting for queued plan steps to complete", { instructionId: "81dee02a-5245-4998-bd60-8197704f4c15" }, async () => {
    await page.waitForTimeout(1000);
  });
  
  await testmu.step("Select \"Jan\" in \"Choose the Month\"", { instructionId: "2a6b9e24-7c35-412f-a747-2ebbde7f3bb8" }, async () => {
    element_5 = page.locator("internal:label=\"Choose the Month\"i");
    await element_5.selectOption();
  });
  
  await testmu.step("Selecting calendar year 1990", { instructionId: "696c54c2-8858-4f00-87e8-834ebcb16f80" }, async () => {
    element_6 = page.locator("internal:label=\"Choose the Year\"i");
    await element_6.selectOption();
  });
  
  await testmu.step("Clicking January 15, 1990 date button", { instructionId: "efdd5a38-f7e4-4a61-9bd3-df704c157ce1" }, async () => {
    element_25 = page.locator("internal:role=button[name=\"Monday, January 15th,\"i]");
    await element_25.click();
  });
  
  await testmu.step("Pressing Escape key", { instructionId: "1c92242f-a501-4469-845d-ce81cb56b38f" }, async () => {
    await page.keyboard.press("Escape");
  });
  
  await testmu.step("Clicking Continue button below the date of birth field", { instructionId: "9ab2c6a0-11b9-433d-873d-00333bd92a03" }, async () => {
    element_26 = page.locator("internal:role=button[name=\"Continue\"i]");
    await element_26.click();
  });
  
  await testmu.step("Clicking Low (<15%) body fat option", { instructionId: "826b53ec-6110-4993-8ecf-bc537312ed56" }, async () => {
    element_27 = page.locator("internal:role=button[name=\"Low (<15%)\"i]");
    await element_27.click();
  });
  
  await testmu.step("Typing 80 into target weight input", { instructionId: "79b252d9-205c-4ac8-ba9d-954f8feabd68" }, async () => {
    element_7 = page.locator("#target-weight");
    await element_7.click();
    await element_7.fill("80");
  });
  
  await testmu.step("Pressing the Tab key to commit the target weight input", { instructionId: "ec1b656d-1c91-490d-9c44-6f3043069634" }, async () => {
    await page.keyboard.press("Tab");
  });
  
  await testmu.step("Clicking Continue button", { instructionId: "5a5db7d7-cde2-4ae2-90c0-a122ba101cd0" }, async () => {
    element_29 = page.locator("internal:role=button[name=\"Continue\"i]");
    await element_29.click();
  });
  
  await testmu.step("Clicking 3 meals per day option", { instructionId: "48edb7a0-5fe1-40f3-8230-c62502d4245f" }, async () => {
    element_30 = page.locator("internal:role=button[name=\"3 meals per day\"i]");
    await element_30.click();
  });
  
  await testmu.step("Clicking Moderate (3-5 days/week) Moderate exercise or sports option", { instructionId: "1a937751-2455-4c71-a1f6-84dfd777ffae" }, async () => {
    element_31 = page.locator("internal:role=button[name=\"Moderate (3-5 days/week)\"i]");
    await element_31.click();
  });
  
  await testmu.step("Clicking No for burned calorie choice", { instructionId: "8786fbc8-8cdf-4712-8b5e-94a18db79498" }, async () => {
    element_32 = page.locator("internal:role=button[name=\"No\"i]");
    await element_32.click();
  });
  
  await testmu.step("Clicking Continue button", { instructionId: "dadb04ec-4bd1-4eaf-b8c9-b00e88a06aaf" }, async () => {
    element_33 = page.locator("internal:role=button[name=\"Continue\"i]");
    await element_33.click();
  });
  
  await testmu.step("Waiting for the personalized plan screen to finish loading", { instructionId: "8a7913bd-55d4-4d82-b3af-6d688e648e8d" }, async () => {
    await page.waitForTimeout(1000);
  });
  
  await testmu.step("Checking whether the personalized plan screen is present", async () => {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
    setVar("personalized_plan_screen_shown", await testmu.textualAnalyzer(page, { wrappedJs: "(els) => {\n  const __m = {5: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(5).textContent.trim() === 'Your Personal Plan');\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators: ["internal:role=heading[name=\"Your Personal Plan\"i]"], query: "whether the personalized plan screen is shown", expectedValue: "true", needsUnitConversion: false, operator: "equals", transforms: [], condition: "the personalized plan screen is shown" }));
  });
  
  await testmu.step("Reading the daily calorie target from the calorie budget", async () => {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
    setVar("daily_calorie_target_shown", await testmu.textualAnalyzer(page, { wrappedJs: "(els) => {\n  const __m = {14: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (el(14).value || el(14).textContent.trim());\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators: ["internal:role=spinbutton >> nth=0"], query: "the daily calorie target shown in the calorie budget", expectedValue: "0", needsUnitConversion: false, operator: "gt", transforms: ["string_to_float"], condition: "a daily calorie target is shown" }));
  });
  
  await testmu.step("Assertion check", { instructionId: "1794bd31-fd29-41c7-a575-8d1c47086bc3" }, async () => {
    await testmu.verifyAssertion(page, "Assertion check", {"operator": ["equals"], "assertion_operands": [], "left_operand": null, "right_operand": null, "operands": [], "sub_results": [{"description": "the personalized plan screen is shown", "passed": true, "operator": "equals", "transforms": [], "json_path": null, "expected": "true", "extracted_value": "{{personalized_plan_screen_shown}}", "store_key": "personalized_plan_screen_shown", "variable_refs": {"{{personalized_plan_screen_shown}}": "true"}}, {"description": "a daily calorie target is shown", "passed": true, "operator": "gt", "transforms": ["string_to_float"], "json_path": null, "expected": "0", "extracted_value": "{{daily_calorie_target_shown}}", "store_key": "daily_calorie_target_shown", "variable_refs": {"{{daily_calorie_target_shown}}": "2440"}}], "sub_checks": [{"description": "the personalized plan screen is shown", "store_key": "personalized_plan_screen_shown", "expected_value": "true", "extracted_value": "{{personalized_plan_screen_shown}}", "operator": "equals", "transforms": []}, {"description": "a daily calorie target is shown", "store_key": "daily_calorie_target_shown", "expected_value": "0", "extracted_value": "{{daily_calorie_target_shown}}", "operator": "gt", "transforms": ["string_to_float"]}], "composite_operator": "and", "claim": "the personalized plan screen is shown with a daily calorie target"});
  });
  
  await testmu.step("Scroll into view: PRIMARY: start personalized cascading plan button; role=button; text=\"Start 6-Month Cascading Plan\" | HINTS: lower section of the Personal Plan page", { instructionId: "eae5a001-de23-4f94-af6a-fdeb980cfd66" }, async () => {
    element_8 = page.locator("internal:role=button[name=\"Start 6-Month Cascading Plan\"i]");
    await element_8.evaluate(el => el.scrollIntoView({block: 'center'}));
  });
  
  await testmu.step("Clicking Start 6-Month Cascading Plan button", { instructionId: "d8492dc3-5d8b-4c51-b023-647e2f0c09f9" }, async () => {
    element_35 = page.locator("internal:role=button[name=\"Start 6-Month Cascading Plan\"i]");
    await element_35.click();
  });
  
  await testmu.step("Waiting for the main dashboard to settle", { instructionId: "c00351b0-b2a3-4242-a89d-66bbe8bbeffe" }, async () => {
    await page.waitForTimeout(1000);
  });
  
  await testmu.step("whether the onboarding wizard is visible", { instructionId: "e6375937-2b9c-4d45-abcc-b32aaef2763a" }, async () => {
    setVar("onboarding_wizard_closed", await testmu.visionQuery(page, "whether the onboarding wizard is visible", ""));
  });
  
  await testmu.step("Checking whether the main dashboard is shown", async () => {
    await page.waitForLoadState("domcontentloaded", { timeout: 5000 });
    setVar("main_dashboard_shown", await testmu.textualAnalyzer(page, { wrappedJs: "(els) => {\n  const __m = {37: 0};\n  const el = (i) => els[__m[i]];\n  const __v = (!!el(37) && el(37).textContent.trim() === 'Nutrition Summary');\n  return (typeof __v === 'boolean' ? String(__v) : __v);\n}", locators: ["internal:role=heading[name=\"Nutrition Summary\"i]"], query: "whether the main dashboard nutrition summary is shown", expectedValue: "true", needsUnitConversion: false, operator: "equals", transforms: [], condition: "the main dashboard is shown" }));
  });
  
  await testmu.step("Assertion check", { instructionId: "4cb78832-2cac-4556-90da-84f9dcdd842c" }, async () => {
    await testmu.verifyAssertion(page, "Assertion check", {"operator": ["equals"], "assertion_operands": [], "left_operand": null, "right_operand": null, "operands": [], "sub_results": [{"description": "the onboarding wizard closes", "passed": true, "operator": "equals", "transforms": [], "json_path": null, "expected": "false", "extracted_value": "{{onboarding_wizard_closed}}", "store_key": "onboarding_wizard_closed", "variable_refs": {"{{onboarding_wizard_closed}}": "false"}}, {"description": "the main dashboard is shown", "passed": true, "operator": "equals", "transforms": [], "json_path": null, "expected": "true", "extracted_value": "{{main_dashboard_shown}}", "store_key": "main_dashboard_shown", "variable_refs": {"{{main_dashboard_shown}}": "true"}}], "sub_checks": [{"description": "the onboarding wizard closes", "store_key": "onboarding_wizard_closed", "expected_value": "false", "extracted_value": "{{onboarding_wizard_closed}}", "operator": "equals", "transforms": []}, {"description": "the main dashboard is shown", "store_key": "main_dashboard_shown", "expected_value": "true", "extracted_value": "{{main_dashboard_shown}}", "operator": "equals", "transforms": []}], "composite_operator": "and", "claim": "the onboarding wizard closes and the main dashboard is shown"});
  });
});

testmu.run();